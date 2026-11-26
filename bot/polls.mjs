// Enquetes do WhatsApp como "botões": a pessoa toca numa opção em vez de digitar.
// O Baileys desta versão não decifra os votos sozinho, então fazemos aqui.
import { createHash } from 'node:crypto'
import { decryptPollVote, jidNormalizedUser } from '@whiskeysockets/baileys'

const polls = new Map() // id da enquete → { jid, secret, options }
const sha = (s) => createHash('sha256').update(Buffer.from(s)).digest().toString('hex')

/** Manda uma enquete de escolha única e guarda o que precisa para ler o voto. */
export async function sendPoll(sock, jid, name, options, quoted) {
  const msg = await sock.sendMessage(jid, { poll: { name, values: options, selectableCount: 1 } }, quoted ? { quoted } : undefined)
  const secret = msg?.message?.messageContextInfo?.messageSecret
  polls.set(msg.key.id, { jid, secret, options, at: Date.now() })
  // limpa enquetes velhas
  for (const [id, p] of polls) if (Date.now() - p.at > 60 * 60 * 1000) polls.delete(id)
  return msg.key.id
}

/** Se a mensagem for um voto numa enquete nossa, devolve { pollId, option } (ou null). */
export function readVote(sock, m) {
  const upd = m.message?.pollUpdateMessage
  if (!upd?.vote) return null
  const pollId = upd.pollCreationMessageKey?.id
  const poll = polls.get(pollId)
  if (!poll?.secret) return null
  // a criptografia usa os identificadores de quem criou e de quem votou; o WhatsApp pode usar
  // o número (@s.whatsapp.net) ou o identificador anônimo (@lid) — testamos as combinações
  const me = [sock.user?.id, sock.user?.lid].filter(Boolean).map((j) => jidNormalizedUser(j))
  const voters = [m.key.participant, m.key.participantAlt, m.key.remoteJid, m.key.remoteJidAlt]
    .filter(Boolean)
    .map((j) => jidNormalizedUser(j))
  for (const creator of [...new Set(me)]) {
    for (const voter of [...new Set(voters)]) {
      try {
        const vote = decryptPollVote(upd.vote, { pollCreatorJid: creator, pollMsgId: pollId, pollEncKey: poll.secret, voterJid: voter })
        const hashes = (vote.selectedOptions || []).map((b) => Buffer.from(b).toString('hex'))
        if (!hashes.length) return { pollId, option: null } // desmarcou
        const option = poll.options.find((o) => hashes.includes(sha(o))) ?? null
        return { pollId, option }
      } catch {
        /* tenta a próxima combinação */
      }
    }
  }
  return null
}
