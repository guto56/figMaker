import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { countDownload, deleteRemote, editTokens, reportSticker } from '../lib/api'
import { asBlob, deleteSticker, download, shareSticker, slug, type Sticker } from '../lib/store'
import { SoundIcon, useSound, useUrl } from './StickerTile'
import { ReceiveWhatsApp } from './ReceiveWhatsApp'

type DetailProps = { sticker: Sticker; onClose?: () => void; onDeleted?: (id: string) => void; page?: boolean }

export function StickerDetail({ sticker, onClose, onDeleted, page }: DetailProps) {
  const nav = useNavigate()
  const [size, setSize] = useState('')
  const [msg, setMsg] = useState('')
  const img = useUrl(sticker.webp)
  const snd = useUrl(sticker.ogg ?? null)
  const { playing, play } = useSound(snd)
  const name = slug(sticker.name)
  const remoteId = sticker.remoteId
  const canUnpublish = !!(remoteId && editTokens()[remoteId])

  useEffect(() => {
    setMsg('')
    asBlob(sticker.webp).then((b) => setSize(`${Math.round(b.size / 1024)} KB`)).catch(() => {})
  }, [sticker])

  const counted = () => remoteId && countDownload('stickers', remoteId)
  const link = remoteId ? `${location.origin}/f/${remoteId}` : ''

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_1fr]">
      <div className="checker relative aspect-square overflow-hidden rounded-xl2 ring-1 ring-line">
        {img && <img src={img} alt={sticker.name} className={`h-full w-full object-contain p-4 ${playing ? 'playing' : ''}`} />}
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          {page ? <h1 className="text-4xl">{sticker.name}</h1> : <h2 className="text-3xl">{sticker.name}</h2>}
          {onClose && (
            <button className="btn-ghost -mr-2 -mt-1 h-11 w-11 shrink-0 px-0" onClick={onClose} aria-label="Fechar">
              <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" strokeWidth="2" fill="none"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        <p className="mono text-muted">
          512 × 512 px, WebP {sticker.kind === 'animated' ? 'animada' : 'estática'}, {size}
          {sticker.ogg ? ', com som Opus' : ''}
          {sticker.remote && typeof sticker.downloads === 'number' ? `. ${sticker.downloads} downloads` : ''}
        </p>
        {sticker.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sticker.tags.map((t) => (
              <Link key={t} to={`/galeria?q=${encodeURIComponent(t)}`} className="rounded-full bg-surface px-2.5 py-1 text-sm text-muted hover:text-ink">{t}</Link>
            ))}
          </div>
        )}
        {snd && (
          <button className="btn-soft self-start" onClick={play} aria-pressed={playing}>
            <SoundIcon /> {playing ? 'Parar o som' : 'Ouvir o som'}
          </button>
        )}
        <div className="mt-auto grid gap-2">
          <ReceiveWhatsApp
            kind={sticker.kind}
            hasSound={!!sticker.ogg}
            getFiles={async () => {
              counted()
              return { webp: await asBlob(sticker.webp), ogg: sticker.ogg ? await asBlob(sticker.ogg) : null }
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-soft" onClick={async () => { counted(); download(await asBlob(sticker.webp), `${name}.webp`) }}>Baixar figurinha</button>
            {sticker.ogg ? (
              <button className="btn-soft" onClick={async () => download(await asBlob(sticker.ogg!), `${name}.ogg`)}>Baixar o som</button>
            ) : (
              <button className="btn-soft" onClick={() => nav(`/criar?de=${encodeURIComponent(sticker.id)}`)}>Pôr som nela</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-soft"
              onClick={async () => {
                counted()
                const ok = await shareSticker(sticker)
                if (!ok) setMsg('Este navegador não compartilha arquivos. Baixe e envie pelo WhatsApp.')
              }}
            >
              Compartilhar
            </button>
            {link ? (
              <button className="btn-soft" onClick={async () => { await navigator.clipboard?.writeText(link); setMsg('Link copiado.') }}>Copiar link</button>
            ) : (
              <button className="btn-soft" onClick={() => nav(`/criar?de=${encodeURIComponent(sticker.id)}`)}>Editar cópia</button>
            )}
          </div>
          <div className="flex flex-wrap gap-x-1">
            {sticker.remote && <button className="btn-ghost text-muted" onClick={() => nav(`/criar?de=${encodeURIComponent(sticker.id)}`)}>Editar uma cópia</button>}
            {sticker.remote && remoteId && !canUnpublish && (
              <button className="btn-ghost text-muted" onClick={async () => { await reportSticker(remoteId); setMsg('Obrigado. Vamos revisar esta figurinha.') }}>Denunciar</button>
            )}
            {canUnpublish && (
              <button className="btn-ghost text-accent" onClick={async () => {
                try { await deleteRemote(remoteId!); setMsg('Retirada da galeria.') } catch (e) { setMsg((e as Error).message) }
              }}>Tirar da galeria</button>
            )}
            {!sticker.seed && !sticker.remote && (
              <button className="btn-ghost text-accent" onClick={async () => { await deleteSticker(sticker.id); onDeleted?.(sticker.id); onClose?.() }}>Apagar deste aparelho</button>
            )}
          </div>
          {msg && <p className="text-sm text-muted" role="status">{msg}</p>}
        </div>
      </div>
    </div>
  )
}

type Props = { sticker: Sticker | null; onClose: () => void; onDeleted?: (id: string) => void }

export function StickerDialog({ sticker, onClose, onDeleted }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (sticker && !d.open) d.showModal()
    if (!sticker && d.open) d.close()
  }, [sticker])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="w-[min(100vw-32px,880px)] rounded-xl2 bg-bg p-0 text-ink backdrop:bg-ink/40"
      aria-label={sticker?.name ?? 'Figurinha'}
    >
      {sticker && (
        <div className="p-4 sm:p-6">
          <StickerDetail sticker={sticker} onClose={() => ref.current?.close()} onDeleted={onDeleted} />
        </div>
      )}
    </dialog>
  )
}
