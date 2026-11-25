import { useEffect, useMemo, useRef, useState } from 'react'
import { searchMedia, type MediaItem, type MediaSource } from '../lib/api'

const TABS: Array<[MediaSource, string, string]> = [
  ['memes', 'Memes', 'Modelos de meme em imagem (Imgflip)'],
  ['gifs', 'GIFs', 'Viram figurinha animada'],
  ['stickers', 'Figurinhas', 'Figurinhas prontas com fundo transparente'],
  ['clips', 'Clips com som', 'Vídeo curto com áudio: a figurinha já sai com som'],
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export type Picked = { blob: Blob; name: string; kind: 'image' | 'video'; hasAudio: boolean }

export function MemeSearch({ onPick }: { onPick: (p: Picked) => void }) {
  const [src, setSrc] = useState<MediaSource>('memes')
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<MediaItem[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [opening, setOpening] = useState('')
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
      const d = await searchMedia(src, src === 'memes' ? '' : debounced, page)
      if (id !== req.current) return
      setItems((old) => (page === 1 ? d.items : [...old, ...d.items]))
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
  }, [src, src === 'memes' ? '' : debounced])

  const shown = useMemo(() => {
    if (src !== 'memes' || !debounced) return items
    const nq = norm(debounced)
    return items.filter((m) => norm(m.title).includes(nq))
  }, [items, src, debounced])

  const pick = async (m: MediaItem) => {
    setOpening(m.id)
    setErr('')
    try {
      const r = await fetch(m.full)
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      onPick({ blob, name: m.title || 'Meme', kind: m.kind, hasAudio: !!m.hasAudio })
    } catch {
      setErr('Não deu para abrir esse item. Tente outro.')
    } finally {
      setOpening('')
    }
  }

  const tab = TABS.find((t) => t[0] === src)!

  return (
    <div className="grid gap-3">
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Fonte">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={src === k} className="chip shrink-0" onClick={() => setSrc(k)}>{label}</button>
        ))}
      </div>
      <label>
        <span className="sr-only">Buscar</span>
        <input
          className="field"
          type="search"
          placeholder={src === 'memes' ? 'Filtrar: drake, distracted, doge' : 'Buscar: gato, susto, kkkk, bom dia'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <p className="text-sm text-muted">{tab[2]}</p>
      {err && <p className="text-sm text-accent" role="alert">{err}</p>}

      <div className="max-h-[440px] overflow-y-auto overscroll-contain pr-1">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {shown.map((m) => (
            <li key={m.id} className="relative">
              <button
                className="group block w-full overflow-hidden rounded-xl bg-surface ring-1 ring-line hover:ring-ink"
                onClick={() => pick(m)}
                aria-label={`Usar ${m.title || 'este item'}`}
              >
                <span className={`block aspect-square w-full ${src === 'stickers' ? 'checker' : ''}`}>
                  {m.previewVideo ? (
                    <video src={m.previewVideo} muted loop autoPlay playsInline className="h-full w-full object-cover" />
                  ) : (
                    <img src={m.preview} alt="" loading="lazy" className={`h-full w-full ${src === 'stickers' ? 'object-contain p-1' : 'object-cover'} transition group-hover:scale-[1.03]`} />
                  )}
                </span>
                <span className="block truncate px-2 py-1.5 text-left text-xs">{opening === m.id ? 'Abrindo…' : m.title || 'Sem título'}</span>
                {m.hasAudio && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[10px] text-paper">som</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {loading && <p className="py-4 text-center text-muted">Carregando…</p>}
        {!loading && shown.length === 0 && !err && <p className="py-4 text-center text-muted">Nada encontrado. Tente outra palavra.</p>}
        {next && !loading && src !== 'memes' && (
          <div className="py-3 text-center">
            <button className="btn-soft" onClick={() => load(next)}>Ver mais</button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted">{src === 'memes' ? 'Modelos do Imgflip.' : 'GIFs, figurinhas e clips do KLIPY.'}</p>
    </div>
  )
}
