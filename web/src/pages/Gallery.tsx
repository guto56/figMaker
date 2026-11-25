import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { StickerDialog } from '../components/StickerDialog'
import { StickerTile } from '../components/StickerTile'
import { listPacks, listStickers, toSticker, type RemotePack } from '../lib/api'
import { SEED } from '../lib/seed'
import { download, listMine, zipStickers, type Sticker } from '../lib/store'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
type Filter = 'todas' | 'som' | 'animada' | 'estatica'
type Tab = 'comunidade' | 'pacotes' | 'exemplos' | 'minhas'

export function PackCard({ p }: { p: RemotePack }) {
  return (
    <Link to={`/p/${p.id}`} className="panel flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:ring-ink">
      <img src={p.cover} alt="" className="h-20 w-20 shrink-0 object-contain" loading="lazy" />
      <span className="min-w-0">
        <span className="block truncate text-lg">{p.name}</span>
        <span className="block truncate text-sm text-muted">{p.author ? `${p.author}, ` : ''}{p.count} figurinhas{p.kind === 'animated' ? ' animadas' : ''}</span>
      </span>
    </Link>
  )
}

export default function Gallery() {
  const [params, setParams] = useSearchParams()
  const tab = (['comunidade', 'pacotes', 'exemplos', 'minhas'].includes(params.get('aba') ?? '') ? params.get('aba') : 'comunidade') as Tab
  const [mine, setMine] = useState<Sticker[]>([])
  const [q, setQ] = useState(params.get('q') ?? '')
  const [dq, setDq] = useState(q)
  const [f, setF] = useState<Filter>('todas')
  const [sort, setSort] = useState<'new' | 'top'>('new')
  const [open, setOpen] = useState<Sticker | null>(null)
  const [remote, setRemote] = useState<Sticker[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [packs, setPacks] = useState<RemotePack[] | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    listMine().then(setMine)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const loadRemote = async (offset: number) => {
    const id = ++reqId.current
    setLoading(true)
    setErr('')
    try {
      const d = await listStickers({
        q: dq,
        sort,
        sound: f === 'som',
        kind: f === 'animada' ? 'animated' : f === 'estatica' ? 'static' : undefined,
        offset,
      })
      if (id !== reqId.current) return
      const items = d.items.map(toSticker)
      setRemote((o) => (offset === 0 ? items : [...o, ...items]))
      setNext(d.next)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (tab === 'comunidade') loadRemote(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dq, f, sort])
  useEffect(() => {
    if (tab === 'pacotes' && !packs) listPacks().then(setPacks).catch(() => setPacks([]))
  }, [tab, packs])

  const local = useMemo(() => {
    const src = tab === 'minhas' ? mine : SEED
    const nq = norm(dq)
    return src.filter((s) => {
      if (f === 'som' && !s.ogg) return false
      if (f === 'animada' && s.kind !== 'animated') return false
      if (f === 'estatica' && s.kind !== 'static') return false
      return !nq || norm([s.name, ...s.tags].join(' ')).includes(nq)
    })
  }, [tab, mine, dq, f])

  const list = tab === 'comunidade' ? remote : local
  const filters: Array<[Filter, string]> = [['todas', 'Todas'], ['som', 'Com som'], ['animada', 'Animadas'], ['estatica', 'Estáticas']]
  const tabs: Array<[Tab, string]> = [['comunidade', 'Comunidade'], ['pacotes', 'Pacotes'], ['exemplos', `Exemplos (${SEED.length})`], ['minhas', `Minhas figurinhas (${mine.length})`]]
  const setTab = (t: Tab) => setParams(t === 'comunidade' ? {} : { aba: t })

  return (
    <div className="wrap py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[clamp(2.2rem,5vw,3.75rem)] leading-none">Galeria de figurinhas</h1>
        <Link to="/pacote/novo" className="btn-soft">Montar pacote</Link>
      </div>
      <p className="mt-4 max-w-xl text-muted">Busque, ouça e baixe figurinhas publicadas por quem usa o Zapfig. As que você salva ficam em Minhas figurinhas, neste navegador.</p>

      <div className="mt-8 flex gap-2 overflow-x-auto" role="tablist" aria-label="Coleção">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className="chip shrink-0" onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'pacotes' ? (
        <div className="mt-8">
          {!packs && <p className="text-muted">Carregando pacotes…</p>}
          {packs && packs.length === 0 && (
            <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
              <p className="max-w-sm text-muted">Ainda não há pacotes publicados. Junte de 3 a 30 figurinhas e publique o primeiro.</p>
              <Link to="/pacote/novo" className="btn-main">Montar pacote</Link>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{packs?.map((p) => <PackCard key={p.id} p={p} />)}</div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative md:w-80">
              <span className="sr-only">Buscar figurinha</span>
              <input className="field pl-10" placeholder="Buscar: gato, sextou, kkkk" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </label>
            <div className="flex flex-wrap gap-2">
              {filters.map(([k, label]) => <button key={k} className="chip" aria-pressed={f === k} onClick={() => setF(k)}>{label}</button>)}
            </div>
            {tab === 'comunidade' && (
              <div className="flex gap-2 md:ml-auto">
                <button className="chip" aria-pressed={sort === 'new'} onClick={() => setSort('new')}>Novas</button>
                <button className="chip" aria-pressed={sort === 'top'} onClick={() => setSort('top')}>Mais baixadas</button>
              </div>
            )}
            {tab === 'minhas' && mine.length > 0 && (
              <button className="btn-soft md:ml-auto" onClick={async () => download(await zipStickers(list), 'minhas-figurinhas.zip')}>Baixar todas (.zip)</button>
            )}
          </div>
          {err && <p className="mt-4 text-accent" role="alert">{err}</p>}

          {list.length > 0 && (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {list.map((s) => <StickerTile key={s.id} sticker={s} onOpen={setOpen} />)}
            </div>
          )}
          {loading && <p className="mt-8 text-muted">Carregando…</p>}
          {tab === 'comunidade' && next !== null && !loading && (
            <div className="mt-8 text-center"><button className="btn-soft" onClick={() => loadRemote(next)}>Ver mais</button></div>
          )}
          {!loading && list.length === 0 && (
            <div className="panel mt-8 flex flex-col items-center gap-4 px-6 py-16 text-center">
              <img src="/seed/sapo.webp" alt="" className="h-28 w-28" />
              <p className="max-w-sm text-muted">
                {tab === 'minhas' && mine.length === 0
                  ? 'Você ainda não salvou nenhuma figurinha. As que você criar aparecem aqui.'
                  : tab === 'comunidade' && !dq && f === 'todas'
                    ? 'Ninguém publicou ainda. Crie uma figurinha e toque em Publicar na galeria.'
                    : 'Nenhuma figurinha com esse nome ou filtro. Tente outra palavra.'}
              </p>
              <Link to="/criar" className="btn-main">Criar figurinha</Link>
            </div>
          )}
        </>
      )}

      <StickerDialog sticker={open} onClose={() => setOpen(null)} onDeleted={(id) => setMine((m) => m.filter((s) => s.id !== id))} />
    </div>
  )
}
