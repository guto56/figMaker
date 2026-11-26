import type { Sticker } from './store'

export type MediaItem = {
  id: string
  title: string
  preview: string
  previewVideo?: string | null
  full: string
  kind: 'image' | 'video'
  hasAudio?: boolean
}
export type SoundItem = { id: string; title: string; url: string; source: string; credit?: string; duration?: number; page?: string }
export type Page<T> = { items: T[]; next: number | null }

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'O servidor não respondeu.')
  return d as T
}

export type MediaSource = 'memes' | 'gifs' | 'stickers' | 'clips'
export function searchMedia(src: MediaSource, q: string, page = 1) {
  if (src === 'memes') return get<Page<MediaItem>>('/api/media/memes')
  return get<Page<MediaItem>>(`/api/media/klipy?type=${src}&q=${encodeURIComponent(q)}&page=${page}`)
}

export type SoundSource = 'myinstants' | 'freesound'
export function searchSounds(src: SoundSource, q: string, page = 1) {
  return get<Page<SoundItem>>(`/api/sounds/${src}?q=${encodeURIComponent(q)}&page=${page}`)
}

/* galeria pública */
export type RemoteSticker = {
  id: string
  name: string
  tags: string[]
  kind: 'static' | 'animated'
  hasSound: boolean
  downloads: number
  createdAt: number
  webp: string
  ogg: string | null
}
export type RemotePack = {
  id: string
  name: string
  author: string
  kind: 'static' | 'animated'
  count: number
  cover: string
  downloads: number
  createdAt: number
  stickers?: RemoteSticker[]
}

export const toSticker = (r: RemoteSticker): Sticker => ({
  id: `r-${r.id}`,
  remoteId: r.id,
  name: r.name,
  kind: r.kind,
  webp: r.webp,
  ogg: r.ogg,
  tags: r.tags,
  createdAt: r.createdAt,
  downloads: r.downloads,
  remote: true,
})

export function listStickers(o: { q?: string; sort?: 'new' | 'top'; sound?: boolean; kind?: string; offset?: number; limit?: number }) {
  const p = new URLSearchParams()
  if (o.q) p.set('q', o.q)
  if (o.sort) p.set('sort', o.sort)
  if (o.sound) p.set('sound', '1')
  if (o.kind) p.set('kind', o.kind)
  if (o.offset) p.set('offset', String(o.offset))
  if (o.limit) p.set('limit', String(o.limit))
  return get<Page<RemoteSticker>>(`/api/stickers?${p}`)
}
export const getSticker = (id: string) => get<{ sticker: RemoteSticker }>(`/api/stickers/${id}`).then((d) => d.sticker)

const TOKENS = 'zapfig-tokens'
export function editTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS) || '{}')
  } catch {
    return {}
  }
}
function saveToken(id: string, token: string) {
  try {
    localStorage.setItem(TOKENS, JSON.stringify({ ...editTokens(), [id]: token }))
  } catch {
    /* sem storage */
  }
}

export async function publishSticker(s: { name: string; tags: string[]; kind: string; webp: Blob; ogg?: Blob | null }) {
  const f = new FormData()
  f.set('name', s.name)
  f.set('tags', s.tags.join(','))
  f.set('kind', s.kind)
  f.set('webp', new File([s.webp], 'figurinha.webp', { type: 'image/webp' }))
  if (s.ogg) f.set('ogg', new File([s.ogg], 'som.ogg', { type: 'audio/ogg' }))
  const r = await fetch('/api/stickers', { method: 'POST', body: f })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Não deu para publicar.')
  saveToken(d.id, d.token)
  return d.sticker as RemoteSticker
}

export async function deleteRemote(id: string) {
  const token = editTokens()[id]
  const r = await fetch(`/api/stickers/${id}`, { method: 'DELETE', headers: { 'x-edit-token': token ?? '' } })
  if (!r.ok) throw new Error('Não deu para apagar.')
}

export const countDownload = (kind: 'stickers' | 'packs', id: string) => fetch(`/api/${kind}/${id}/download`, { method: 'POST' }).catch(() => {})
export const reportSticker = (id: string) => fetch(`/api/stickers/${id}/report`, { method: 'POST' })

export async function publishPack(p: { name: string; author: string; stickerIds: string[]; coverId: string }) {
  const r = await fetch('/api/packs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Não deu para criar o pacote.')
  saveToken(`pack-${d.id}`, d.token)
  return d.id as string
}
export const getPack = (id: string) => get<{ pack: RemotePack }>(`/api/packs/${id}`).then((d) => d.pack)
export const listPacks = () => get<{ items: RemotePack[] }>('/api/packs?limit=12').then((d) => d.items)

/* receber pelo WhatsApp */
let sendCfg: Promise<{ enabled: boolean; number: string | null }> | null = null
const loadSendCfg = () => (sendCfg ??= get<{ enabled: boolean; number: string | null }>('/api/send/config').catch(() => ({ enabled: false, number: null })))
export const sendConfig = () => loadSendCfg().then((d) => d.enabled)
/** Número e link da conversa com o robô (null se o robô estiver desligado). */
export const botInfo = () =>
  loadSendCfg().then((d) => ({
    number: d.enabled ? d.number : null,
    link: d.enabled && d.number ? `https://wa.me/${d.number}?text=${encodeURIComponent('Oi! Quero fazer uma figurinha')}` : null,
  }))
/** Link para conversar com o robô e criar figurinha direto no WhatsApp. */
export const botChatLink = () => loadSendCfg().then((d) => (d.enabled && d.number ? `https://wa.me/${d.number}?text=${encodeURIComponent('Oi! Quero fazer uma figurinha')}` : null))

export type SendTicket = { code: string; text: string; link: string; expiresIn: number }
export async function createSend(s: { kind: string; webp: Blob; ogg?: Blob | null }) {
  const f = new FormData()
  f.set('kind', s.kind)
  f.set('webp', new File([s.webp], 'figurinha.webp', { type: 'image/webp' }))
  if (s.ogg) f.set('ogg', new File([s.ogg], 'som.ogg', { type: 'audio/ogg' }))
  const r = await fetch('/api/send', { method: 'POST', body: f })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Não deu para preparar o envio.')
  return d as SendTicket
}
