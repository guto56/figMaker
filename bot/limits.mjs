// Limite de figurinhas feitas pelo robô: 3 por pessoa por dia (horário de Brasília).
// As figurinhas pedidas pelo site (código ZAPFIG) não contam.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 3)
// números sem limite (ex.: o dono), separados por vírgula; compara pelo final do número,
// com e sem o 9 depois do DDD, porque o WhatsApp registra alguns números sem ele
const UNLIMITED = (process.env.UNLIMITED_NUMBERS || '').split(',').map((n) => n.replace(/\D/g, '')).filter((n) => n.length >= 8)
export function isUnlimited(jid) {
  const d = String(jid).split('@')[0].replace(/\D/g, '')
  return UNLIMITED.some((n) => d.endsWith(n) || d.endsWith(n.slice(-8)))
}
const FILE = 'data/limites.json'
mkdirSync('data', { recursive: true })

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
let state = { day: today(), counts: {} }
try {
  state = JSON.parse(readFileSync(FILE, 'utf8'))
} catch {
  /* primeiro uso */
}
function roll() {
  if (state.day !== today()) state = { day: today(), counts: {} }
}
const save = () => writeFileSync(FILE, JSON.stringify(state))

export function remaining(jid) {
  if (isUnlimited(jid)) return Infinity
  roll()
  return Math.max(0, DAILY_LIMIT - (state.counts[jid] || 0))
}
export function consume(jid) {
  if (isUnlimited(jid)) return
  roll()
  state.counts[jid] = (state.counts[jid] || 0) + 1
  save()
}
