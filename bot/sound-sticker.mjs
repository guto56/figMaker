// Figurinha com som: o WhatsApp guarda o áudio dentro da própria figurinha
// (StickerMessage, campo 26 = AudioMessage). O Baileys ainda não conhece esse
// campo, então o codificador é estendido aqui: depois de codificar a figurinha,
// os bytes do áudio são acrescentados como campo 26.
import { proto } from '@whiskeysockets/baileys'

const FIELD = 26
const TAG = (FIELD << 3) | 2 // tipo 2 = bytes com tamanho

// figurinhas que levam som, pela impressão digital do arquivo (fileSha256 em base64)
const audioBySticker = new Map()

let patched = false
export function patchStickerEncoder() {
  if (patched) return
  patched = true
  const original = proto.Message.StickerMessage.encode
  proto.Message.StickerMessage.encode = function (message, writer) {
    const w = original.call(this, message, writer)
    const sha = message?.fileSha256
    if (sha && sha.length) {
      const audio = audioBySticker.get(Buffer.from(sha).toString('base64'))
      if (audio) w.uint32(TAG).bytes(audio)
    }
    return w
  }
}

/** Liga o áudio (AudioMessage já enviado ao servidor) à figurinha. */
export function attachAudio(stickerMessage, audioMessage) {
  const key = Buffer.from(stickerMessage.fileSha256).toString('base64')
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
