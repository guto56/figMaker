import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { StickerDialog } from '../components/StickerDialog'
import { StickerTile } from '../components/StickerTile'
import { SEED } from '../lib/seed'
import { download, listMine, zipStickers, type Sticker } from '../lib/store'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
type Filter = 'todas' | 'som' | 'animada' | 'estatica'

export default function Gallery() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('aba') === 'minhas' ? 'minhas' : 'exemplos'
  const [mine, setMine] = useState<Sticker[]>([])
  const [q, setQ] = useState('')
  const [f, setF] = useState<Filter>('todas')
  const [open, setOpen] = useState<Sticker | null>(null)

  useEffect(() => {
    listMine().then(setMine)
  }, [])

  const source = tab === 'minhas' ? mine : SEED
  const list = useMemo(() => {
    const nq = norm(q.trim())
    return source.filter((s) => {
      if (f === 'som' && !s.ogg) return false
      if (f === 'animada' && s.kind !== 'animated') return false
      if (f === 'estatica' && s.kind !== 'static') return false
      if (!nq) return true
      return norm([s.name, ...s.tags].join(' ')).includes(nq)
    })
  }, [source, q, f])

  const filters: Array<[Filter, string]> = [['todas', 'Todas'], ['som', 'Com som'], ['animada', 'Animadas'], ['estatica', 'Estáticas']]

  return (
    <div className="wrap py-10">
      <h1 className="text-[clamp(2.2rem,5vw,3.75rem)] leading-none">Galeria de figurinhas</h1>
      <p className="mt-4 max-w-xl text-muted">
        Busque, ouça e baixe. As figurinhas que você cria ficam em Minhas figurinhas, guardadas neste navegador.
      </p>

      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Coleção">
        <button role="tab" aria-selected={tab === 'exemplos'} className="chip" onClick={() => setParams({})}>Exemplos ({SEED.length})</button>
        <button role="tab" aria-selected={tab === 'minhas'} className="chip" onClick={() => setParams({ aba: 'minhas' })}>Minhas figurinhas ({mine.length})</button>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative md:w-80">
          <span className="sr-only">Buscar figurinha</span>
          <input className="field pl-10" placeholder="Buscar: gato, sextou, kkkk" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        </label>
        <div className="flex flex-wrap gap-2">
          {filters.map(([k, label]) => (
            <button key={k} className="chip" aria-pressed={f === k} onClick={() => setF(k)}>{label}</button>
          ))}
        </div>
        {tab === 'minhas' && mine.length > 0 && (
          <button className="btn-soft md:ml-auto" onClick={async () => download(await zipStickers(list), 'minhas-figurinhas.zip')}>
            Baixar todas (.zip)
          </button>
        )}
      </div>

      {list.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {list.map((s) => <StickerTile key={s.id} sticker={s} onOpen={setOpen} />)}
        </div>
      ) : (
        <div className="panel mt-8 flex flex-col items-center gap-4 px-6 py-16 text-center">
          <img src="/seed/sapo.webp" alt="" className="h-28 w-28" />
          <p className="max-w-sm text-muted">
            {tab === 'minhas' && mine.length === 0
              ? 'Você ainda não salvou nenhuma figurinha. As que você criar aparecem aqui.'
              : 'Nenhuma figurinha com esse nome ou filtro. Tente outra palavra.'}
          </p>
          <Link to="/criar" className="btn-main">Criar figurinha</Link>
        </div>
      )}

      <StickerDialog sticker={open} onClose={() => setOpen(null)} onDeleted={(id) => setMine((m) => m.filter((s) => s.id !== id))} />
    </div>
  )
}
