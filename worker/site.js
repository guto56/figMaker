// Zapfig: serve o site a partir do KV (SITE) e as rotas /api/memes e /api/img.
const json = (d, init = {}) => new Response(JSON.stringify(d), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } })

async function memes() {
  const r = await fetch('https://api.imgflip.com/get_memes', { cf: { cacheTtl: 86400 } })
  if (!r.ok) return new Response('upstream', { status: 502 })
  const d = await r.json()
  const list = (d?.data?.memes ?? []).map((m) => ({ id: m.id, name: m.name, url: m.url, width: m.width, height: m.height }))
  return json({ memes: list }, { headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' } })
}

async function img(url) {
  let t
  try { t = new URL(url.searchParams.get('u') || '') } catch { return new Response('bad url', { status: 400 }) }
  if (t.protocol !== 'https:' || t.hostname !== 'i.imgflip.com') return new Response('forbidden', { status: 403 })
  const r = await fetch(t.toString(), { cf: { cacheTtl: 2592000, cacheEverything: true } })
  if (!r.ok) return new Response('upstream', { status: 502 })
  const type = r.headers.get('content-type') || 'image/jpeg'
  if (!type.startsWith('image/')) return new Response('not image', { status: 415 })
  return new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400', 'access-control-allow-origin': '*' } })
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url)
    const p = url.pathname

    if (p === '/__upload' || p === '/__publish') {
      if (req.method !== 'POST' || url.searchParams.get('key') !== env.KEY) return new Response('no', { status: 403 })
      const ver = url.searchParams.get('v')
      if (!ver) return new Response('v?', { status: 400 })
      if (p === '/__publish') { await env.SITE.put('current', ver); return json({ ok: true, ver }) }
      const path = url.searchParams.get('path')
      const type = req.headers.get('content-type') || 'application/octet-stream'
      await env.SITE.put(`v:${ver}:${path}`, req.body, { metadata: { type } })
      return json({ ok: true, path })
    }

    if (p === '/api/memes') return memes()
    if (p === '/api/img') return img(url)
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method', { status: 405 })

    const ver = await env.SITE.get('current', { cacheTtl: 60 })
    if (!ver) return new Response('Em breve.', { status: 503 })
    const cache = caches.default
    const ck = new Request(`${url.origin}${p}?__v=${ver}`)
    let res = await cache.match(ck)
    if (res) return res

    let key = p.endsWith('/') ? `${p}index.html` : p
    let obj = await env.SITE.getWithMetadata(`v:${ver}:${key}`, { type: 'stream', cacheTtl: 3600 })
    let status = 200
    if (!obj.value) {
      const isFile = /\.[a-z0-9]+$/i.test(p)
      if (isFile) return new Response('Não encontrado', { status: 404 })
      key = '/index.html'
      obj = await env.SITE.getWithMetadata(`v:${ver}:${key}`, { type: 'stream', cacheTtl: 3600 })
    }
    const type = obj.metadata?.type || 'application/octet-stream'
    const immutable = key.startsWith('/assets/')
    res = new Response(obj.value, {
      status,
      headers: {
        'content-type': type,
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : key === '/index.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
      },
    })
    if (key !== '/index.html') ctx.waitUntil(cache.put(ck, res.clone()))
    return res
  },
}
