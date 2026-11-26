// Tirar o fundo da foto: modelo de segmentação (rembg, U²-Net) rodando no próprio servidor.
// Padrão: "silueta" (44 MB, recorte melhor); se não estiver baixado, usa "u2netp" (4,5 MB, mais rápido).
// Os modelos ficam em ./models (baixados pelo instalador).
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ort from 'onnxruntime-node'
import sharp from 'sharp'

sharp.cache(false)
sharp.concurrency(1)

const modelPath = (name) => fileURLToPath(new URL(`./models/${name}.onnx`, import.meta.url))
const MODEL_PATH = [process.env.BG_MODEL, 'silueta', 'u2netp'].filter(Boolean).map(modelPath).find((p) => existsSync(p)) || modelPath('silueta')
const SIZE = 320
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

let session = null
export const cutoutAvailable = () => existsSync(MODEL_PATH)

async function getSession() {
  session ??= await ort.InferenceSession.create(MODEL_PATH, { intraOpNumThreads: 1, interOpNumThreads: 1, graphOptimizationLevel: 'all', enableCpuMemArena: false })
  return session
}

/**
 * Tira o fundo e põe um contorno branco de figurinha.
 * @returns {Promise<Buffer>} PNG com transparência
 */
export async function removeBackground(input, outline = 10) {
  // foto em RGB de 3 canais, girada certo e reduzida (até 1024 px): menos memória na máquina pequena
  const { data: rgb, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const ch = info.channels

  // 1) entrada do modelo: 320×320, RGB normalizado
  const small = await sharp(rgb, { raw: { width: W, height: H, channels: ch } }).resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer()
  let max = 1
  for (const v of small) if (v > max) max = v
  const plane = SIZE * SIZE
  const tensor = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) tensor[c * plane + i] = (small[i * ch + Math.min(c, ch - 1)] / max - MEAN[c]) / STD[c]

  // 2) máscara prevista (primeira saída), normalizada para 0..255
  const s = await getSession()
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) })
  const pred = out[s.outputNames[0]].data
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < plane; i++) {
    if (pred[i] < lo) lo = pred[i]
    if (pred[i] > hi) hi = pred[i]
  }
  const m8 = Buffer.alloc(plane)
  for (let i = 0; i < plane; i++) m8[i] = Math.round(((pred[i] - lo) / (hi - lo || 1)) * 255)
  const { data: mask, info: mi } = await sharp(m8, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .resize(W, H, { fit: 'fill' })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true })

  // 3) aplica a máscara como transparência e corta as bordas vazias
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = rgb[i * ch + Math.min(c, ch - 1)]
    rgba[i * 4 + 3] = mask[i * mi.channels]
  }
  let cut = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
  cut = await sharp(cut).trim({ threshold: 10 }).png().toBuffer().catch(() => cut)

  // 4) contorno branco: margem transparente + silhueta "engordada" pintada de branco por baixo
  const meta = await sharp(cut).metadata()
  const pad = outline * 2
  const padded = await sharp(cut).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const PW = meta.width + pad * 2
  const PH = meta.height + pad * 2
  const { data: alpha, info: ai } = await sharp(padded)
    .extractChannel('alpha')
    .blur(Math.max(1, outline / 2))
    .threshold(8)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const white = Buffer.alloc(PW * PH * 4, 255)
  for (let i = 0; i < PW * PH; i++) white[i * 4 + 3] = alpha[i * ai.channels]
  return sharp(white, { raw: { width: PW, height: PH, channels: 4 } }).composite([{ input: padded }]).png().toBuffer()
}
