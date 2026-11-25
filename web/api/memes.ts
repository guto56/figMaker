export const config = { runtime: 'edge' }

export default async function handler() {
  const r = await fetch('https://api.imgflip.com/get_memes')
  if (!r.ok) return new Response('upstream', { status: 502 })
  const d = await r.json()
  const memes = (d?.data?.memes ?? []).map((m: { id: string; name: string; url: string; width: number; height: number }) => ({
    id: m.id, name: m.name, url: m.url, width: m.width, height: m.height,
  }))
  return Response.json({ memes }, { headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
}
