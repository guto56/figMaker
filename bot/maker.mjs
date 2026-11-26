// Gera a figurinha no servidor com ffmpeg: imagem, GIF ou vídeo → WebP 512×512
// (estática até 100 KB, animada até 500 KB), com texto opcional; áudio → OGG Opus mono.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FONT = fileURLToPath(new URL('./assets/Anton.ttf', import.meta.url))
const MAX_SECONDS = 6 // animadas: curto para caber em 500 KB e gerar rápido na máquina pequena

function ffmpeg(args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs)
    p.on('close', (code) => {
      clearTimeout(t)
      code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg saiu com ${code}`))
    })
  })
}

async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'zapfig-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Filtro de texto estilo meme (branco com contorno preto), em cima ou embaixo. */
async function textFilter(dir, text, position) {
  if (!text) return ''
  const clean = text.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 40)
  const file = join(dir, 'texto.txt')
  await writeFile(file, clean)
  const size = Math.max(34, Math.min(84, Math.floor(880 / Math.max(clean.length, 6))))
  const y = position === 'top' ? '22' : 'h-text_h-26'
  return `,drawtext=fontfile='${FONT}':textfile='${file}':fontsize=${size}:fontcolor=white:borderw=${Math.max(4, Math.round(size / 9))}:bordercolor=black:x=(w-text_w)/2:y=${y}`
}

/**
 * @param {{ data: Buffer, kind: 'image'|'video'|'gif', ext: string, text?: string, textPosition?: 'top'|'bottom' }} o
 * @returns {Promise<{ webp: Buffer, kind: 'static'|'animated' }>}
 */
export async function makeSticker(o) {
  return withTmp(async (dir) => {
    const input = join(dir, `entrada.${o.ext || 'bin'}`)
    const output = join(dir, 'figurinha.webp')
    await writeFile(input, o.data)
    const text = await textFilter(dir, o.text, o.textPosition)
    // imagem e GIF: inteiros com fundo transparente; vídeo: recorte quadrado no centro
    const fit = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
    const crop = 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba'

    if (o.kind === 'image') {
      for (const q of [85, 75, 65, 55, 45, 35, 25]) {
        await ffmpeg(['-i', input, '-vf', `${fit}${text}`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(q), '-lossless', '0', output])
        if ((await stat(output)).size <= 100 * 1024) break
      }
      return { webp: await readFile(output), kind: 'static' }
    }

    const base = o.kind === 'video' ? crop : fit
    for (const [fps, q] of [[12, 60], [10, 50], [10, 40], [8, 32], [8, 24], [6, 18]]) {
      await ffmpeg(['-t', String(MAX_SECONDS), '-i', input, '-vf', `fps=${fps},${base}${text}`, '-an', '-c:v', 'libwebp', '-loop', '0',
        '-quality', String(q), '-compression_level', '4', '-t', String(MAX_SECONDS), output], 240_000)
      if ((await stat(output)).size <= 490 * 1024) break
    }
    return { webp: await readFile(output), kind: 'animated' }
  })
}

/** Qualquer áudio (gravação do WhatsApp, arquivo, mp3 de meme) → OGG Opus mono 48 kHz, até 10 s. */
export async function toStickerAudio(data, ext = 'bin', maxSeconds = 10) {
  return withTmp(async (dir) => {
    const input = join(dir, `audio.${ext}`)
    const output = join(dir, 'som.ogg')
    await writeFile(input, data)
    await ffmpeg(['-t', String(maxSeconds), '-i', input, '-vn', '-af', `afade=t=out:st=${maxSeconds - 0.3}:d=0.3`, '-ac', '1', '-ar', '48000',
      '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'constrained', output])
    const out = await readFile(output)
    if (out.length < 1200) throw new Error('áudio vazio')
    return out
  })
}

/**
 * Mesma faixa de áudio, arquivo diferente: troca só a etiqueta interna do OGG.
 * O WhatsApp identifica o arquivo pelo conteúdo; mandar duas vezes o mesmo arquivo
 * (prévia e depois a figurinha, ou o mesmo som escolhido de novo) faz o celular
 * mostrar "áudio não está mais disponível".
 */
export async function uniqueOgg(data) {
  return withTmp(async (dir) => {
    const input = join(dir, 'in.ogg')
    const output = join(dir, 'out.ogg')
    await writeFile(input, data)
    await ffmpeg(['-i', input, '-c', 'copy', '-metadata', `comment=zapfig-${Date.now()}-${Math.random().toString(36).slice(2)}`, output])
    return readFile(output)
  })
}
