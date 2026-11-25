import { useEffect, useRef, useState } from 'react'
import type { Sticker } from '../lib/store'

export function useUrl(x: Blob | string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!x) return setUrl(null)
    if (typeof x === 'string') return setUrl(x)
    const u = URL.createObjectURL(x)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [x])
  return url
}

let current: HTMLAudioElement | null = null

export function useSound(src: string | null) {
  const [playing, setPlaying] = useState(false)
  const ref = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => ref.current?.pause(), [])
  const play = () => {
    if (!src) return
    if (!ref.current) {
      ref.current = new Audio(src)
      ref.current.onended = () => setPlaying(false)
      ref.current.onpause = () => setPlaying(false)
    }
    const a = ref.current
    if (playing) return a.pause()
    if (current && current !== a) current.pause()
    current = a
    a.currentTime = 0
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }
  return { playing, play }
}

export function SoundIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </svg>
  )
}

type Props = {
  sticker: Sticker
  onOpen?: (s: Sticker) => void
  size?: 'sm' | 'md'
}

export function StickerTile({ sticker, onOpen }: Props) {
  const img = useUrl(sticker.webp)
  const snd = useUrl(sticker.ogg ?? null)
  const { playing, play } = useSound(snd)
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onOpen?.(sticker)}
        className="block aspect-square w-full rounded-xl2 bg-paper p-3 ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-ink"
        aria-label={`Abrir ${sticker.name}`}
      >
        {img && <img src={img} alt={sticker.name} loading="lazy" className={`h-full w-full object-contain ${playing ? 'playing' : ''}`} />}
      </button>
      <div className="mt-2 flex min-h-11 items-center justify-between gap-2">
        <span className="truncate text-[15px]">{sticker.name}</span>
        {snd && (
          <button
            type="button"
            onClick={play}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent hover:bg-surface"
            aria-label={playing ? `Parar o som de ${sticker.name}` : `Ouvir ${sticker.name}`}
            aria-pressed={playing}
          >
            <SoundIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}
