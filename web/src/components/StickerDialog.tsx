import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { asBlob, deleteSticker, download, shareSticker, slug, zipStickers, type Sticker } from '../lib/store'
import { SoundIcon, useSound, useUrl } from './StickerTile'

type Props = { sticker: Sticker | null; onClose: () => void; onDeleted?: (id: string) => void }

export function StickerDialog({ sticker, onClose, onDeleted }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const nav = useNavigate()
  const [size, setSize] = useState<string>('')
  const [msg, setMsg] = useState('')
  const img = useUrl(sticker?.webp)
  const snd = useUrl(sticker?.ogg ?? null)
  const { playing, play } = useSound(snd)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (sticker && !d.open) d.showModal()
    if (!sticker && d.open) d.close()
    setMsg('')
    if (sticker) asBlob(sticker.webp).then((b) => setSize(`${Math.round(b.size / 1024)} KB`))
  }, [sticker])

  if (!sticker) return <dialog ref={ref} onClose={onClose} />
  const name = slug(sticker.name)

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="w-[min(100vw-32px,880px)] rounded-xl2 bg-bg p-0 text-ink backdrop:bg-ink/40"
      aria-label={sticker.name}
    >
      <div className="grid gap-6 p-4 sm:grid-cols-[1fr_1fr] sm:p-6">
        <div className="checker relative aspect-square overflow-hidden rounded-xl2 ring-1 ring-line">
          {img && <img src={img} alt={sticker.name} className={`h-full w-full object-contain p-4 ${playing ? 'playing' : ''}`} />}
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-3xl">{sticker.name}</h2>
            <button className="btn-ghost -mr-2 -mt-1 h-11 w-11 px-0" onClick={() => ref.current?.close()} aria-label="Fechar">
              <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" strokeWidth="2" fill="none"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <p className="mono text-muted">
            512 × 512 px, WebP {sticker.kind === 'animated' ? 'animada' : 'estática'}, {size}
            {sticker.ogg ? ', com som Opus' : ''}
          </p>
          {sticker.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sticker.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface px-2.5 py-1 text-sm text-muted">{t}</span>
              ))}
            </div>
          )}
          {snd && (
            <button className="btn-soft self-start" onClick={play} aria-pressed={playing}>
              <SoundIcon /> {playing ? 'Parar o som' : 'Ouvir o som'}
            </button>
          )}
          <div className="mt-auto grid gap-2">
            <button className="btn-main" onClick={async () => download(await zipStickers([sticker]), `${name}.zip`)}>
              Baixar figurinha {sticker.ogg ? 'e som (.zip)' : '(.zip)'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-soft" onClick={async () => download(await asBlob(sticker.webp), `${name}.webp`)}>Só a imagem</button>
              {sticker.ogg ? (
                <button className="btn-soft" onClick={async () => download(await asBlob(sticker.ogg!), `${name}.ogg`)}>Só o som</button>
              ) : (
                <button className="btn-soft" onClick={() => nav(`/criar?de=${encodeURIComponent(sticker.id)}`)}>Pôr som nela</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-soft"
                onClick={async () => {
                  const ok = await shareSticker(sticker)
                  if (!ok) setMsg('Este navegador não compartilha arquivos. Baixe e envie pelo WhatsApp.')
                }}
              >
                Compartilhar
              </button>
              {sticker.seed ? (
                <button className="btn-soft" onClick={() => nav(`/criar?de=${encodeURIComponent(sticker.id)}`)}>Editar cópia</button>
              ) : (
                <button
                  className="btn-soft text-accent"
                  onClick={async () => {
                    await deleteSticker(sticker.id)
                    onDeleted?.(sticker.id)
                    ref.current?.close()
                  }}
                >
                  Apagar
                </button>
              )}
            </div>
            {msg && <p className="text-sm text-muted" role="status">{msg}</p>}
          </div>
        </div>
      </div>
    </dialog>
  )
}
