// Figurinha com som, no mesmo formato que o próprio WhatsApp envia (conferido
// numa figurinha com som criada no app): o áudio vai dentro da figurinha
// (StickerMessage, campo 26 = AudioMessage, sem ptt nem waveform) e a figurinha
// vai só dentro de Message.audioStickerMessage (campo 134, FutureProofMessage
// cujo campo 1 é a Message com a figurinha), junto com messageContextInfo. O Baileys ainda não conhece
// nenhum dos dois campos, então os codificadores são estendidos aqui.
import { proto } from '@whiskeysockets/baileys'
import { randomBytes } from 'node:crypto'

const STICKER_AUDIO_FIELD = 26
const AUDIO_STICKER_MESSAGE_FIELD = 134
const tag = (field) => (field << 3) | 2 // tipo 2 = bytes com tamanho

// figurinhas que levam som, pela impressão digital do arquivo (fileSha256 em base64)
const audioBySticker = new Map()
const keyOf = (sha) => (sha && sha.length ? Buffer.from(sha).toString('base64') : '')

function varint(n) {
  const out = []
  while (n > 127) {
    out.push((n & 127) | 128)
    n >>>= 7
  }
  out.push(n)
  return Buffer.from(out)
}
const lenField = (field, bytes) => Buffer.concat([varint(tag(field)), varint(bytes.length), Buffer.from(bytes)])

let patched = false
export function patchStickerEncoder() {
  if (patched) return
  patched = true

  // 1) áudio dentro da figurinha (campo 26)
  const stickerEncode = proto.Message.StickerMessage.encode
  proto.Message.StickerMessage.encode = function (message, writer) {
    const w = stickerEncode.call(this, message, writer)
    const audio = audioBySticker.get(keyOf(message?.fileSha256))
    if (audio) w.uint32(tag(STICKER_AUDIO_FIELD)).bytes(audio)
    return w
  }

  // 2) como o WhatsApp faz: a figurinha com som vai SÓ dentro do embrulho
  //    audioStickerMessage (campo 134 > campo 1 = Message > campo 26 = figurinha),
  //    sem a figurinha solta no topo da mensagem
  const messageEncode = proto.Message.encode
  proto.Message.encode = function (message, writer) {
    const st = message?.stickerMessage
    if (!st || !audioBySticker.has(keyOf(st.fileSha256))) return messageEncode.call(this, message, writer)
    const rest = { ...message }
    delete rest.stickerMessage
    const w = messageEncode.call(this, rest, writer)
    const inner = messageEncode.call(this, { stickerMessage: st }).finish()
    w.uint32(tag(AUDIO_STICKER_MESSAGE_FIELD)).bytes(lenField(1, inner))
    return w
  }
}

/** Liga o áudio (AudioMessage já enviado ao servidor) à figurinha. */
export function attachAudio(stickerMessage, audioMessage) {
  const key = keyOf(stickerMessage.fileSha256)
  const bytes = proto.Message.AudioMessage.encode(audioMessage).finish()
  audioBySticker.set(key, bytes)
  // a figurinha pode ser reenviada (novas tentativas, outros aparelhos); limpa depois
  setTimeout(() => audioBySticker.delete(key), 30 * 60 * 1000).unref?.()
}

/** Onda sintética de 64 pontos (o WhatsApp só usa para desenhar). */
export function waveform(data) {
  const out = new Uint8Array(64)
  for (let i = 0; i < 64; i++) out[i] = 18 + (data[(i * 19 + 7) % data.length] % 76)
  return out
}

/** Duração de um OGG Opus lendo o granule position da última página (48 kHz). */
export function oggSeconds(buf) {
  for (let i = buf.length - 27; i >= 0; i--) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      const gp = Number(Buffer.from(buf.subarray(i + 6, i + 14)).readBigUInt64LE())
      if (gp > 0) return Math.max(1, Math.min(10, Math.round(gp / 48000)))
    }
  }
  return 5
}

/**
 * Mesma imagem, arquivo diferente: põe na figurinha os metadados que o próprio WhatsApp usa
 * (EXIF com o JSON do pacote) com um id único. O WhatsApp reconhece a figurinha pelo arquivo;
 * sem isso, a mesma foto gera o mesmo arquivo e um celular que já a favoritou mostra a versão
 * antiga (sem o som novo).
 */
export function uniqueWebp(webp) {
  const buf = Buffer.from(webp)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return buf
  // lê os pedaços (chunks) do arquivo
  const chunks = []
  for (let p = 12; p + 8 <= buf.length;) {
    const id = buf.toString('ascii', p, p + 4)
    const size = buf.readUInt32LE(p + 4)
    chunks.push({ id, data: buf.subarray(p + 8, p + 8 + size) })
    p += 8 + size + (size & 1)
  }
  if (!chunks.length) return buf
  let vp8x = chunks.find((c) => c.id === 'VP8X')
  if (!vp8x) {
    // formato simples: cria o cabeçalho estendido com o tamanho da imagem
    const img = chunks[0]
    let w, h, alpha = false
    if (img.id === 'VP8L') {
      const b = img.data.readUInt32LE(1)
      w = (b & 0x3fff) + 1
      h = ((b >>> 14) & 0x3fff) + 1
      alpha = !!((b >>> 28) & 1)
    } else if (img.id === 'VP8 ') {
      w = img.data.readUInt16LE(6) & 0x3fff
      h = img.data.readUInt16LE(8) & 0x3fff
    } else return buf
    const d = Buffer.alloc(10)
    d[0] = alpha ? 0x10 : 0
    d.writeUIntLE(w - 1, 4, 3)
    d.writeUIntLE(h - 1, 7, 3)
    vp8x = { id: 'VP8X', data: d }
    chunks.unshift(vp8x)
  } else {
    vp8x.data = Buffer.from(vp8x.data)
  }
  vp8x.data[0] |= 0x08 // tem EXIF
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': `zapfig-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`,
    'sticker-pack-name': 'Zapfig',
    'sticker-pack-publisher': 'zapfig.site',
    emojis: ['😂'],
  }))
  const exif = Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0, 0, 0, 0, 0x16, 0x00, 0x00, 0x00]), json])
  exif.writeUInt32LE(json.length, 14)
  const out = chunks.filter((c) => c.id !== 'EXIF').concat({ id: 'EXIF', data: exif })
  const parts = out.map((c) => {
    const head = Buffer.alloc(8)
    head.write(c.id, 0, 'ascii')
    head.writeUInt32LE(c.data.length, 4)
    return Buffer.concat([head, c.data, c.data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)])
  })
  const body = Buffer.concat(parts)
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0, 'ascii')
  riff.writeUInt32LE(body.length + 4, 4)
  riff.write('WEBP', 8, 'ascii')
  return Buffer.concat([riff, body])
}
