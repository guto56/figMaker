import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
let loading: Promise<FFmpeg> | null = null
let seq = 0

export const LIMITS = {
  size: 512,
  staticKB: 100,
  animatedKB: 500,
  maxSeconds: 10,
}

export function getFFmpeg(): Promise<FFmpeg> {
  if (!loading) {
    loading = (async () => {
      const ff = new FFmpeg()
      await ff.load({
        coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ff
    })().catch((e) => {
      loading = null
      throw e
    })
  }
  return loading
}

async function run(ff: FFmpeg, args: string[]) {
  const code = await ff.exec(args)
  if (code !== 0) throw new Error('O conversor não conseguiu processar este arquivo.')
}

async function readOut(ff: FFmpeg, name: string, type: string) {
  const data = (await ff.readFile(name)) as Uint8Array
  return new Blob([data.slice()], { type })
}

function ext(file: Blob) {
  const t = file.type
  if (t.includes('gif')) return 'gif'
  if (t.includes('webm')) return 'webm'
  if (t.includes('quicktime')) return 'mov'
  if (t.includes('mp4')) return 'mp4'
  if (t.includes('mpeg')) return 'mp3'
  if (t.includes('wav')) return 'wav'
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('aac')) return 'aac'
  if (t.includes('m4a') || t.includes('x-m4a')) return 'm4a'
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  return 'bin'
}

/** PNG -> WebP estática até 100 KB (usado quando o navegador não codifica WebP, ex. Safari). */
export async function pngToWebp(png: Blob): Promise<Blob> {
  const ff = await getFFmpeg()
  const id = ++seq
  const inp = `s${id}.png`
  await ff.writeFile(inp, await fetchFile(png))
  let out: Blob | null = null
  for (const q of [90, 80, 70, 60, 50, 40, 30]) {
    const o = `s${id}-${q}.webp`
    await run(ff, ['-i', inp, '-c:v', 'libwebp', '-quality', String(q), '-lossless', '0', o])
    out = await readOut(ff, o, 'image/webp')
    await ff.deleteFile(o)
    if (out.size <= LIMITS.staticKB * 1024) break
  }
  await ff.deleteFile(inp)
  return out!
}

export type AnimOpts = {
  start: number
  duration: number
  fit: 'crop' | 'fit'
  speed: number
  overlay?: Blob | null
  onStep?: (msg: string) => void
}

/** Vídeo/GIF -> WebP animada 512x512, até 500 KB e 10 s. */
export async function toAnimatedWebp(src: Blob, o: AnimOpts): Promise<Blob> {
  const ff = await getFFmpeg()
  const id = ++seq
  const inp = `a${id}.${ext(src)}`
  await ff.writeFile(inp, await fetchFile(src))
  const ov = o.overlay ? `a${id}-ov.png` : null
  if (ov && o.overlay) await ff.writeFile(ov, await fetchFile(o.overlay))
  const dur = Math.min(o.duration, LIMITS.maxSeconds * o.speed)
  const scale = o.fit === 'crop'
    ? 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512'
    : 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
  const tries: Array<[number, number]> = [[15, 70], [15, 55], [12, 45], [12, 35], [10, 28], [8, 20], [8, 12]]
  let best: Blob | null = null
  for (const [fps, q] of tries) {
    o.onStep?.(`Comprimindo: ${fps} quadros/s, qualidade ${q}`)
    const out = `a${id}-${fps}-${q}.webp`
    const chain = `setpts=PTS/${o.speed},fps=${fps},${scale}`
    const args = ['-ss', String(o.start), '-t', String(dur), '-i', inp]
    if (ov) args.push('-i', ov, '-filter_complex', `[0:v]${chain}[v];[v][1:v]overlay=0:0`)
    else args.push('-vf', chain)
    args.push('-an', '-c:v', 'libwebp', '-loop', '0', '-quality', String(q), '-compression_level', '4', '-t', String(LIMITS.maxSeconds), out)
    await run(ff, args)
    best = await readOut(ff, out, 'image/webp')
    await ff.deleteFile(out)
    if (best.size <= LIMITS.animatedKB * 1024) break
  }
  await ff.deleteFile(inp)
  if (ov) await ff.deleteFile(ov)
  return best!
}

/** Qualquer áudio ou vídeo -> WAV mono 48 kHz (até 3 min), para desenhar a onda e ouvir. */
export async function toWav(src: Blob): Promise<Blob> {
  const ff = await getFFmpeg()
  const id = ++seq
  const inp = `w${id}.${ext(src)}`
  const out = `w${id}.wav`
  await ff.writeFile(inp, await fetchFile(src))
  try {
    await run(ff, ['-i', inp, '-t', '180', '-vn', '-ac', '1', '-ar', '48000', out])
  } catch {
    await ff.deleteFile(inp)
    throw new Error('Esse arquivo não tem áudio.')
  }
  const wav = await readOut(ff, out, 'audio/wav')
  await ff.deleteFile(inp)
  await ff.deleteFile(out)
  return wav
}

export type AudioOpts = { start: number; duration: number; volume: number; fade: boolean }

/** WAV -> OGG Opus mono 48 kHz, no máximo 10 s (o formato do áudio da figurinha). */
export async function toOpus(wav: Blob, o: AudioOpts): Promise<Blob> {
  const ff = await getFFmpeg()
  const id = ++seq
  const inp = `o${id}.wav`
  const out = `o${id}.ogg`
  await ff.writeFile(inp, await fetchFile(wav))
  const d = Math.min(o.duration, LIMITS.maxSeconds)
  const filters = [`volume=${o.volume.toFixed(2)}`]
  if (o.fade && d > 0.6) filters.push(`afade=t=in:d=0.08`, `afade=t=out:st=${(d - 0.25).toFixed(2)}:d=0.25`)
  await run(ff, ['-ss', String(o.start), '-t', String(d), '-i', inp, '-af', filters.join(','), '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', out])
  const ogg = await readOut(ff, out, 'audio/ogg')
  await ff.deleteFile(inp)
  await ff.deleteFile(out)
  return ogg
}

/** Duração de um vídeo/GIF usando o próprio navegador (fallback: 10 s). */
export function mediaDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    if (file.type.includes('gif')) return resolve(LIMITS.maxSeconds)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const url = URL.createObjectURL(file)
    const done = (n: number) => { URL.revokeObjectURL(url); resolve(n) }
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : LIMITS.maxSeconds)
    v.onerror = () => done(LIMITS.maxSeconds)
    v.src = url
  })
}
