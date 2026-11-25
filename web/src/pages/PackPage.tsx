import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StickerDialog } from '../components/StickerDialog'
import { StickerTile } from '../components/StickerTile'
import { countDownload, getPack, toSticker, type RemotePack } from '../lib/api'
import { download, slug, zipStickers, type Sticker } from '../lib/store'

export default function PackPage() {
  const { id = '' } = useParams()
  const [p, setP] = useState<RemotePack | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<Sticker | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    getPack(id)
      .then((d) => {
        setP(d)
        document.title = `${d.name}: pacote de figurinhas | Zapfig`
      })
      .catch((e) => setErr(e.message))
  }, [id])

  if (err)
    return (
      <div className="wrap py-10">
        <div className="panel p-8"><h1 className="text-3xl">{err}</h1><Link to="/galeria?aba=pacotes" className="btn-main mt-6">Ver pacotes</Link></div>
      </div>
    )
  if (!p) return <div className="wrap py-10 text-muted">Carregando…</div>
  const stickers = (p.stickers ?? []).map(toSticker)

  return (
    <div className="wrap py-10">
      <Link to="/galeria?aba=pacotes" className="btn-ghost -ml-3 text-muted">Voltar para os pacotes</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
        <div>
          <div className="flex items-center gap-4">
            <img src={p.cover} alt="" className="h-20 w-20 object-contain" />
            <div>
              <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] leading-none">{p.name}</h1>
              <p className="mt-2 text-muted">{p.author ? `Por ${p.author}. ` : ''}{p.count} figurinhas{p.kind === 'animated' ? ' animadas' : ''}, {p.downloads} downloads</p>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
            {stickers.map((s) => <StickerTile key={s.id} sticker={s} onOpen={setOpen} />)}
          </div>
        </div>
        <aside className="panel grid gap-3 p-5 lg:sticky lg:top-24">
          <h2 className="text-xl">Levar para o WhatsApp</h2>
          <button className="btn-main" onClick={async () => { countDownload('packs', p.id); download(await zipStickers(stickers), `${slug(p.name)}.zip`) }}>
            Baixar pacote (.zip)
          </button>
          <button className="btn-soft" onClick={async () => { await navigator.clipboard?.writeText(location.href); setMsg('Link copiado.') }}>Copiar link do pacote</button>
          {msg && <p className="text-sm text-muted" role="status">{msg}</p>}
          <p className="text-xs text-muted">O .zip traz cada figurinha em WebP e o som em OGG. Veja <Link className="text-ink underline underline-offset-4" to="/como-usar">como pôr no WhatsApp</Link>.</p>
        </aside>
      </div>
      <StickerDialog sticker={open} onClose={() => setOpen(null)} />
    </div>
  )
}
