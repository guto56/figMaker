export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  FILES: KVNamespace
  AI: Ai
  PUBLISH_LIMIT: RateLimit
  KLIPY_KEY: string
  FREESOUND_KEY: string
}

const UA = 'Mozilla/5.0 (compatible; Zapfig/1.0; +https://zapfig.hrycsngb42.workers.dev)'
const PROXY_HOSTS = ['imgflip.com', 'klipy.com', 'klipy.co', 'myinstants.com', 'freesound.org']

const json = (d: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } })
const err = (msg: string, status = 400) => json({ error: msg }, status)
const cacheHdr = (s: number) => ({ 'cache-control': `public, max-age=${s}` })

function hostAllowed(h: string) {
  return PROXY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))
}

const proxied = (u: string) => `/api/proxy?u=${encodeURIComponent(u)}`

/* ---------------- memes (Imgflip) ---------------- */
async function imgflip() {
  const r = await fetch('https://api.imgflip.com/get_memes', { cf: { cacheTtl: 86400 } })
  if (!r.ok) return err('upstream', 502)
  const d: any = await r.json()
  const items = (d?.data?.memes ?? []).map((m: any) => ({
    id: `imgflip-${m.id}`,
    title: m.name,
    preview: proxied(m.url),
    full: proxied(m.url),
    kind: 'image',
    width: m.width,
    height: m.height,
  }))
  return json({ items, next: null }, 200, cacheHdr(3600))
}

/* ---------------- KLIPY (GIFs, stickers, clips) ---------------- */
type Found = { url: string; ext: string; path: string; w?: number; h?: number }
function collect(o: any, path = '', out: Found[] = []): Found[] {
  if (!o || typeof o !== 'object') return out
  if (typeof o.url === 'string') {
    const ext = (o.url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
    out.push({ url: o.url, ext, path, w: o.width, h: o.height })
  }
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v) && k !== 'url') {
      const ext = (v.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
      out.push({ url: v, ext, path: `${path}.${k}` })
    } else if (v && typeof v === 'object') collect(v, `${path}.${k}`, out)
  }
  return out
}
const sizeRank = (p: string) => (p.includes('xs') ? 0 : p.includes('sm') ? 1 : p.includes('md') ? 2 : p.includes('hd') ? 3 : 2)
function pick(list: Found[], exts: string[], prefer: 'small' | 'big') {
  const c = list.filter((f) => exts.includes(f.ext))
  c.sort((a, b) => (prefer === 'small' ? sizeRank(a.path) - sizeRank(b.path) : sizeRank(b.path) - sizeRank(a.path)))
  return c[0]
}
function findArray(d: any): any[] {
  if (Array.isArray(d)) return d
  if (d && typeof d === 'object') for (const k of ['data', 'results', 'items']) if (d[k]) { const a = findArray(d[k]); if (a.length) return a }
  return []
}

async function klipy(env: Env, url: URL) {
  if (!env.KLIPY_KEY) return err('KLIPY não configurado', 503)
  const type = ({ gifs: 'gifs', stickers: 'stickers', clips: 'clips' } as Record<string, string>)[url.searchParams.get('type') ?? 'gifs'] ?? 'gifs'
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) | 0)
  const base = `https://api.klipy.com/api/v1/${env.KLIPY_KEY}/${type}`
  const qs = new URLSearchParams({ page: String(page), per_page: '24', customer_id: 'zapfig-web', locale: 'pt_BR', content_filter: 'medium' })
  if (q) qs.set('q', q)
  const r = await fetch(`${base}/${q ? 'search' : 'trending'}?${qs}`, { headers: { 'user-agent': UA }, cf: { cacheTtl: 600 } })
  if (!r.ok) return err(`KLIPY respondeu ${r.status}`, 502)
  const d: any = await r.json()
  const arr = findArray(d)
  const items = arr
    .map((it: any) => {
      const files = collect(it.file ?? it.files ?? it)
      const preview = pick(files, ['webp', 'gif', 'png', 'jpg'], 'small')
      const video = pick(files, ['mp4', 'webm'], 'big')
      const still = pick(files, type === 'stickers' ? ['gif', 'webp', 'png'] : ['gif', 'webp'], 'big')
      if (!preview && !video) return null
      return {
        id: `klipy-${type}-${it.id ?? it.slug}`,
        title: it.title ?? it.slug ?? '',
        preview: proxied((preview ?? still ?? video)!.url),
        previewVideo: !preview && video ? proxied(video.url) : null,
        full: proxied(((type === 'stickers' ? still : video) ?? still ?? preview)!.url),
        kind: type === 'stickers' && still && still.ext !== 'gif' ? 'image' : 'video',
        hasAudio: type === 'clips',
        width: still?.w ?? preview?.w,
        height: still?.h ?? preview?.h,
      }
    })
    .filter(Boolean)
  const hasNext = d?.data?.has_next ?? d?.has_next ?? items.length >= 24
  return json({ items, next: hasNext ? page + 1 : null }, 200, cacheHdr(300))
}

/* ---------------- sons: MyInstants e Freesound ---------------- */
function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()
}

async function myinstants(url: URL) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) | 0)
  const target = q
    ? `https://www.myinstants.com/pt/search/?name=${encodeURIComponent(q)}&page=${page}`
    : `https://www.myinstants.com/pt/index/br/?page=${page}`
  const r = await fetch(target, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9' }, cf: { cacheTtl: 1800 } })
  if (!r.ok) return err(`MyInstants respondeu ${r.status}`, 502)
  const html = await r.text()
  const items: any[] = []
  const seen = new Set<string>()
  const re = /play\('([^']+\.mp3)'[\s\S]*?<a[^>]+href="([^"]*\/instant\/[^"]+)"[^>]*>([^<]+)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && items.length < 40) {
    const mp3 = m[1].startsWith('http') ? m[1] : `https://www.myinstants.com${m[1]}`
    if (seen.has(mp3)) continue
    seen.add(mp3)
    items.push({ id: `mi-${m[2].split('/').filter(Boolean).pop()}`, title: decodeHtml(m[3]), url: proxied(mp3), source: 'MyInstants', page: `https://www.myinstants.com${m[2]}` })
  }
  const hasNext = html.includes(`page=${page + 1}`)
  return json({ items, next: hasNext ? page + 1 : null }, 200, cacheHdr(900))
}

async function freesound(env: Env, url: URL) {
  if (!env.FREESOUND_KEY) return err('Freesound não configurado', 503)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80) || 'funny'
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) | 0)
  const qs = new URLSearchParams({
    query: q,
    token: env.FREESOUND_KEY,
    fields: 'id,name,duration,previews,license,username',
    filter: 'duration:[0 TO 20]',
    page_size: '24',
    page: String(page),
  })
  let r = await fetch(`https://freesound.org/apiv2/search/?${qs}`, { headers: { 'user-agent': UA }, cf: { cacheTtl: 3600 } })
  if (r.status === 404) r = await fetch(`https://freesound.org/apiv2/search/text/?${qs}`, { headers: { 'user-agent': UA }, cf: { cacheTtl: 3600 } })
  if (!r.ok) return err(`Freesound respondeu ${r.status}`, 502)
  const d: any = await r.json()
  const items = (d.results ?? [])
    .filter((s: any) => s.previews?.['preview-hq-mp3'])
    .map((s: any) => ({
      id: `fs-${s.id}`,
      title: s.name,
      url: proxied(s.previews['preview-hq-mp3']),
      duration: s.duration,
      source: 'Freesound',
      credit: `${s.username}, ${String(s.license ?? '').includes('publicdomain') || String(s.license ?? '').includes('/zero/') ? 'CC0' : String(s.license ?? '').includes('/by-nc/') ? 'CC BY-NC' : 'CC BY'}`,
      page: `https://freesound.org/s/${s.id}/`,
    }))
  return json({ items, next: d.next ? page + 1 : null }, 200, cacheHdr(900))
}

/* ---------------- proxy de mídia ---------------- */
async function proxy(url: URL) {
  let t: URL
  try {
    t = new URL(url.searchParams.get('u') ?? '')
  } catch {
    return err('url inválida')
  }
  if (t.protocol !== 'https:' || !hostAllowed(t.hostname)) return err('host não permitido', 403)
  const r = await fetch(t.toString(), { headers: { 'user-agent': UA, referer: `https://${t.hostname}/` }, cf: { cacheTtl: 2592000, cacheEverything: true } })
  if (!r.ok) return err('upstream', 502)
  const type = r.headers.get('content-type') ?? 'application/octet-stream'
  if (!/^(image|video|audio)\//.test(type) && !type.includes('octet-stream')) return err('tipo não permitido', 415)
  const len = Number(r.headers.get('content-length') ?? 0)
  if (len > 40 * 1024 * 1024) return err('arquivo grande demais', 413)
  return new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=604800', 'access-control-allow-origin': '*' } })
}

/* ---------------- galeria pública ---------------- */
const rid = (n = 10) => {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
}
async function sha(s: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ip = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'x'

function stickerOut(r: any) {
  return {
    id: r.id,
    name: r.name,
    tags: r.tags ? String(r.tags).split(',').filter(Boolean) : [],
    kind: r.kind,
    hasSound: !!r.has_sound,
    downloads: r.downloads,
    createdAt: r.created_at,
    webp: `/api/f/s/${r.id}.webp`,
    ogg: r.has_sound ? `/api/f/s/${r.id}.ogg` : null,
  }
}

const isWebp = (b: Uint8Array) => b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
const isOgg = (b: Uint8Array) => b.length > 4 && String.fromCharCode(...b.slice(0, 4)) === 'OggS'

async function publishSticker(req: Request, env: Env) {
  const { success } = await env.PUBLISH_LIMIT.limit({ key: `pub:${ip(req)}` })
  if (!success) return err('Muitas publicações seguidas. Espere um minuto.', 429)
  const form = await req.formData()
  const name = String(form.get('name') ?? '').trim().slice(0, 40)
  const tags = String(form.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase().slice(0, 24))
    .filter(Boolean)
    .slice(0, 8)
  const kind = form.get('kind') === 'animated' ? 'animated' : 'static'
  const webpF = form.get('webp')
  const oggF = form.get('ogg')
  if (!name) return err('Dê um nome para a figurinha.')
  if (!(webpF instanceof File)) return err('Falta a imagem.')
  const webp = new Uint8Array(await webpF.arrayBuffer())
  if (!isWebp(webp)) return err('A imagem precisa ser WebP.')
  if (webp.length > (kind === 'animated' ? 500 : 100) * 1024 + 4096) return err('A imagem passou do limite do WhatsApp.')
  let ogg: Uint8Array | null = null
  if (oggF instanceof File && oggF.size > 0) {
    ogg = new Uint8Array(await oggF.arrayBuffer())
    if (!isOgg(ogg) || ogg.length > 400 * 1024) return err('O som precisa ser OGG de até 10 s.')
  }
  const id = rid()
  const token = rid(24)
  await env.FILES.put(`s/${id}.webp`, webp, { metadata: { type: 'image/webp' } })
  if (ogg) await env.FILES.put(`s/${id}.ogg`, ogg, { metadata: { type: 'audio/ogg' } })
  await env.DB.prepare(
    'INSERT INTO stickers (id,name,tags,search,kind,has_sound,webp_size,created_at,token_hash) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(id, name, tags.join(','), norm(`${name} ${tags.join(' ')}`), kind, ogg ? 1 : 0, webp.length, Date.now(), await sha(token))
    .run()
  return json({ id, token, sticker: stickerOut({ id, name, tags: tags.join(','), kind, has_sound: ogg ? 1 : 0, downloads: 0, created_at: Date.now() }) }, 201)
}

async function listStickers(env: Env, url: URL) {
  const q = norm((url.searchParams.get('q') ?? '').trim()).slice(0, 60)
  const sort = url.searchParams.get('sort') === 'top' ? 'downloads DESC, created_at DESC' : 'created_at DESC'
  const limit = Math.min(48, Math.max(1, Number(url.searchParams.get('limit') ?? 24) | 0))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) | 0)
  const where = ['hidden = 0']
  const args: unknown[] = []
  if (q) for (const w of q.split(/\s+/).slice(0, 4)) { where.push('search LIKE ?'); args.push(`%${w}%`) }
  if (url.searchParams.get('sound') === '1') where.push('has_sound = 1')
  const kind = url.searchParams.get('kind')
  if (kind === 'static' || kind === 'animated') { where.push('kind = ?'); args.push(kind) }
  const rows = await env.DB.prepare(`SELECT * FROM stickers WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`)
    .bind(...args, limit + 1, offset)
    .all()
  const res = rows.results ?? []
  return json({ items: res.slice(0, limit).map(stickerOut), next: res.length > limit ? offset + limit : null }, 200, { 'cache-control': 'public, max-age=20' })
}

async function stickerRoute(req: Request, env: Env, id: string, action?: string) {
  const row: any = await env.DB.prepare('SELECT * FROM stickers WHERE id = ?').bind(id).first()
  if (!row || (row.hidden && req.method === 'GET')) return err('Figurinha não encontrada.', 404)
  if (req.method === 'GET' && !action) return json({ sticker: stickerOut(row) }, 200, { 'cache-control': 'public, max-age=60' })
  if (req.method === 'POST' && action === 'download') {
    await env.DB.prepare('UPDATE stickers SET downloads = downloads + 1 WHERE id = ?').bind(id).run()
    return json({ ok: true })
  }
  if (req.method === 'POST' && action === 'report') {
    const { success } = await env.PUBLISH_LIMIT.limit({ key: `rep:${ip(req)}` })
    if (!success) return err('Espere um minuto.', 429)
    await env.DB.prepare('UPDATE stickers SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= 3 THEN 1 ELSE hidden END WHERE id = ?').bind(id).run()
    return json({ ok: true })
  }
  if (req.method === 'DELETE' && !action) {
    const token = req.headers.get('x-edit-token') ?? ''
    if ((await sha(token)) !== row.token_hash) return err('Código de edição inválido.', 403)
    await env.DB.prepare('DELETE FROM stickers WHERE id = ?').bind(id).run()
    await env.FILES.delete(`s/${id}.webp`)
    await env.FILES.delete(`s/${id}.ogg`)
    return json({ ok: true })
  }
  return err('Método não permitido.', 405)
}

async function publishPack(req: Request, env: Env) {
  const { success } = await env.PUBLISH_LIMIT.limit({ key: `pub:${ip(req)}` })
  if (!success) return err('Muitas publicações seguidas. Espere um minuto.', 429)
  const b: any = await req.json().catch(() => null)
  if (!b) return err('Pedido inválido.')
  const name = String(b.name ?? '').trim().slice(0, 64)
  const author = String(b.author ?? '').trim().slice(0, 64)
  const ids: string[] = Array.isArray(b.stickerIds) ? [...new Set(b.stickerIds.map(String))].slice(0, 30) as string[] : []
  if (!name) return err('Dê um nome para o pacote.')
  if (ids.length < 3) return err('Um pacote precisa de pelo menos 3 figurinhas.')
  const ph = ids.map(() => '?').join(',')
  const rows = (await env.DB.prepare(`SELECT id, kind FROM stickers WHERE hidden = 0 AND id IN (${ph})`).bind(...ids).all()).results ?? []
  if (rows.length !== ids.length) return err('Alguma figurinha do pacote não existe mais.')
  const kinds = new Set(rows.map((r: any) => r.kind))
  if (kinds.size > 1) return err('O WhatsApp não aceita misturar figurinhas paradas e animadas no mesmo pacote.')
  const cover = ids.includes(String(b.coverId)) ? String(b.coverId) : ids[0]
  const id = rid()
  const token = rid(24)
  await env.DB.prepare('INSERT INTO packs (id,name,author,kind,sticker_ids,cover_id,created_at,token_hash) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, name, author, [...kinds][0], JSON.stringify(ids), cover, Date.now(), await sha(token))
    .run()
  return json({ id, token }, 201)
}

function packOut(p: any, stickers?: any[]) {
  return {
    id: p.id,
    name: p.name,
    author: p.author,
    kind: p.kind,
    count: JSON.parse(p.sticker_ids).length,
    cover: `/api/f/s/${p.cover_id}.webp`,
    downloads: p.downloads,
    createdAt: p.created_at,
    stickers: stickers?.map(stickerOut),
  }
}

async function packRoute(req: Request, env: Env, id: string, action?: string) {
  const p: any = await env.DB.prepare('SELECT * FROM packs WHERE id = ? AND hidden = 0').bind(id).first()
  if (!p) return err('Pacote não encontrado.', 404)
  if (req.method === 'GET' && !action) {
    const ids: string[] = JSON.parse(p.sticker_ids)
    const rows = (await env.DB.prepare(`SELECT * FROM stickers WHERE hidden = 0 AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results ?? []
    const byId = new Map(rows.map((r: any) => [r.id, r]))
    return json({ pack: packOut(p, ids.map((i) => byId.get(i)).filter(Boolean)) }, 200, { 'cache-control': 'public, max-age=60' })
  }
  if (req.method === 'POST' && action === 'download') {
    await env.DB.prepare('UPDATE packs SET downloads = downloads + 1 WHERE id = ?').bind(id).run()
    return json({ ok: true })
  }
  return err('Método não permitido.', 405)
}

async function listPacks(env: Env, url: URL) {
  const limit = Math.min(24, Math.max(1, Number(url.searchParams.get('limit') ?? 12) | 0))
  const rows = (await env.DB.prepare('SELECT * FROM packs WHERE hidden = 0 ORDER BY created_at DESC LIMIT ?').bind(limit).all()).results ?? []
  return json({ items: rows.map((p) => packOut(p)) }, 200, { 'cache-control': 'public, max-age=30' })
}

async function file(env: Env, key: string) {
  if (!/^s\/[a-z0-9]+\.(webp|ogg)$/.test(key)) return err('não encontrado', 404)
  const { value, metadata } = await env.FILES.getWithMetadata<{ type: string }>(key, { type: 'stream', cacheTtl: 86400 })
  if (!value) return err('não encontrado', 404)
  return new Response(value, { headers: { 'content-type': metadata?.type ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' } })
}

/* ---------------- roteamento ---------------- */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const p = url.pathname
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req)
    try {
      if (p === '/api/memes' || p === '/api/media/memes') return await imgflip()
      if (p === '/api/media/klipy') return await klipy(env, url)
      if (p === '/api/sounds/myinstants') return await myinstants(url)
      if (p === '/api/sounds/freesound') return await freesound(env, url)
      if (p === '/api/proxy' || p === '/api/img') return await proxy(url)
      if (p.startsWith('/api/f/')) return await file(env, p.slice(7))
      if (p === '/api/stickers') return await (req.method === "POST" ? publishSticker(req, env) : listStickers(env, url))
      let m = p.match(/^\/api\/stickers\/([a-z0-9]+)(?:\/(download|report))?$/)
      if (m) return await stickerRoute(req, env, m[1], m[2])
      if (p === '/api/packs') return await (req.method === "POST" ? publishPack(req, env) : listPacks(env, url))
      m = p.match(/^\/api\/packs\/([a-z0-9]+)(?:\/(download))?$/)
      if (m) return await packRoute(req, env, m[1], m[2])
      return err('Rota não encontrada.', 404)
    } catch (e) {
      console.error(e)
      return err(`Erro no servidor: ${(e as Error).message}`, 500)
    }
  },
}
