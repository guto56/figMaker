import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StickerDetail } from '../components/StickerDialog'
import { getSticker, toSticker } from '../lib/api'
import type { Sticker } from '../lib/store'

export default function StickerPage() {
  const { id = '' } = useParams()
  const [s, setS] = useState<Sticker | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    getSticker(id)
      .then((r) => {
        setS(toSticker(r))
        document.title = `${r.name}: figurinha para WhatsApp | Zapfig`
      })
      .catch((e) => setErr(e.message))
  }, [id])
  return (
    <div className="wrap py-10">
      <Link to="/galeria" className="btn-ghost -ml-3 text-muted">Voltar para a galeria</Link>
      <div className="mt-4">
        {s && <StickerDetail sticker={s} page />}
        {!s && !err && <p className="text-muted">Carregando…</p>}
        {err && (
          <div className="panel p-8">
            <h1 className="text-3xl">{err}</h1>
            <Link to="/galeria" className="btn-main mt-6">Ver a galeria</Link>
          </div>
        )}
      </div>
    </div>
  )
}
