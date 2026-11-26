import { createStore, del, get, keys, set } from 'idb-keyval'
import JSZip from 'jszip'

export type Sticker = {
  id: string
  name: string
  kind: 'static' | 'animated'
  webp: Blob | string
  ogg?: Blob | string | null
  tags: string[]
  createdAt: number
  seed?: boolean
  /** publicada na galeria da comunidade */
  remoteId?: string
  remote?: boolean
  downloads?: number
}

const db = createStore('zapfig', 'stickers')

export async function saveSticker(s: Sticker) {
  await set(s.id, s, db)
}

export async function deleteSticker(id: string) {
  await del(id, db)
}

export async function listMine(): Promise<Sticker[]> {
  try {
    const ks = await keys(db)
    const all = await Promise.all(ks.map((k) => get<Sticker>(k, db)))
    return all.filter(Boolean).sort((a, b) => b!.createdAt - a!.createdAt) as Sticker[]
  } catch {
    return []
  }
}

export async function getMine(id: string) {
  try {
    return await get<Sticker>(id, db)
  } catch {
    return undefined
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10)

export function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'figurinha'
  )
}

export async function asBlob(x: Blob | string): Promise<Blob> {
  if (typeof x !== 'string') return x
  const r = await fetch(x)
  return r.blob()
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

const README = `Zapfig — figurinha para WhatsApp

Arquivos
- figurinha.webp: a imagem (512 x 512).
- som.ogg: o áudio (Opus mono, até 10 s), quando a figurinha tem som.

Como usar
1. Envie figurinha.webp e som.ogg para o seu celular.
2. No WhatsApp, abra o painel de figurinhas, toque em Criar figurinha,
   escolha a imagem e toque no ícone de áudio para adicionar som.ogg.
3. A figurinha com som está sendo liberada aos poucos pelo WhatsApp.
   Se o ícone de áudio não aparecer, a figurinha funciona sem som.

Passo a passo completo: https://zapfig.site/como-usar
`

export async function zipStickers(items: Sticker[]) {
  const zip = new JSZip()
  const many = items.length > 1
  for (const s of items) {
    const base = many ? `${slug(s.name)}/` : ''
    zip.file(`${base}figurinha.webp`, await asBlob(s.webp))
    if (s.ogg) zip.file(`${base}som.ogg`, await asBlob(s.ogg))
  }
  zip.file('LEIA-ME.txt', README)
  return zip.generateAsync({ type: 'blob' })
}

export async function shareSticker(s: Sticker): Promise<boolean> {
  const files = [new File([await asBlob(s.webp)], `${slug(s.name)}.webp`, { type: 'image/webp' })]
  if (s.ogg) files.push(new File([await asBlob(s.ogg)], `${slug(s.name)}.ogg`, { type: 'audio/ogg' }))
  const data = { files, title: s.name }
  if (!navigator.canShare?.(data)) return false
  try {
    await navigator.share(data)
  } catch {
    /* cancelado */
  }
  return true
}
