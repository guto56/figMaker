// Robô do Zapfig: quando alguém manda "ZAPFIG <código>" para o número do robô,
// ele busca a figurinha no site e responde com ela (com som, animada ou normal).
// O robô só responde; nunca inicia conversa com ninguém.
import 'dotenv/config'
import {
  default as makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import { rmSync } from 'node:fs'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { attachAudio, oggSeconds, patchStickerEncoder, waveform } from './sound-sticker.mjs'

const API = (process.env.ZAPFIG_API || 'https://zapfig.hrycsngb42.workers.dev').replace(/\/$/, '')
const TOKEN = process.env.BOT_TOKEN
const PAIR_NUMBER = (process.env.PAIR_NUMBER || '').replace(/\D/g, '')
const AUTH_DIR = process.env.AUTH_DIR || './auth'
if (!TOKEN) {
  console.error('Falta BOT_TOKEN no arquivo .env')
  process.exit(1)
}

const log = pino({ level: process.env.LOG_LEVEL || 'warn' })
const CODE = /\bZAPFIG\s+([A-Z2-9]{6})\b/i

patchStickerEncoder()

// anti-abuso por pessoa: no máximo 15 figurinhas por hora
const perSender = new Map()
function allowed(jid) {
  const now = Date.now()
  const list = (perSender.get(jid) || []).filter((t) => now - t < 3600_000)
  if (list.length >= 15) return false
  list.push(now)
  perSender.set(jid, list)
  return true
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, init = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) } })
  return r
}

async function fetchJob(code) {
  const r = await api(`/api/bot/send/${code}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`site respondeu ${r.status}`)
  const job = await r.json()
  const webp = Buffer.from(await (await api(`/api/bot/send/${code}/webp`)).arrayBuffer())
  let ogg = null
  if (job.hasSound) ogg = Buffer.from(await (await api(`/api/bot/send/${code}/ogg`)).arrayBuffer())
  return { ...job, webp, ogg }
}

async function sendSticker(sock, jid, job, quoted) {
  const upload = { upload: sock.waUploadToServer }
  const media = await prepareWAMessageMedia({ sticker: job.webp, isAnimated: job.kind === 'animated' }, upload)
  media.stickerMessage.isAnimated = job.kind === 'animated'
  if (job.ogg) {
    const { audioMessage } = await prepareWAMessageMedia({ audio: job.ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, upload)
    audioMessage.mimetype = 'audio/ogg; codecs=opus'
    audioMessage.ptt = true
    audioMessage.seconds = oggSeconds(job.ogg)
    audioMessage.waveform = waveform(job.ogg)
    attachAudio(media.stickerMessage, audioMessage)
  }
  const msg = generateWAMessageFromContent(jid, { stickerMessage: media.stickerMessage }, { userJid: sock.user?.id, quoted })
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
}

async function handle(sock, m) {
  const jid = m.key.remoteJid
  if (!jid || m.key.fromMe || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return
  const text = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
  const found = text.match(CODE)
  if (!found) return
  const code = found[1].toUpperCase()
  if (!allowed(jid)) return
  await sock.readMessages([m.key]).catch(() => {})
  await sock.sendPresenceUpdate('composing', jid).catch(() => {})
  await sleep(800 + Math.random() * 1500)
  try {
    const job = await fetchJob(code)
    if (!job) {
      await sock.sendMessage(jid, { text: 'Esse código expirou ou já foi usado. Gere outro no site do Zapfig.' }, { quoted: m })
      return
    }
    await sendSticker(sock, jid, job, m)
    await api(`/api/bot/send/${code}/done`, { method: 'POST' }).catch(() => {})
    console.log(`enviada ${code} (${job.kind}${job.ogg ? ', com som' : ''})`)
  } catch (e) {
    console.error('falha ao enviar', code, e?.message)
    await sock.sendMessage(jid, { text: 'Não consegui mandar agora. Tente de novo em um minuto.' }, { quoted: m }).catch(() => {})
  } finally {
    await sock.sendPresenceUpdate('paused', jid).catch(() => {})
  }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }))
  const sock = makeWASocket({
    version,
    auth: state,
    logger: log,
    // o pareamento por código só aceita um navegador conhecido
    browser: Browsers.macOS('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  })
  sock.ev.on('creds.update', saveCreds)

  let pairingAsked = false
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (PAIR_NUMBER && !pairingAsked) {
        pairingAsked = true
        await sleep(2000)
        const code = await sock.requestPairingCode(PAIR_NUMBER)
        console.log(`\nNo celular do número ${PAIR_NUMBER}: WhatsApp > Aparelhos conectados > Conectar com número de telefone > digite: ${code}\n`)
      } else if (!PAIR_NUMBER) {
        console.log('\nEscaneie com o celular do número do robô (WhatsApp > Aparelhos conectados > Conectar um aparelho):\n')
        qrcode.generate(qr, { small: true })
      }
    }
    if (connection === 'open') console.log(`Robô conectado como ${sock.user?.id}. Esperando pedidos…`)
    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode
      if (status === DisconnectReason.loggedOut) {
        // sessão inválida (pareamento falhou ou o aparelho foi removido no celular): começa do zero
        console.error('Sessão encerrada. Apagando a sessão e gerando um código novo em 5 s…')
        rmSync(AUTH_DIR, { recursive: true, force: true })
        setTimeout(start, 5000)
        return
      }
      console.log('Conexão caiu, reconectando em 3 s…')
      setTimeout(start, 3000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) handle(sock, m).catch((e) => console.error(e?.message))
  })
}

start()
