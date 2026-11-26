import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'

/** Contador de janela fixa, um objeto por chave (faixa de rede + tipo de ação). */
export class Limiter extends DurableObject {
  private hits = new Map<string, { n: number; reset: number }>()
  async hit(bucket: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now()
    const cur = this.hits.get(bucket)
    if (!cur || now >= cur.reset) {
      this.hits.set(bucket, { n: 1, reset: now + windowMs })
      return true
    }
    cur.n++
    return cur.n <= limit
  }
}

export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  FILES: KVNamespace
  AI: Ai
  PROXY_LIMIT: RateLimit
  LIMITER: DurableObjectNamespace<Limiter>
  KLIPY_KEY: string
  FREESOUND_KEY: string
  IP_SALT: string
  BOT_TOKEN: string
  NTFY_TOPIC: string
  WA_NUMBER: string
}

/** Cabeçalhos de segurança em todas as respostas da API. */
const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-resource-policy': 'same-origin',
}
function secure(res: Response): Response {
  const r = new Response(res.body, res)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v)
  r.headers.delete('access-control-allow-origin')
  return r
}

const CANONICAL_HOST = 'zapfig.site'
const UA = 'Mozilla/5.0 (compatible; Zapfig/1.0; +https://zapfig.site)'
const PROXY_HOSTS = ['imgflip.com', 'klipy.com', 'klipy.co', 'myinstants.com', 'freesound.org']

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

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
  if (!r.ok) {
    console.error('klipy', r.status)
    return err('A busca de GIFs não respondeu. Tente de novo.', 502)
  }
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
  if (!r.ok) {
    console.error('myinstants', r.status)
    return err('A busca de sons não respondeu. Tente de novo.', 502)
  }
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
  if (!r.ok) {
    console.error('freesound', r.status)
    return err('A busca de efeitos não respondeu. Tente de novo.', 502)
  }
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
  if (t.protocol !== 'https:' || t.username || t.password || t.port || !hostAllowed(t.hostname)) return err('host não permitido', 403)
  // segue no máximo 3 redirecionamentos, todos dentro da lista de hosts permitidos
  let r: Response | null = null
  for (let hop = 0; hop < 4; hop++) {
    r = await fetch(t.toString(), { redirect: 'manual', headers: { 'user-agent': UA, referer: `https://${t.hostname}/` }, cf: { cacheTtl: 2592000, cacheEverything: true } })
    if (r.status < 300 || r.status >= 400) break
    const loc = r.headers.get('location')
    if (!loc) return err('upstream', 502)
    t = new URL(loc, t)
    if (t.protocol !== 'https:' || !hostAllowed(t.hostname)) return err('host não permitido', 403)
    r = null
  }
  if (!r || !r.ok) return err('upstream', 502)
  const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!/^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm)|audio\/(mpeg|mp3|ogg|wav|x-wav|webm|aac|mp4))$/.test(type)) return err('tipo não permitido', 415)
  const len = Number(r.headers.get('content-length') ?? 0)
  if (len > 40 * 1024 * 1024) return err('arquivo grande demais', 413)
  return new Response(r.body, {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=604800', 'content-disposition': 'inline' },
  })
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
/** Faixa de rede do cliente (/24 no IPv4, /64 no IPv6): trocar de IP dentro da mesma faixa não fura os limites. */
const ip = (req: Request) => {
  const raw = req.headers.get('cf-connecting-ip') ?? 'x'
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':') + '::/64'
  const o = raw.split('.')
  return o.length === 4 ? `${o[0]}.${o[1]}.${o[2]}.0/24` : raw
}
/** Limite exato por faixa de rede. */
async function limited(env: Env, key: string, limit: number, windowMs = 60000) {
  const stub = env.LIMITER.get(env.LIMITER.idFromName(key))
  return !(await stub.hit(key, limit, windowMs))
}
const who = (req: Request, env: Env) => sha(`${env.IP_SALT}:${ip(req)}`)
async function sameHash(a: string, b: string) {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  return (crypto.subtle as unknown as { timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean }).timingSafeEqual(ea, eb)
}

// caracteres de controle e espaços repetidos saem dos textos
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').replace(/\s+/g, ' ').trim()
const StickerForm = z.object({
  name: z.string().transform(clean).pipe(z.string().min(1, 'Dê um nome para a figurinha.').max(40)),
  tags: z
    .string()
    .max(300)
    .default('')
    .transform((t) => [...new Set(t.split(',').map((x) => clean(x).toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 8)),
  kind: z.enum(['static', 'animated']),
})
const PackBody = z.object({
  name: z.string().transform(clean).pipe(z.string().min(1, 'Dê um nome para o pacote.').max(64)),
  author: z.string().default('').transform(clean).pipe(z.string().max(64)),
  stickerIds: z.array(z.string().regex(/^[a-z0-9]{10}$/)).min(3, 'Um pacote precisa de pelo menos 3 figurinhas.').max(30),
  coverId: z.string().regex(/^[a-z0-9]{10}$/).optional(),
})
const ID = /^[a-z0-9]{10}$/

/** Largura e altura de um WebP (VP8, VP8L ou VP8X). */
function webpSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 30) return null
  const tag = String.fromCharCode(...b.slice(12, 16))
  if (tag === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
  if (tag === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (tag === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff }
  return null
}

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

type StickerFiles = { webp: Uint8Array; ogg: Uint8Array | null }

/** Lê e valida a imagem WebP (512×512, limites do WhatsApp) e o som OGG opcional. */
async function readStickerFiles(form: FormData, kind: 'static' | 'animated'): Promise<StickerFiles | Response> {
  const webpF = form.get('webp')
  const oggF = form.get('ogg')
  if (!(webpF instanceof File)) return err('Falta a imagem.')
  if (webpF.size > 520 * 1024) return err('A imagem passou do limite do WhatsApp.')
  const webp = new Uint8Array(await webpF.arrayBuffer())
  if (!isWebp(webp)) return err('A imagem precisa ser WebP.')
  if (webp.length > (kind === 'animated' ? 500 : 100) * 1024 + 4096) return err('A imagem passou do limite do WhatsApp.')
  const dim = webpSize(webp)
  if (!dim || dim.w !== 512 || dim.h !== 512) return err('A imagem precisa ter 512 × 512 px.')
  let ogg: Uint8Array | null = null
  if (oggF instanceof File && oggF.size > 0) {
    if (oggF.size > 400 * 1024) return err('O som precisa ser OGG de até 10 s.')
    ogg = new Uint8Array(await oggF.arrayBuffer())
    if (!isOgg(ogg)) return err('O som precisa ser OGG de até 10 s.')
  }
  return { webp, ogg }
}

async function publishSticker(req: Request, env: Env) {
  if (await limited(env, `pub:${ip(req)}`, 40)) return err('Muitas publicações seguidas. Espere um minuto.', 429)
  const len = Number(req.headers.get('content-length') ?? 0)
  if (!len || len > 1024 * 1024) return err('Arquivo grande demais.', 413)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return err('Pedido inválido.')
  }
  const parsed = StickerForm.safeParse({ name: form.get('name') ?? '', tags: form.get('tags') ?? '', kind: form.get('kind') })
  if (!parsed.success) return err(parsed.error.issues[0]?.message?.startsWith('Dê') ? parsed.error.issues[0].message : 'Dados inválidos.')
  const { name, tags, kind } = parsed.data
  const files = await readStickerFiles(form, kind)
  if (files instanceof Response) return files
  const { webp, ogg } = files
  const id = rid()
  const token = rid(24)
  await env.FILES.put(`s/${id}.webp`, webp, { metadata: { type: 'image/webp' } })
  if (ogg) await env.FILES.put(`s/${id}.ogg`, ogg, { metadata: { type: 'audio/ogg' } })
  const now = Date.now()
  await env.DB.prepare(
    'INSERT INTO stickers (id,name,tags,search,kind,has_sound,webp_size,created_at,token_hash) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(id, name, tags.join(','), norm(`${name} ${tags.join(' ')}`), kind, ogg ? 1 : 0, webp.length, now, await sha(token))
    .run()
  return json({ id, token, sticker: stickerOut({ id, name, tags: tags.join(','), kind, has_sound: ogg ? 1 : 0, downloads: 0, created_at: now }) }, 201)
}

/** Conta uma vez por pessoa por dia. */
async function countDownload(req: Request, env: Env, table: 'stickers' | 'packs', id: string) {
  const day = Math.floor(Date.now() / 86400000)
  const r = await env.DB.prepare('INSERT OR IGNORE INTO downloads_seen (target, who, day) VALUES (?,?,?)').bind(`${table}:${id}`, await who(req, env), day).run()
  if (r.meta.changes) await env.DB.prepare(`UPDATE ${table} SET downloads = downloads + 1 WHERE id = ?`).bind(id).run()
  return json({ ok: true })
}

async function listStickers(env: Env, url: URL) {
  const q = norm((url.searchParams.get('q') ?? '').trim()).slice(0, 60)
  const sort = url.searchParams.get('sort') === 'top' ? 'downloads DESC, created_at DESC' : 'created_at DESC'
  const limit = Math.min(48, Math.max(1, Number(url.searchParams.get('limit') ?? 24) | 0))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) | 0)
  const where = ['hidden = 0']
  const args: unknown[] = []
  if (q) for (const w of q.split(/\s+/).filter(Boolean).slice(0, 4)) { where.push("search LIKE ? ESCAPE '\\'"); args.push(`%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) }
  if (url.searchParams.get('sound') === '1') where.push('has_sound = 1')
  const kind = url.searchParams.get('kind')
  if (kind === 'static' || kind === 'animated') { where.push('kind = ?'); args.push(kind) }
  const rows = await env.DB.prepare(`SELECT * FROM stickers WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`)
    .bind(...args, limit + 1, offset)
    .all()
  const res = rows.results ?? []
  return json({ items: res.slice(0, limit).map(stickerOut), next: res.length > limit ? offset + limit : null }, 200, { 'cache-control': 'no-cache' })
}

async function stickerRoute(req: Request, env: Env, id: string, action?: string) {
  const row: any = await env.DB.prepare('SELECT * FROM stickers WHERE id = ?').bind(id).first()
  if (!row || (row.hidden && req.method === 'GET')) return err('Figurinha não encontrada.', 404)
  if (req.method === 'GET' && !action) return json({ sticker: stickerOut(row) }, 200, { 'cache-control': 'public, max-age=60' })
  if (req.method === 'POST' && action === 'download') return countDownload(req, env, 'stickers', id)
  if (req.method === 'POST' && action === 'report') {
    if (await limited(env, `rep:${ip(req)}`, 10)) return err('Espere um minuto.', 429)
    // uma denúncia por pessoa; a figurinha sai do ar com 3 pessoas diferentes
    const r = await env.DB.prepare('INSERT OR IGNORE INTO reports_seen (target, who, created_at) VALUES (?,?,?)').bind(`stickers:${id}`, await who(req, env), Date.now()).run()
    if (r.meta.changes) {
      await env.DB.prepare(
        "UPDATE stickers SET reports = (SELECT COUNT(*) FROM reports_seen WHERE target = ?), hidden = CASE WHEN (SELECT COUNT(*) FROM reports_seen WHERE target = ?) >= 3 THEN 1 ELSE hidden END WHERE id = ?",
      )
        .bind(`stickers:${id}`, `stickers:${id}`, id)
        .run()
    }
    return json({ ok: true })
  }
  if (req.method === 'DELETE' && !action) {
    const token = (req.headers.get('x-edit-token') ?? '').slice(0, 64)
    if (!token || !(await sameHash(await sha(token), row.token_hash))) return err('Código de edição inválido.', 403)
    await env.DB.prepare('DELETE FROM stickers WHERE id = ?').bind(id).run()
    await env.FILES.delete(`s/${id}.webp`)
    await env.FILES.delete(`s/${id}.ogg`)
    return json({ ok: true })
  }
  return err('Método não permitido.', 405)
}

async function publishPack(req: Request, env: Env) {
  if (await limited(env, `pub:${ip(req)}`, 40)) return err('Muitas publicações seguidas. Espere um minuto.', 429)
  if (Number(req.headers.get('content-length') ?? 0) > 16 * 1024) return err('Pedido grande demais.', 413)
  const raw = await req.json().catch(() => null)
  const parsed = PackBody.safeParse(raw)
  if (!parsed.success) {
    const m = parsed.error.issues[0]?.message ?? ''
    return err(m.startsWith('Dê') || m.startsWith('Um pacote') ? m : 'Dados inválidos.')
  }
  const { name, author } = parsed.data
  const ids = [...new Set(parsed.data.stickerIds)]
  if (ids.length < 3) return err('Um pacote precisa de pelo menos 3 figurinhas.')
  const ph = ids.map(() => '?').join(',')
  const rows = (await env.DB.prepare(`SELECT id, kind FROM stickers WHERE hidden = 0 AND id IN (${ph})`).bind(...ids).all()).results ?? []
  if (rows.length !== ids.length) return err('Alguma figurinha do pacote não existe mais.')
  const kinds = new Set(rows.map((r: any) => r.kind))
  if (kinds.size > 1) return err('O WhatsApp não aceita misturar figurinhas paradas e animadas no mesmo pacote.')
  const cover = parsed.data.coverId && ids.includes(parsed.data.coverId) ? parsed.data.coverId : ids[0]
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
  if (req.method === 'POST' && action === 'download') return countDownload(req, env, 'packs', id)
  return err('Método não permitido.', 405)
}

async function listPacks(env: Env, url: URL) {
  const limit = Math.min(24, Math.max(1, Number(url.searchParams.get('limit') ?? 12) | 0))
  const rows = (await env.DB.prepare('SELECT * FROM packs WHERE hidden = 0 ORDER BY created_at DESC LIMIT ?').bind(limit).all()).results ?? []
  return json({ items: rows.map((p) => packOut(p)) }, 200, { 'cache-control': 'no-cache' })
}

async function file(env: Env, key: string) {
  const m = key.match(/^s\/([a-z0-9]{10})\.(webp|ogg)$/)
  if (!m) return err('não encontrado', 404)
  const row = await env.DB.prepare('SELECT hidden FROM stickers WHERE id = ?').bind(m[1]).first<{ hidden: number }>()
  if (!row || row.hidden) return err('não encontrado', 404)
  const { value, metadata } = await env.FILES.getWithMetadata<{ type: string }>(key, { type: 'stream', cacheTtl: 86400 })
  if (!value) return err('não encontrado', 404)
  return new Response(value, { headers: { 'content-type': metadata?.type === 'audio/ogg' ? 'audio/ogg' : 'image/webp', 'cache-control': 'public, max-age=86400', 'content-disposition': 'inline' } })
}

/* ---------------- receber pelo WhatsApp ---------------- */
// O site guarda a figurinha por 30 min com um código. A pessoa manda "ZAPFIG <código>"
// para o número do robô, que busca os arquivos aqui (com BOT_TOKEN) e responde.
const SEND_TTL = 1800
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SEND_CODE = /^[A-Z2-9]{6}$/
const newCode = () => {
  const a = new Uint8Array(6)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => CODE_ALPHABET[b % 32]).join('')
}
const waNumber = (env: Env) => (env.WA_NUMBER ?? '').replace(/\D/g, '')

async function createSend(req: Request, env: Env) {
  if (!waNumber(env) || !env.BOT_TOKEN) return err('O envio pelo WhatsApp ainda não está ligado.', 503)
  if (await limited(env, `send:${ip(req)}`, 10)) return err('Muitos envios seguidos. Espere um minuto.', 429)
  const len = Number(req.headers.get('content-length') ?? 0)
  if (!len || len > 1024 * 1024) return err('Arquivo grande demais.', 413)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return err('Pedido inválido.')
  }
  const kind = form.get('kind') === 'animated' ? 'animated' : 'static'
  const files = await readStickerFiles(form, kind)
  if (files instanceof Response) return files
  const code = newCode()
  const opts = { expirationTtl: SEND_TTL }
  await env.FILES.put(`snd/${code}.webp`, files.webp, opts)
  if (files.ogg) await env.FILES.put(`snd/${code}.ogg`, files.ogg, opts)
  await env.FILES.put(`snd/${code}.json`, JSON.stringify({ kind, hasSound: !!files.ogg, createdAt: Date.now() }), opts)
  const text = `ZAPFIG ${code}`
  return json({ code, text, link: `https://wa.me/${waNumber(env)}?text=${encodeURIComponent(text)}`, expiresIn: SEND_TTL }, 201, { 'cache-control': 'no-store' })
}

async function botRoute(req: Request, env: Env, code: string, part?: string) {
  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!env.BOT_TOKEN || !auth || !(await sameHash(await sha(auth), await sha(env.BOT_TOKEN)))) return err('Não autorizado.', 401)
  if (!SEND_CODE.test(code)) return err('Código inválido.', 404)
  const meta = await env.FILES.get(`snd/${code}.json`)
  if (!meta) return err('Código expirado ou já usado.', 404)
  if (req.method === 'GET' && !part) return new Response(meta, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  if (req.method === 'GET' && (part === 'webp' || part === 'ogg')) {
    const v = await env.FILES.get(`snd/${code}.${part}`, 'arrayBuffer')
    if (!v) return err('não encontrado', 404)
    return new Response(v, { headers: { 'content-type': part === 'webp' ? 'image/webp' : 'audio/ogg', 'cache-control': 'no-store' } })
  }
  if (req.method === 'POST' && part === 'done') {
    await Promise.all(['json', 'webp', 'ogg'].map((x) => env.FILES.delete(`snd/${code}.${x}`)))
    return json({ ok: true })
  }
  return err('Método não permitido.', 405)
}

/* ---------------- saúde do robô ---------------- */
// O robô manda um "estou vivo" a cada minuto; um cron confere a cada 5 minutos e avisa o dono
// (notificação no app ntfy) quando ele cai e quando volta.
type Heartbeat = { at: number; connected: boolean; since: number }
type AlertState = { down: boolean; at: number; reason?: string }

async function heartbeat(req: Request, env: Env) {
  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!env.BOT_TOKEN || !auth || !(await sameHash(await sha(auth), await sha(env.BOT_TOKEN)))) return err('Não autorizado.', 401)
  const body = (await req.json().catch(() => ({}))) as { connected?: boolean }
  const prev = await env.FILES.get<Heartbeat>('bot:hb', 'json')
  const connected = !!body.connected
  const hb: Heartbeat = { at: Date.now(), connected, since: prev && prev.connected === connected ? prev.since : Date.now() }
  await env.FILES.put('bot:hb', JSON.stringify(hb))
  return json({ ok: true })
}

async function notify(env: Env, title: string, message: string, priority: 'high' | 'default') {
  if (!env.NTFY_TOPIC) return
  await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    method: 'POST',
    body: message,
    headers: { Title: title, Priority: priority, Tags: priority === 'high' ? 'rotating_light' : 'white_check_mark' },
  }).catch((e) => console.error('ntfy', e))
}

async function checkBot(env: Env) {
  const hb = await env.FILES.get<Heartbeat>('bot:hb', 'json')
  const st = (await env.FILES.get<AlertState>('bot:alert', 'json')) ?? { down: false, at: 0 }
  const now = Date.now()
  let reason = ''
  if (!hb) return
  if (now - hb.at > 10 * 60 * 1000) reason = `O robô não dá sinal há ${Math.round((now - hb.at) / 60000)} min. A máquina da Oracle pode ter parado.`
  else if (!hb.connected && now - hb.since > 5 * 60 * 1000) reason = `O robô está ligado, mas desconectado do WhatsApp há ${Math.round((now - hb.since) / 60000)} min. Pode precisar conectar o número de novo.`
  if (reason && !st.down) {
    await notify(env, 'Zapfig: robô fora do ar', reason, 'high')
    await env.FILES.put('bot:alert', JSON.stringify({ down: true, at: now, reason }))
  } else if (!reason && st.down) {
    await notify(env, 'Zapfig: robô voltou', `O robô voltou depois de ${Math.round((now - st.at) / 60000)} min fora.`, 'default')
    await env.FILES.put('bot:alert', JSON.stringify({ down: false, at: now }))
  }
}

/* ---------------- roteamento ---------------- */
function crossSite(req: Request, url: URL) {
  const origin = req.headers.get('origin')
  if (origin && origin !== url.origin) return true
  return req.headers.get('sec-fetch-site') === 'cross-site'
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname
  const method = req.method
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'GET, POST, DELETE' } })
  if (method !== 'GET' && method !== 'HEAD' && crossSite(req, url)) return err('Origem não permitida.', 403)

  if (p.startsWith('/api/media/') || p.startsWith('/api/sounds/')) {
    if (await limited(env, `s:${ip(req)}`, 60)) return err('Muitas buscas seguidas. Espere alguns segundos.', 429)
    // teto geral para proteger a cota das APIs de terceiros
    if (await limited(env, 'global:search', 1500)) return err('Muita gente buscando agora. Tente de novo em instantes.', 429)
  }
  if (p === '/api/proxy' || p === '/api/img') {
    const { success } = await env.PROXY_LIMIT.limit({ key: `p:${ip(req)}` })
    if (!success) return err('Muitos pedidos seguidos. Espere alguns segundos.', 429)
  }
  if (p === '/api/memes' || p === '/api/media/memes') return await imgflip()
  if (p === '/api/media/klipy') return await klipy(env, url)
  if (p === '/api/sounds/myinstants') return await myinstants(url)
  if (p === '/api/sounds/freesound') return await freesound(env, url)
  if (p === '/api/proxy' || p === '/api/img') return await proxy(url)
  if (p.startsWith('/api/f/')) return await file(env, p.slice(7))
  if (p === '/api/bot/heartbeat' && method === 'POST') return await heartbeat(req, env)
  if (p === '/api/send/config') return json({ enabled: !!(waNumber(env) && env.BOT_TOKEN), number: waNumber(env) || null }, 200, { 'cache-control': 'public, max-age=60' })
  if (p === '/api/send' && method === 'POST') return await createSend(req, env)
  const b = p.match(/^\/api\/bot\/send\/([^/]+)(?:\/(webp|ogg|done))?$/)
  if (b) return await botRoute(req, env, b[1], b[2])
  if (p === '/api/stickers') return await (req.method === "POST" ? publishSticker(req, env) : listStickers(env, url))
  let m = p.match(/^\/api\/stickers\/([a-z0-9]+)(?:\/(download|report))?$/)
  if (m) return await stickerRoute(req, env, m[1], m[2])
  if (p === '/api/packs') return await (req.method === "POST" ? publishPack(req, env) : listPacks(env, url))
  m = p.match(/^\/api\/packs\/([a-z0-9]+)(?:\/(download))?$/)
  if (m) return await packRoute(req, env, m[1], m[2])
  return err('Rota não encontrada.', 404)
}

export default {
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(checkBot(env))
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    // endereço oficial: zapfig.site (www e o antigo workers.dev redirecionam; a API segue nos três)
    if (url.hostname !== CANONICAL_HOST && !url.pathname.startsWith('/api/') && (url.hostname === `www.${CANONICAL_HOST}` || url.hostname.endsWith('.workers.dev'))) {
      return Response.redirect(`https://${CANONICAL_HOST}${url.pathname}${url.search}`, 301)
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    try {
      if (url.pathname.match(/^\/api\/stickers\/([^/]+)/) && !ID.test(url.pathname.split('/')[3] ?? '')) return secure(err('Figurinha não encontrada.', 404))
      if (url.pathname.match(/^\/api\/packs\/([^/]+)/) && !ID.test(url.pathname.split('/')[3] ?? '')) return secure(err('Pacote não encontrado.', 404))
      return secure(await route(req, env, url))
    } catch (e) {
      console.error('erro', url.pathname, e)
      if (e instanceof HttpError) return secure(err(e.message, e.status))
      return secure(err('Erro no servidor. Tente de novo.', 500))
    }
  },
}
