import { useEffect, useMemo, useState } from 'react'

type Meme = { id: string; name: string; url: string; width: number; height: number }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function MemeSearch({ onPick }: { onPick: (blob: Blob, name: string) => void }) {
  const [memes, setMemes] = useState<Meme[] | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [loadingId, setLoadingId] = useState('')

  useEffect(() => {
    fetch('/api/memes')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMemes(d.memes))
      .catch(() => setErr('A busca de memes não respondeu. Tente de novo em instantes.'))
  }, [])

  const list = useMemo(() => {
    if (!memes) return []
    const nq = norm(q.trim())
    return memes.filter((m) => !nq || norm(m.name).includes(nq)).slice(0, 48)
  }, [memes, q])

  const pick = async (m: Meme) => {
    setLoadingId(m.id)
    try {
      const r = await fetch(`/api/img?u=${encodeURIComponent(m.url)}`)
      if (!r.ok) throw new Error()
      onPick(await r.blob(), m.name)
    } catch {
      setErr('Não deu para abrir esse meme.')
    } finally {
      setLoadingId('')
    }
  }

  return (
    <div className="grid gap-3">
      <label>
        <span className="sr-only">Buscar meme</span>
        <input className="field" type="search" placeholder="Buscar meme em inglês: drake, distracted, doge" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {err && <p className="text-sm text-accent" role="alert">{err}</p>}
      {!memes && !err && <p className="text-muted">Carregando os memes mais usados…</p>}
      <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
        {list.map((m) => (
          <button key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-surface ring-1 ring-line hover:ring-ink" onClick={() => pick(m)} aria-label={`Usar o meme ${m.name}`}>
            <img src={`/api/img?u=${encodeURIComponent(m.url)}&w=240`} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-ink/70 px-2 py-1 text-left text-xs text-paper">{loadingId === m.id ? 'Abrindo…' : m.name}</span>
          </button>
        ))}
      </div>
      {memes && <p className="text-xs text-muted">Os 100 modelos de meme mais usados no Imgflip.</p>}
    </div>
  )
}
