// Conversa para criar figurinha direto no WhatsApp:
// foto/vídeo/GIF → texto? → som? (meu áudio ou som de meme, com prévia) → figurinha.
// As escolhas são feitas tocando em enquetes; responder com o número ou o texto da opção também vale.
import { downloadMediaMessage, jidNormalizedUser } from '@whiskeysockets/baileys'
import { DAILY_LIMIT, consume, remaining } from './limits.mjs'
import { cutoutAvailable, removeBackground } from './cutout.mjs'
import { makeSticker, toStickerAudio } from './maker.mjs'
import { readVote, sendPoll } from './polls.mjs'

const SITE = (process.env.ZAPFIG_API || 'https://zapfig.site').replace(/\/$/, '')
const SESSION_MS = 10 * 60 * 1000
const MAX_MEDIA = 25 * 1024 * 1024
// intervalo mínimo entre duas mensagens de boas-vindas para a mesma pessoa (minutos)
const HELP_EVERY_MS = Number(process.env.HELP_EVERY_MIN || 5) * 60 * 1000

const MEME_SOUNDS = [
  ['💥 Vine boom', 'vine boom'],
  ['😂 Risada do Kiko', 'A risada do kiko'],
  ['😱 FAAAH', 'FAAAH'],
  ['😐 Bruh', 'bruh'],
  ['🎻 Violino triste', 'violino triste'],
  ['🦗 Grilo (silêncio)', 'grilo'],
  ['💸 E o pix?', 'E o pix? Nada ainda?'],
  ['👏 Aplausos', 'aplausos'],
  ['📯 Trombone triste', 'trombone triste'],
  ['🔔 Ding', 'ding sound effect'],
]
const OPT = {
  keepBg: '🖼️ Manter a foto inteira',
  cutBg: '✂️ Tirar o fundo',
  textBottom: '✍️ Texto embaixo',
  textTop: '✍️ Texto em cima',
  noText: '➡️ Sem texto',
  noSound: '🔇 Sem som',
  myAudio: '🎤 Mandar meu áudio',
  memeSound: '🔊 Som de meme',
  ok: '✅ Ficou bom, gerar',
  otherAudio: '🔁 Mandar outro áudio',
  searchSound: '🔎 Buscar outro som',
  thisOne: '✅ É esse, gerar',
  otherSound: '🔁 Escolher outro som',
  searchAgain: '🔎 Buscar de novo',
  useNew: '🆕 Fazer com a nova',
  useNewSound: '🔊 Usar só o som dela',
  keepOld: '↩️ Continuar a anterior',
}

const sessions = new Map()
const helpSentAt = new Map()
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N} ]/gu, '').trim().toLowerCase()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Quem é a pessoa, de forma estável (o WhatsApp às vezes usa @lid no lugar do número). */
export function userKey(m) {
  const alt = m.key.remoteJidAlt || m.key.participantAlt
  const j = alt && alt.endsWith('@s.whatsapp.net') ? alt : m.key.remoteJid
  return jidNormalizedUser(j)
}

function unwrap(msg) {
  let c = msg || {}
  for (let i = 0; i < 4; i++) {
    const inner = c.ephemeralMessage?.message || c.viewOnceMessage?.message || c.viewOnceMessageV2?.message || c.viewOnceMessageV2Extension?.message || c.documentWithCaptionMessage?.message
    if (!inner) break
    c = inner
  }
  return c
}

function mediaOf(m) {
  const c = unwrap(m.message)
  if (c.imageMessage) return { type: 'image', ext: 'jpg', size: Number(c.imageMessage.fileLength || 0) }
  if (c.videoMessage) return { type: c.videoMessage.gifPlayback ? 'gif' : 'video', ext: 'mp4', size: Number(c.videoMessage.fileLength || 0) }
  const d = c.documentMessage
  if (d?.mimetype?.startsWith('image/')) return { type: d.mimetype.includes('gif') ? 'gif' : 'image', ext: d.mimetype.split('/')[1].split(';')[0], size: Number(d.fileLength || 0) }
  if (d?.mimetype?.startsWith('video/')) return { type: 'video', ext: d.mimetype.split('/')[1].split(';')[0], size: Number(d.fileLength || 0) }
  return null
}

function audioOf(m) {
  const c = unwrap(m.message)
  if (c.audioMessage) return { ext: c.audioMessage.ptt ? 'ogg' : (c.audioMessage.mimetype || 'audio/mp4').split('/')[1].split(';')[0], size: Number(c.audioMessage.fileLength || 0) }
  const d = c.documentMessage
  if (d?.mimetype?.startsWith('audio/')) return { ext: d.mimetype.split('/')[1].split(';')[0], size: Number(d.fileLength || 0) }
  return null
}

/** Vídeo (com som) mandado quando o robô pediu áudio: usa a trilha de áudio dele. */
function videoAudioOf(m) {
  const md = mediaOf(m)
  if (!md || md.type !== 'video') return null
  return { ext: md.ext, size: md.size, video: true }
}

const textOf = (m) => {
  const c = unwrap(m.message)
  return c.conversation || c.extendedTextMessage?.text || ''
}

async function download(sock, m) {
  return downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage })
}

// fila: uma figurinha gerada por vez (a máquina é pequena)
let queue = Promise.resolve()
let waiting = 0

export function createFlow({ sendSticker, log = console, fetchMedia = download }) {
  async function say(sock, jid, text, quoted) {
    await sock.sendPresenceUpdate('composing', jid).catch(() => {})
    await sleep(400 + Math.random() * 600)
    await sock.sendMessage(jid, { text }, quoted ? { quoted } : undefined)
  }

  async function ask(sock, s, question, options) {
    s.options = options
    s.pollId = await sendPoll(sock, s.jid, question, options)
  }

  function touch(s) {
    clearTimeout(s.timer)
    s.timer = setTimeout(() => sessions.delete(s.user), SESSION_MS)
  }

  function end(s) {
    clearTimeout(s.timer)
    sessions.delete(s.user)
  }

  /** Interpreta a resposta: voto na enquete, número da opção ou o texto da opção. */
  function answerFrom(s, m, vote) {
    if (vote) return vote.pollId === s.pollId ? vote.option : null
    const t = norm(textOf(m))
    if (!t || !s.options) return null
    const n = Number(t)
    if (Number.isInteger(n) && n >= 1 && n <= s.options.length) return s.options[n - 1]
    return s.options.find((o) => norm(o) === t || norm(o).includes(t)) ?? null
  }

  async function searchSounds(q) {
    const r = await fetch(`${SITE}/api/sounds/myinstants?q=${encodeURIComponent(q)}`)
    if (!r.ok) throw new Error('busca de som falhou')
    return (await r.json()).items || []
  }

  async function loadSound(item) {
    const r = await fetch(SITE + item.url)
    if (!r.ok) throw new Error('não baixou o som')
    return toStickerAudio(Buffer.from(await r.arrayBuffer()), 'mp3', 10)
  }

  async function previewAndConfirm(sock, s, ogg, title, kind) {
    s.audio = ogg
    await sock.sendMessage(s.jid, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true })
    if (kind === 'mine') {
      s.stage = 'audio-confirm'
      await ask(sock, s, 'Ouviu? Vai ficar assim na figurinha (até 10 s).', [OPT.ok, OPT.otherAudio, OPT.noSound])
    } else {
      s.stage = 'meme-confirm'
      await ask(sock, s, `Som: ${title}. É esse?`, [OPT.thisOne, OPT.otherSound, OPT.noSound])
    }
  }

  async function generate(sock, s) {
    s.stage = 'generating'
    const jid = s.jid
    waiting++
    if (waiting > 1) await say(sock, jid, `Tem ${waiting - 1} figurinha${waiting > 2 ? 's' : ''} na sua frente. Já já sai a sua.`)
    else if (s.media.type !== 'image') await say(sock, jid, 'Gerando sua figurinha… vídeo leva uns segundinhos.')
    const job = queue.then(async () => {
      try {
        const st = await makeSticker({ data: s.media.data, kind: s.media.type, ext: s.media.ext, text: s.text, textPosition: s.textPosition })
        await sendSticker(sock, jid, { webp: st.webp, kind: st.kind, ogg: s.audio || null }, undefined)
        consume(s.user)
        const left = remaining(s.user)
        await say(sock, jid,
          `Pronto! Toque e segure na figurinha e escolha *Favoritar* para guardar.${s.audio ? ' Toque nela para ouvir o som.' : ''}\n\n` +
          (left === Infinity ? 'Quer outra? É só mandar mais uma foto ou vídeo.' : left > 0 ? `Hoje você ainda pode fazer ${left}. É só mandar outra foto ou vídeo.` : `Essas foram as ${DAILY_LIMIT} de hoje. Amanhã tem mais! Pelo site dá para criar à vontade: ${SITE}`))
      } catch (e) {
        log.error?.('falha ao gerar', e?.message)
        await say(sock, jid, 'Não consegui fazer essa figurinha. Tente com outra foto ou um vídeo mais curto.')
      } finally {
        waiting--
        end(s)
      }
    })
    queue = job.catch(() => {})
    return job
  }

  async function startWithMedia(sock, m, user, jid, media) {
    if (remaining(user) <= 0) {
      await say(sock, jid, `Você já fez as ${DAILY_LIMIT} figurinhas de hoje pelo WhatsApp. Amanhã tem mais!\n\nPelo site você cria quantas quiser e recebe aqui: ${SITE}`, m)
      return
    }
    if (media.size > MAX_MEDIA) {
      await say(sock, jid, 'Esse arquivo é grande demais. Mande uma foto ou um vídeo de até 25 MB.', m)
      return
    }
    const old = sessions.get(user)
    if (old) end(old)
    const s = { user, jid, stage: 'downloading' }
    sessions.set(user, s)
    touch(s)
    await sock.readMessages([m.key]).catch(() => {})
    try {
      s.media = { ...media, data: await fetchMedia(sock, m) }
    } catch {
      end(s)
      await say(sock, jid, 'Não consegui baixar esse arquivo. Pode mandar de novo?', m)
      return
    }
    if (s.media.type === 'image' && cutoutAvailable()) {
      s.stage = 'bg-choice'
      await ask(sock, s, 'Bora fazer a figurinha! Quer tirar o fundo da foto?', [OPT.keepBg, OPT.cutBg])
      return
    }
    await askText(sock, s, 'Bora fazer a figurinha! Quer escrever um texto nela?')
  }

  async function askText(sock, s, question = 'Quer escrever um texto na figurinha?') {
    s.stage = 'text-choice'
    await ask(sock, s, question, [OPT.noText, OPT.textBottom, OPT.textTop])
  }

  async function step(sock, s, m, vote) {
    touch(s)
    const jid = s.jid
    const a = answerFrom(s, m, vote)

    switch (s.stage) {
      case 'bg-choice': {
        if (!a) return
        if (a === OPT.cutBg) {
          s.stage = 'cutting'
          await say(sock, jid, 'Recortando… isso leva alguns segundos.')
          const job = queue.then(async () => {
            try {
              s.media = { ...s.media, data: await removeBackground(s.media.data), ext: 'png' }
              await sock.sendMessage(jid, { image: s.media.data, caption: 'Ficou assim.' }).catch(() => {})
            } catch (e) {
              log.error?.('recorte', e?.message)
              await say(sock, jid, 'Não consegui tirar o fundo dessa foto. Vou usar a foto inteira.')
            }
          })
          queue = job.catch(() => {})
          await job
        }
        return askText(sock, s)
      }

      case 'text-choice':
        if (!a) return
        if (a === OPT.noText) return askSound(sock, s)
        s.textPosition = a === OPT.textTop ? 'top' : 'bottom'
        s.stage = 'text-input'
        return say(sock, jid, 'Digite o texto (até 40 letras):')

      case 'text-input': {
        const t = textOf(m).trim()
        if (!t || vote) return
        s.text = t.slice(0, 40)
        return askSound(sock, s)
      }

      case 'sound-choice':
        if (!a) return
        if (a === OPT.noSound) return generate(sock, s)
        if (a === OPT.myAudio) {
          s.stage = 'audio-input'
          return say(sock, jid, 'Pode mandar o áudio: grave segurando o 🎤, envie um arquivo de áudio ou mande um *vídeo* que eu uso o som dele. Uso até 10 segundos.')
        }
        return askMeme(sock, s)

      case 'audio-input': {
        const au = audioOf(m) || videoAudioOf(m)
        if (!au) return
        try {
          const ogg = await toStickerAudio(await fetchMedia(sock, m), au.ext, 10)
          return previewAndConfirm(sock, s, ogg, 'seu áudio', 'mine')
        } catch {
          return say(sock, jid, au.video ? 'Esse vídeo não tem som (ou não consegui tirar o som dele). Mande um áudio ou outro vídeo.' : 'Não consegui usar esse áudio. Tente gravar de novo.')
        }
      }

      case 'media-switch': {
        if (!a) return
        const p = s.pending
        s.pending = null
        if (a === OPT.useNew) {
          end(s)
          return startWithMedia(sock, p.m, s.user, jid, p.media)
        }
        Object.assign(s, s.before)
        if (a === OPT.useNewSound) {
          let ogg
          try {
            ogg = await toStickerAudio(await fetchMedia(sock, p.m), p.media.ext, 10)
          } catch {
            await say(sock, jid, 'Esse vídeo não tem som (ou não consegui tirar o som dele). Continuando com a anterior: responda a pergunta de cima.')
            return
          }
          // já estava na parte do som: mostra a prévia agora; senão guarda e usa quando chegar lá
          if (['sound-choice', 'audio-input', 'audio-confirm', 'meme-pick', 'search-input', 'search-pick', 'meme-confirm'].includes(s.stage)) {
            return previewAndConfirm(sock, s, ogg, 'som do vídeo', 'mine')
          }
          s.audio = ogg
          return say(sock, jid, 'Guardei o som desse vídeo 🔊 Ele vai na figurinha. Agora responda a pergunta de cima.')
        }
        return say(sock, jid, 'Beleza, continuando com a anterior. Responda a pergunta de cima.')
      }

      case 'audio-confirm':
        if (!a) return
        if (a === OPT.ok) return generate(sock, s)
        if (a === OPT.noSound) {
          s.audio = null
          return generate(sock, s)
        }
        s.stage = 'audio-input'
        return say(sock, jid, 'Beleza, manda outro áudio.')

      case 'meme-pick':
      case 'search-pick': {
        if (!a) return
        if (a === OPT.searchSound || a === OPT.searchAgain) {
          s.stage = 'search-input'
          return say(sock, jid, 'Digite o nome do som (ex.: faustão errou, tome, uepa):')
        }
        if (a === OPT.noSound) {
          s.audio = null
          return generate(sock, s)
        }
        const item = s.stage === 'meme-pick'
          ? (await searchSounds(MEME_SOUNDS.find(([label]) => label === a)?.[1] || a))[0]
          : s.candidates?.[a]
        if (!item) return say(sock, jid, 'Não achei esse som agora. Escolha outro.')
        try {
          return previewAndConfirm(sock, s, await loadSound(item), item.title, 'meme')
        } catch {
          return say(sock, jid, 'Esse som não carregou. Escolha outro.')
        }
      }

      case 'search-input': {
        const q = textOf(m).trim()
        if (!q || vote) return
        const items = (await searchSounds(q).catch(() => [])).slice(0, 8)
        if (!items.length) return say(sock, jid, 'Não achei nenhum som com esse nome. Tente outra palavra.')
        s.candidates = {}
        const labels = items.map((it, i) => {
          const label = `${i + 1}. ${it.title}`.slice(0, 80)
          s.candidates[label] = it
          return label
        })
        s.stage = 'search-pick'
        return ask(sock, s, `Achei estes para "${q.slice(0, 30)}". Qual?`, [...labels, OPT.searchAgain, OPT.noSound])
      }

      case 'meme-confirm':
        if (!a) return
        if (a === OPT.thisOne) return generate(sock, s)
        if (a === OPT.noSound) {
          s.audio = null
          return generate(sock, s)
        }
        return askMeme(sock, s)
    }
  }

  async function safeStep(sock, s, m, vote) {
    try {
      await step(sock, s, m, vote)
    } catch (e) {
      log.error?.('conversa', e?.message)
      await say(sock, s.jid, 'Deu um probleminha aqui. Tente de novo, ou mande "cancelar" para recomeçar.').catch(() => {})
    }
  }

  async function askSound(sock, s) {
    if (s.audio) return previewAndConfirm(sock, s, s.audio, 'som do vídeo', 'mine')
    s.stage = 'sound-choice'
    await ask(sock, s, 'Quer com som?', [OPT.noSound, OPT.myAudio, OPT.memeSound])
  }

  async function askMeme(sock, s) {
    s.stage = 'meme-pick'
    await ask(sock, s, 'Escolha o som (você ouve antes de confirmar):', [...MEME_SOUNDS.map(([l]) => l), OPT.searchSound])
  }


  const lastReplyAt = new Map()
  const REPLY_GAP_MS = 8 * 1000
  const has = (t, words) => t.split(/\s+/).some((w) => words.some((x) => w.startsWith(x)))

  /** Responde mensagens fora de uma conversa: comandos simples ou o menu. */
  async function reply(sock, m, user, jid, c) {
    const now = Date.now()
    if (now - (lastReplyAt.get(user) || 0) < REPLY_GAP_MS) return // várias mensagens seguidas: uma resposta só
    lastReplyAt.set(user, now)
    const t = norm(textOf(m))
    const left = remaining(user)
    const quota = left === Infinity ? 'Você não tem limite.' : `Hoje você ainda pode fazer *${left} de ${DAILY_LIMIT}* aqui.`
    let text
    if (has(t, ['som', 'audio', 'barulho'])) {
      text = `🔊 Todas as figurinhas *com som* estão aqui:\n${SITE}/galeria?filtro=som\n\nToque em uma e depois em *Receber no WhatsApp* que eu mando para você.\n\nPara fazer a sua com som, me mande uma foto, vídeo ou GIF.`
    } else if (has(t, ['animada', 'gif', 'mexe'])) {
      text = `🎞️ Figurinhas animadas:\n${SITE}/galeria?filtro=animada\n\nOu me mande um vídeo ou GIF que eu transformo em figurinha animada.`
    } else if (has(t, ['lista', 'galeria', 'todas', 'catalogo', 'meme', 'figurinha', 'pacote'])) {
      text = `📚 Galeria do Zapfig:\n${SITE}/galeria\n\nSó com som: ${SITE}/galeria?filtro=som\nPacotes: ${SITE}/galeria?aba=pacotes`
    } else if (has(t, ['limite', 'quantas', 'restam', 'sobrou'])) {
      text = `${quota}\nNo site é à vontade: ${SITE}/criar`
    } else if (has(t, ['site', 'link'])) {
      text = `🌐 ${SITE}\n\nCriar: ${SITE}/criar\nGaleria: ${SITE}/galeria`
    } else if (has(t, ['obrigad', 'valeu', 'vlw', 'top', 'show', 'kkk', 'haha'])) {
      text = 'Tamo junto! 😄 Quando quiser outra, é só mandar uma foto, vídeo ou GIF.'
    } else {
      const first = now - (helpSentAt.get(user) || 0) > HELP_EVERY_MS
      helpSentAt.set(user, now)
      const intro = c.stickerMessage ? 'Figurinha boa! 😄 ' : first ? 'Oi! Eu sou o robô do Zapfig 🤖\n\n' : ''
      text = `${intro}Me mande uma *foto, vídeo ou GIF* que eu transformo em figurinha, com texto e som se quiser. ${quota}\n\nOutras coisas que eu entendo:\n• *som* → figurinhas com áudio\n• *galeria* → todas as figurinhas\n• *limite* → quantas ainda pode fazer\n• *site* → criar à vontade no site`
    }
    await say(sock, jid, text, m)
  }

  /** Trata uma mensagem que não é código do site. Devolve true se foi tratada. */
  async function onMessage(sock, m) {
    const jid = m.key.remoteJid
    const user = userKey(m)
    const vote = readVote(sock, m)
    const s = sessions.get(user)
    if (vote) {
      if (s && !['generating', 'cutting'].includes(s.stage)) await safeStep(sock, s, m, vote)
      return true
    }
    const c = unwrap(m.message)
    if (c.reactionMessage || c.protocolMessage || c.pollUpdateMessage) return true // ignora reações e avisos do sistema
    const media = mediaOf(m)
    if (media) {
      if (s && ['generating', 'cutting', 'downloading'].includes(s.stage)) {
        await say(sock, jid, 'Espera eu terminar a figurinha anterior e manda essa de novo. 😉', m)
        return true
      }
      // pedi áudio e veio vídeo: usa o som do vídeo
      if (s && s.stage === 'audio-input' && media.type === 'video') {
        await safeStep(sock, s, m, null)
        return true
      }
      // mídia nova no meio de uma conversa: pergunta o que fazer
      if (s && s.stage !== 'media-switch') {
        touch(s)
        s.before = { stage: s.stage, options: s.options, pollId: s.pollId }
        s.pending = { m, media }
        s.stage = 'media-switch'
        const opts = media.type === 'video' ? [OPT.useNew, OPT.useNewSound, OPT.keepOld] : [OPT.useNew, OPT.keepOld]
        await ask(sock, s, 'Você mandou outra mídia no meio da figurinha. O que eu faço?', opts)
        return true
      }
      if (s) end(s)
      await startWithMedia(sock, m, user, jid, media)
      return true
    }
    if (s && !c.stickerMessage && !['generating', 'cutting'].includes(s.stage)) {
      if (['cancelar', 'sair', 'parar'].includes(norm(textOf(m)))) {
        end(s)
        await say(sock, jid, 'Cancelei. Quando quiser, é só mandar uma foto ou vídeo.')
        return true
      }
      await safeStep(sock, s, m, null)
      return true
    }
    // mensagem solta (texto, áudio, figurinha, contato...): sempre responde, com limite anti-spam
    await reply(sock, m, user, jid, c)
    return true
  }

  return { onMessage }
}
