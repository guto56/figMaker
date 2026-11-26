// Figurinha com som. O WhatsApp guarda o áudio dentro da própria figurinha
// (StickerMessage, campo 26 = AudioMessage) e, nas versões novas, embrulha a
// figurinha em Message.audioStickerMessage (campo 134, um FutureProofMessage
// cujo campo 1 é a Message com a figurinha). Versões antigas leem só a
// figurinha; as novas leem o embrulho e tocam o som. O Baileys ainda não conhece
// nenhum dos dois campos, então os codificadores são estendidos aqui.
import { proto } from '@whiskeysockets/baileys'

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

  // 2) embrulho audioStickerMessage (campo 134) ao lado da figurinha
  const messageEncode = proto.Message.encode
  proto.Message.encode = function (message, writer) {
    const w = messageEncode.call(this, message, writer)
    const st = message?.stickerMessage
    if (st && audioBySticker.has(keyOf(st.fileSha256))) {
      const inner = messageEncode.call(this, { stickerMessage: st }).finish()
      const futureProof = lenField(1, inner)
      w.uint32(tag(AUDIO_STICKER_MESSAGE_FIELD)).bytes(futureProof)
    }
    return w
  }
}

/** Liga o áudio (AudioMessage já enviado ao servidor) à figurinha. */
export function attachAudio(stickerMessage, audioMessage) {
  const key = keyOf(stickerMessage.fileSha256)
  const bytes = proto.Message.AudioMessage.encode(audioMessage).finish()
  audioBySticker.set(key, bytes)
  // a figurinha pode ser reenviada (novas tentativas, outros aparelhos); limpa depois
  setTimeout(() => audioBySticker.delete(key), 10 * 60 * 1000).unref?.()
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
