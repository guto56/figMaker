export const config = { runtime: 'edge' }

// Proxy só para imagens do Imgflip, para o canvas não ficar "contaminado" por CORS.
export default async function handler(req: Request) {
  const u = new URL(req.url).searchParams.get('u') ?? ''
  let target: URL
  try {
    target = new URL(u)
  } catch {
    return new Response('bad url', { status: 400 })
  }
  if (target.protocol !== 'https:' || target.hostname !== 'i.imgflip.com') return new Response('forbidden', { status: 403 })
  const r = await fetch(target.toString())
  if (!r.ok) return new Response('upstream', { status: 502 })
  const type = r.headers.get('content-type') ?? 'image/jpeg'
  if (!type.startsWith('image/')) return new Response('not image', { status: 415 })
  return new Response(r.body, {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=86400, s-maxage=2592000', 'access-control-allow-origin': '*' },
  })
}
