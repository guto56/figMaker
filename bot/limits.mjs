// Limite de figurinhas feitas pelo robô: 3 por pessoa por dia (horário de Brasília).
// As figurinhas pedidas pelo site (código ZAPFIG) não contam.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 3)
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
  roll()
  return Math.max(0, DAILY_LIMIT - (state.counts[jid] || 0))
}
export function consume(jid) {
  roll()
  state.counts[jid] = (state.counts[jid] || 0) + 1
  save()
}
