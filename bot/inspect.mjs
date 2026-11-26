// Diagnóstico: quando chega uma figurinha, registra a estrutura bruta da mensagem
// (números dos campos e tamanhos) e salva os bytes em ./dumps, para copiarmos o
// formato exato que o WhatsApp usa na figurinha com som.
import { mkdirSync, writeFileSync } from 'node:fs'
import { proto } from '@whiskeysockets/baileys'

function readVarint(b, p) {
  let v = 0
  let s = 0
  for (;;) {
    if (p >= b.length) throw new Error('fim')
    const x = b[p++]
    v += (x & 127) * 2 ** s
    if (x < 128) return [v, p]
    s += 7
    if (s > 63) throw new Error('varint')
  }
}

/** Lê os campos de um protobuf sem conhecer o esquema. */
function parse(b) {
  const out = []
  let p = 0
  while (p < b.length) {
    let key
    ;[key, p] = readVarint(b, p)
    const field = Math.floor(key / 8)
    const wt = key & 7
    if (field === 0) throw new Error('campo 0')
    if (wt === 0) {
      let v
      ;[v, p] = readVarint(b, p)
      out.push({ field, wt, v })
    } else if (wt === 2) {
      let len
      ;[len, p] = readVarint(b, p)
      if (p + len > b.length) throw new Error('tamanho')
      out.push({ field, wt, bytes: b.subarray(p, p + len) })
      p += len
    } else if (wt === 1) {
      out.push({ field, wt, len: 8 })
      p += 8
    } else if (wt === 5) {
      out.push({ field, wt, len: 4 })
      p += 4
    } else throw new Error('tipo ' + wt)
  }
  return out
}

function tree(b, depth = 0, maxDepth = 5) {
  let fields
  try {
    fields = parse(b)
  } catch {
    return null
  }
  const pad = '  '.repeat(depth)
  const lines = []
  for (const f of fields) {
    if (f.wt === 0) lines.push(`${pad}${f.field}: ${f.v}`)
    else if (f.wt === 2) {
      const txt = Buffer.from(f.bytes).toString('utf8')
      const printable = /^[\x20-\x7e]{1,80}$/.test(txt)
      const sub = depth < maxDepth && !printable ? tree(f.bytes, depth + 1, maxDepth) : null
      if (sub && sub.length) lines.push(`${pad}${f.field}: {  (${f.bytes.length} bytes)`, ...sub, `${pad}}`)
      else lines.push(`${pad}${f.field}: ${printable ? JSON.stringify(txt) : `<${f.bytes.length} bytes>`}`)
    } else lines.push(`${pad}${f.field}: <fixo ${f.len}>`)
  }
  return lines
}

let installed = false
export function inspectIncomingStickers() {
  if (installed) return
  installed = true
  mkdirSync('dumps', { recursive: true })
  const decode = proto.Message.decode
  proto.Message.decode = function (r, l) {
    const m = decode.call(this, r, l)
    if (r instanceof Uint8Array) {
      const top = (() => {
        try {
          return parse(r).map((f) => f.field)
        } catch {
          return []
        }
      })()
      // 26 = stickerMessage, 134 = audioStickerMessage
      if (top.includes(26) || top.includes(134)) {
        const name = `dumps/figurinha-${Date.now()}.bin`
        writeFileSync(name, r)
        console.log(`DUMP figurinha recebida, campos de topo: ${top.join(',')} (salvo em ${name})`)
        for (const line of tree(r) || []) console.log('DUMP ' + line)
      }
    }
    return m
  }
}
