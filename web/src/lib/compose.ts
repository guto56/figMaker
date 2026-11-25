import { LIMITS, pngToWebp } from './ffmpeg'

export type TextLayer = { top: string; bottom: string; size: number; color: string }

export type Layout = {
  scale: number
  x: number
  y: number
  rotate: number
  outline: number
  text: TextLayer
}

export const defaultLayout = (): Layout => ({
  scale: 1,
  x: 0,
  y: 0,
  rotate: 0,
  outline: 0,
  text: { top: '', bottom: '', size: 64, color: '#ffffff' },
})

const S = LIMITS.size

/** Escala de "encaixar" a imagem inteira dentro dos 512 px, com margem para o contorno. */
function baseFit(w: number, h: number, outline: number) {
  const room = S - outline * 2 - 8
  return Math.min(room / w, room / h)
}

export function drawImageLayer(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, l: Layout) {
  const k = baseFit(img.width, img.height, l.outline) * l.scale
  const w = img.width * k
  const h = img.height * k

  const layer = document.createElement('canvas')
  layer.width = S
  layer.height = S
  const c = layer.getContext('2d')!
  c.save()
  c.translate(S / 2 + l.x, S / 2 + l.y)
  c.rotate((l.rotate * Math.PI) / 180)
  c.drawImage(img, -w / 2, -h / 2, w, h)
  c.restore()

  if (l.outline > 0) {
    const sil = document.createElement('canvas')
    sil.width = S
    sil.height = S
    const sc = sil.getContext('2d')!
    const steps = 24
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      sc.drawImage(layer, Math.cos(a) * l.outline, Math.sin(a) * l.outline)
    }
    sc.globalCompositeOperation = 'source-in'
    sc.fillStyle = '#ffffff'
    sc.fillRect(0, 0, S, S)
    ctx.drawImage(sil, 0, 0)
  }
  ctx.drawImage(layer, 0, 0)
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

export function renderStatic(canvas: HTMLCanvasElement, img: (CanvasImageSource & { width: number; height: number }) | null, l: Layout) {
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, S, S)
  if (img) drawImageLayer(ctx, img, l)
  drawText(ctx, l.text)
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
