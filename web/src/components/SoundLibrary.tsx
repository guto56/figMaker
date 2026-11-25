import { useEffect, useRef, useState } from 'react'
import { searchSounds, type SoundItem, type SoundSource } from '../lib/api'
import { SoundIcon } from './StickerTile'

const TABS: Array<[SoundSource, string, string]> = [
  ['myinstants', 'Memes BR', 'Sons de meme reais do MyInstants. Sem busca, mostra os mais tocados do Brasil.'],
  ['freesound', 'Efeitos', 'Efeitos sonoros do Freesound, com licença Creative Commons.'],
]

let playing: HTMLAudioElement | null = null

export function SoundLibrary({ onUse }: { onUse: (blob: Blob, title: string) => void }) {
  const [src, setSrc] = useState<SoundSource>('myinstants')
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<SoundItem[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [now, setNow] = useState('')
  const [using, setUsing] = useState('')
  const req = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const load = async (page: number) => {
    const id = ++req.current
    setLoading(true)
    setErr('')
    try {
      const d = await searchSounds(src, debounced, page)
      if (id !== req.current) return
      setItems((o) => (page === 1 ? d.items : [...o, ...d.items]))
      setNext(d.next)
    } catch (e) {
      if (id === req.current) setErr((e as Error).message)
    } finally {
      if (id === req.current) setLoading(false)
    }
  }
  useEffect(() => {
    setItems([])
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, debounced])
  useEffect(() => () => playing?.pause(), [])

  const preview = (s: SoundItem) => {
    if (now === s.id) {
      playing?.pause()
      return setNow('')
    }
    playing?.pause()
    const a = new Audio(s.url)
    a.onended = () => setNow('')
    a.play().catch(() => setErr('Não deu para tocar esse som.'))
    playing = a
    setNow(s.id)
  }

  const use = async (s: SoundItem) => {
    playing?.pause()
    setNow('')
    setUsing(s.id)
    try {
      const r = await fetch(s.url)
      if (!r.ok) throw new Error()
      onUse(await r.blob(), s.title)
    } catch {
      setErr('Não deu para baixar esse som.')
    } finally {
      setUsing('')
    }
  }

  const tab = TABS.find((t) => t[0] === src)!

  return (
    <div className="grid gap-3">
      <div className="flex gap-1" role="tablist" aria-label="Fonte de som">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={src === k} className="chip" onClick={() => setSrc(k)}>{label}</button>
        ))}
      </div>
      <label>
        <span className="sr-only">Buscar som</span>
        <input className="field" type="search" placeholder={src === 'myinstants' ? 'Buscar: faustão, vine boom, risada, errou' : 'Buscar em inglês: boing, applause, fart'} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <p className="text-sm text-muted">{tab[2]}</p>
      {err && <p className="text-sm text-accent" role="alert">{err}</p>}
      <div className="max-h-[360px] overflow-y-auto overscroll-contain rounded-xl ring-1 ring-line">
        <ul className="divide-y divide-line bg-paper">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-2 py-1.5">
              <button
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${now === s.id ? 'bg-accent text-paper' : 'bg-surface text-ink hover:bg-ink hover:text-paper'}`}
                onClick={() => preview(s)}
                aria-label={now === s.id ? `Parar ${s.title}` : `Ouvir ${s.title}`}
                aria-pressed={now === s.id}
              >
                <SoundIcon />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{s.title}</span>
                {s.credit && <span className="block truncate text-xs text-muted">{s.credit}</span>}
              </span>
              <button className="btn-soft min-h-10 shrink-0 px-4" onClick={() => use(s)} disabled={!!using}>
                {using === s.id ? 'Baixando…' : 'Usar'}
              </button>
            </li>
          ))}
        </ul>
        {loading && <p className="bg-paper py-4 text-center text-muted">Carregando…</p>}
        {!loading && items.length === 0 && !err && <p className="bg-paper py-4 text-center text-muted">Nenhum som encontrado.</p>}
        {next && !loading && (
          <div className="bg-paper py-3 text-center">
            <button className="btn-soft" onClick={() => load(next)}>Ver mais</button>
          </div>
        )}
      </div>
    </div>
  )
}
