import { LIMITS, pngToWebp } from './ffmpeg'

export type TextLayer = { top: string; bottom: string; size: number; color: string }

/** Ajustes globais da figurinha (valem para todas as camadas). */
export type Layout = {
  outline: number
  text: TextLayer
}

export const defaultLayout = (): Layout => ({
  outline: 0,
  text: { top: '', bottom: '', size: 64, color: '#ffffff' },
})

/** Uma imagem dentro da figurinha. Várias camadas podem ficar lado a lado ou uma sobre a outra. */
export type ImgLayer = {
  id: string
  name: string
  original: HTMLImageElement
  cutout: HTMLImageElement | null
  useCut: boolean
  x: number
  y: number
  scale: number
  rotate: number
  flip: boolean
}

export type Arrange = 'livre' | 'lado' | 'pilha' | 'grade'

const S = LIMITS.size
const MARGIN = 8

export const layerImg = (l: ImgLayer) => (l.useCut && l.cutout ? l.cutout : l.original)

/** Escala de "encaixar" a imagem inteira dentro dos 512 px. */
function baseFit(w: number, h: number) {
  const room = S - MARGIN * 2
  return Math.min(room / w, room / h)
}

export function layerBox(l: ImgLayer) {
  const im = layerImg(l)
  const k = baseFit(im.width, im.height) * l.scale
  return { w: im.width * k, h: im.height * k }
}

let seq = 0
export function newLayer(img: HTMLImageElement, name: string): ImgLayer {
  return { id: `l${++seq}`, name, original: img, cutout: null, useCut: false, x: 0, y: 0, scale: 1, rotate: 0, flip: false }
}

/** Organiza as camadas em colunas, linhas ou grade, redimensionando cada uma para caber. */
export function arrange(layers: ImgLayer[], mode: Arrange, outline: number): ImgLayer[] {
  const n = layers.length
  if (mode === 'livre' || n === 0) return layers
  const cols = mode === 'lado' ? n : mode === 'pilha' ? 1 : Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const pad = outline + MARGIN
  const cw = (S - pad * 2) / cols
  const ch = (S - pad * 2) / rows
  const gap = n > 1 ? outline + 4 : 0
  return layers.map((l, i) => {
    const im = layerImg(l)
    const target = Math.min((cw - gap) / im.width, (ch - gap) / im.height)
    // na última linha da grade, centraliza o que sobrou
    const row = Math.floor(i / cols)
    const inRow = row === rows - 1 ? n - row * cols : cols
    const col = i % cols
    const offset = ((cols - inRow) * cw) / 2
    return {
      ...l,
      rotate: 0,
      scale: target / baseFit(im.width, im.height),
      x: pad + offset + (col + 0.5) * cw - S / 2,
      y: pad + (row + 0.5) * ch - S / 2,
    }
  })
}

/** Camada mais acima no ponto (coordenadas do canvas, 0..512). */
export function hitTest(layers: ImgLayer[], px: number, py: number): ImgLayer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    const { w, h } = layerBox(l)
    const a = (-l.rotate * Math.PI) / 180
    const dx = px - (S / 2 + l.x)
    const dy = py - (S / 2 + l.y)
    const rx = dx * Math.cos(a) - dy * Math.sin(a)
    const ry = dx * Math.sin(a) + dy * Math.cos(a)
    if (Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2) return l
  }
  return null
}

function drawLayers(layers: ImgLayer[], outline: number): HTMLCanvasElement {
  const layer = document.createElement('canvas')
  layer.width = S
  layer.height = S
  const c = layer.getContext('2d')!
  for (const l of layers) {
    const im = layerImg(l)
    const { w, h } = layerBox(l)
    c.save()
    c.translate(S / 2 + l.x, S / 2 + l.y)
    c.rotate((l.rotate * Math.PI) / 180)
    if (l.flip) c.scale(-1, 1)
    c.drawImage(im, -w / 2, -h / 2, w, h)
    c.restore()
  }
  if (outline <= 0) return layer
  const out = document.createElement('canvas')
  out.width = S
  out.height = S
  const oc = out.getContext('2d')!
  const steps = 24
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    oc.drawImage(layer, Math.cos(a) * outline, Math.sin(a) * outline)
  }
  oc.globalCompositeOperation = 'source-in'
  oc.fillStyle = '#ffffff'
  oc.fillRect(0, 0, S, S)
  oc.globalCompositeOperation = 'source-over'
  oc.drawImage(layer, 0, 0)
  return out
}

function drawSelection(ctx: CanvasRenderingContext2D, l: ImgLayer) {
  const { w, h } = layerBox(l)
  ctx.save()
  ctx.translate(S / 2 + l.x, S / 2 + l.y)
  ctx.rotate((l.rotate * Math.PI) / 180)
  ctx.lineWidth = 3
  ctx.setLineDash([10, 7])
  ctx.strokeStyle = '#c2501b'
  ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6)
  ctx.restore()
}

export function drawText(ctx: CanvasRenderingContext2D, t: TextLayer) {
  const lines: Array<[string, 'top' | 'bottom']> = []
  if (t.top.trim()) lines.push([t.top, 'top'])
  if (t.bottom.trim()) lines.push([t.bottom, 'bottom'])
  for (const [raw, pos] of lines) {
    const text = raw.toUpperCase()
    let size = t.size
    ctx.font = `${size}px Anton, Impact, "Arial Black", sans-serif`
    while (ctx.measureText(text).width > S - 32 && size > 18) {
      size -= 2
      ctx.font = `${size}px Anton, Impact, "Arial Black", sans-serif`
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = pos === 'top' ? 'top' : 'bottom'
    const y = pos === 'top' ? 14 : S - 14
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(4, size / 7)
    ctx.strokeStyle = t.color.toLowerCase() === '#000000' ? '#ffffff' : '#000000'
    ctx.strokeText(text, S / 2, y)
    ctx.fillStyle = t.color
    ctx.fillText(text, S / 2, y)
  }
}

export function renderStatic(canvas: HTMLCanvasElement, layers: ImgLayer[], l: Layout, selectedId?: string | null) {
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, S, S)
  if (layers.length) ctx.drawImage(drawLayers(layers, l.outline), 0, 0)
  drawText(ctx, l.text)
  const sel = selectedId && layers.length > 1 ? layers.find((x) => x.id === selectedId) : null
  if (sel) drawSelection(ctx, sel)
}

/** Só o texto, em PNG transparente, para sobrepor em figurinha animada. */
export async function textOverlay(t: TextLayer): Promise<Blob | null> {
  if (!t.top.trim() && !t.bottom.trim()) return null
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  drawText(c.getContext('2d')!, t)
  return canvasBlob(c, 'image/png')
}

export function canvasBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar a imagem.'))), type, q))
}

/** Canvas -> WebP estática até 100 KB. Usa o codificador do navegador; no Safari, o conversor. */
export async function canvasToWebp(c: HTMLCanvasElement): Promise<Blob> {
  const probe = await canvasBlob(c, 'image/webp', 0.9)
  if (probe.type !== 'image/webp') return pngToWebp(await canvasBlob(c, 'image/png'))
  let b = probe
  for (const q of [0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
    if (b.size <= LIMITS.staticKB * 1024) break
    b = await canvasBlob(c, 'image/webp', q)
  }
  return b
}

export async function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  img.src = url
  await img.decode()
  return img
}
