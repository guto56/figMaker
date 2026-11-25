import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUrl } from '../components/StickerTile'
import { listStickers, publishPack, publishSticker, toSticker } from '../lib/api'
import { asBlob, listMine, saveSticker, type Sticker } from '../lib/store'

function Pick({ s, selected, disabled, onToggle }: { s: Sticker; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const img = useUrl(s.webp)
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !selected}
      aria-pressed={selected}
      className={`relative aspect-square rounded-xl bg-paper p-2 ring-1 transition disabled:opacity-35 ${selected ? 'ring-2 ring-accent' : 'ring-line hover:ring-ink'}`}
      aria-label={`${selected ? 'Tirar' : 'Pôr'} ${s.name}`}
    >
      {img && <img src={img} alt="" className="h-full w-full object-contain" />}
      {selected && <span className="absolute right-1.5 top-1.5 h-5 w-5 rounded-full bg-accent text-xs leading-5 text-paper">✓</span>}
    </button>
  )
}

export default function PackBuilder() {
  const nav = useNavigate()
  const [mine, setMine] = useState<Sticker[]>([])
  const [community, setCommunity] = useState<Sticker[]>([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Sticker[]>([])
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    listMine().then(setMine)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      listStickers({ q: q.trim(), limit: 48, sort: 'top' })
        .then((d) => setCommunity(d.items.map(toSticker)))
        .catch(() => setCommunity([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const kind = sel[0]?.kind
  const key = (s: Sticker) => s.remoteId ?? s.id
  const isSel = (s: Sticker) => sel.some((x) => key(x) === key(s))
  const toggle = (s: Sticker) => setSel((o) => (isSel(s) ? o.filter((x) => key(x) !== key(s)) : o.length >= 30 ? o : [...o, s]))
  const blocked = (s: Sticker) => sel.length >= 30 || (!!kind && s.kind !== kind)

  const mineFiltered = useMemo(() => mine.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase())), [mine, q])

  const create = async () => {
    setErr('')
    if (sel.length < 3) return setErr('Escolha pelo menos 3 figurinhas.')
    if (!name.trim()) return setErr('Dê um nome para o pacote.')
    try {
      const ids: string[] = []
      for (const [i, s] of sel.entries()) {
        if (s.remoteId) {
          ids.push(s.remoteId)
          continue
        }
        setBusy(`Publicando figurinha ${i + 1} de ${sel.length}…`)
        const r = await publishSticker({ name: s.name, tags: s.tags, kind: s.kind, webp: await asBlob(s.webp), ogg: s.ogg ? await asBlob(s.ogg) : null })
        await saveSticker({ ...s, remoteId: r.id })
        ids.push(r.id)
      }
      setBusy('Criando o pacote…')
      const id = await publishPack({ name: name.trim(), author: author.trim(), stickerIds: ids, coverId: ids[0] })
      nav(`/p/${id}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="wrap py-10">
      <h1 className="text-[clamp(2.2rem,5vw,3.75rem)] leading-none">Montar pacote</h1>
      <p className="mt-4 max-w-xl text-muted">Junte de 3 a 30 figurinhas, todas paradas ou todas animadas, como o WhatsApp exige. A primeira vira a capa.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="grid gap-8">
          <label className="relative md:w-80">
            <span className="sr-only">Buscar</span>
            <input className="field" type="search" placeholder="Buscar figurinha" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <section aria-labelledby="h-minhas">
            <h2 id="h-minhas" className="text-xl">Minhas figurinhas</h2>
            {mineFiltered.length === 0 ? (
              <p className="mt-2 text-muted">Nenhuma salva neste navegador. <Link to="/criar" className="text-ink underline underline-offset-4">Criar figurinha</Link></p>
            ) : (
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {mineFiltered.map((s) => <Pick key={s.id} s={s} selected={isSel(s)} disabled={blocked(s)} onToggle={() => toggle(s)} />)}
              </div>
            )}
          </section>
          <section aria-labelledby="h-comunidade">
            <h2 id="h-comunidade" className="text-xl">Da comunidade</h2>
            {community.length === 0 ? (
              <p className="mt-2 text-muted">Nada publicado com esse nome ainda.</p>
            ) : (
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {community.map((s) => <Pick key={s.id} s={s} selected={isSel(s)} disabled={blocked(s)} onToggle={() => toggle(s)} />)}
              </div>
            )}
          </section>
        </div>

        <aside className="panel grid gap-4 p-5 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">Seu pacote</h2>
            <span className={`mono ${sel.length >= 3 ? 'text-ink' : 'text-accent'}`}>{sel.length} de 30</span>
          </div>
          {sel.length > 0 ? (
            <div className="grid grid-cols-5 gap-1.5">
              {sel.map((s) => <Pick key={key(s)} s={s} selected disabled={false} onToggle={() => toggle(s)} />)}
            </div>
          ) : (
            <p className="text-sm text-muted">Toque nas figurinhas para colocar no pacote.</p>
          )}
          <label className="grid gap-1"><span className="label">Nome do pacote</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Bichos do grupo" /></label>
          <label className="grid gap-1"><span className="label">Autor (opcional)</span>
            <input className="field" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={64} placeholder="Seu nome ou @" /></label>
          <button className="btn-main" onClick={create} disabled={!!busy || sel.length < 3}>{busy || 'Publicar pacote'}</button>
          {err && <p className="text-sm text-accent" role="alert">{err}</p>}
          <p className="text-xs text-muted">Figurinhas suas que ainda não estão na galeria são publicadas junto com o pacote.</p>
        </aside>
      </div>
    </div>
  )
}
