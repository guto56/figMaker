import { useEffect, useRef, useState } from 'react'
import { LIMITS, toWav } from '../lib/ffmpeg'
import { SoundLibrary } from './SoundLibrary'

export type AudioClip = {
  wav: Blob
  name: string
  duration: number
  start: number
  length: number
  volume: number
  fade: boolean
}

type Props = {
  clip: AudioClip | null
  onChange: (c: AudioClip | null) => void
  videoFile?: Blob | null
  videoStart?: number
  setBusy: (s: string) => void
}

let ctxSingleton: AudioContext | null = null
export const actx = () => (ctxSingleton ??= new AudioContext())

export function fmt(s: number) {
  return `${s.toFixed(1).replace('.', ',')} s`
}

export function AudioEditor({ clip, onChange, videoFile, videoStart = 0, setBusy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [recTime, setRecTime] = useState(0)
  const [err, setErr] = useState('')
  const [playing, setPlaying] = useState(false)
  const [lib, setLib] = useState(!clip)
  const srcNode = useRef<AudioBufferSourceNode | null>(null)

  useEffect(() => {
    if (!clip) return setBuffer(null)
    let alive = true
    clip.wav.arrayBuffer().then((ab) => actx().decodeAudioData(ab)).then((b) => alive && setBuffer(b)).catch(() => setErr('Não deu para ler esse áudio.'))
    return () => {
      alive = false
    }
  }, [clip?.wav])

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !buffer || !clip) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = c.clientHeight
    c.width = w * dpr
    c.height = h * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.clearRect(0, 0, w, h)
    const data = buffer.getChannelData(0)
    const bars = Math.floor(w / 3)
    const per = Math.floor(data.length / bars)
    const s0 = clip.start / buffer.duration
    const s1 = (clip.start + clip.length) / buffer.duration
    for (let i = 0; i < bars; i++) {
      let peak = 0
      for (let j = 0; j < per; j += 16) peak = Math.max(peak, Math.abs(data[i * per + j] || 0))
      const bh = Math.max(2, peak * h * 0.9)
      const pos = i / bars
      g.fillStyle = pos >= s0 && pos <= s1 ? '#c2501b' : '#c9c9c4'
      g.fillRect(i * 3, (h - bh) / 2, 2, bh)
    }
  }, [buffer, clip?.start, clip?.length])

  const load = async (file: Blob, name: string) => {
    setErr('')
    setBusy('Lendo o áudio…')
    try {
      const wav = await toWav(file)
      const ab = await wav.arrayBuffer()
      const b = await actx().decodeAudioData(ab.slice(0))
      onChange({ wav, name, duration: b.duration, start: 0, length: Math.min(b.duration, LIMITS.maxSeconds), volume: 1, fade: true })
    } catch (e) {
      setErr((e as Error).message || 'Não deu para ler esse áudio.')
    } finally {
      setBusy('')
    }
  }

  const startRec = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setRec(null)
        load(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'Gravação')
      }
      mr.start()
      setRec(mr)
      const t0 = Date.now()
      setRecTime(0)
      const iv = setInterval(() => {
        const s = (Date.now() - t0) / 1000
        setRecTime(s)
        if (s >= LIMITS.maxSeconds || mr.state !== 'recording') {
          clearInterval(iv)
          if (mr.state === 'recording') mr.stop()
        }
      }, 100)
    } catch {
      setErr('O navegador não liberou o microfone. Permita o acesso e tente de novo.')
    }
  }

  const stopPlay = () => {
    srcNode.current?.stop()
    srcNode.current = null
    setPlaying(false)
  }
  const play = () => {
    if (!buffer || !clip) return
    if (playing) return stopPlay()
    const ctx = actx()
    ctx.resume()
    const n = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = clip.volume
    n.buffer = buffer
    n.connect(gain).connect(ctx.destination)
    n.onended = () => setPlaying(false)
    n.start(0, clip.start, clip.length)
    srcNode.current = n
    setPlaying(true)
  }
  useEffect(() => stopPlay, [])

  const set = (p: Partial<AudioClip>) => clip && onChange({ ...clip, ...p })
  const maxStart = clip ? Math.max(0, clip.duration - 0.3) : 0

  return (
    <div className="grid gap-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {rec ? (
          <button className="btn-main bg-accent" onClick={() => rec.stop()}>
            Parar gravação ({fmt(recTime)})
          </button>
        ) : (
          <button className="btn-soft" onClick={startRec}>
            <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" /> Gravar voz
          </button>
        )}
        <label className="btn-soft cursor-pointer">
          Enviar áudio
          <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0], e.target.files[0].name)} />
        </label>
        <button className="btn-soft" disabled={!videoFile} onClick={() => videoFile && load(videoFile, 'Áudio do vídeo')} title={videoFile ? '' : 'Escolha um vídeo na origem'}>
          Usar som do vídeo
        </button>
      </div>
      <button className={`btn ${lib ? 'bg-ink text-paper' : 'bg-paper ring-1 ring-line hover:ring-ink'} justify-self-start`} onClick={() => setLib(!lib)} aria-expanded={lib}>
        {lib ? 'Fechar biblioteca de sons' : 'Buscar som de meme ou efeito'}
      </button>
      {lib && <SoundLibrary onUse={(b, t) => { setLib(false); load(b, t) }} />}
      {err && <p className="text-sm text-accent" role="alert">{err}</p>}

      {clip ? (
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{clip.name}</span>
            <button className="btn-ghost text-muted" onClick={() => { stopPlay(); onChange(null) }}>Tirar som</button>
          </div>
          <canvas ref={canvasRef} className="h-20 w-full rounded-xl bg-paper ring-1 ring-line" aria-hidden="true" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="label">Começo: {fmt(clip.start)}</span>
              <input type="range" min={0} max={maxStart} step={0.05} value={clip.start} onChange={(e) => {
                const start = Number(e.target.value)
                set({ start, length: Math.min(clip.length, clip.duration - start) })
              }} />
            </label>
            <label className="grid gap-1">
              <span className="label">Duração: {fmt(clip.length)}</span>
              <input type="range" min={0.3} max={Math.max(0.3, Math.min(LIMITS.maxSeconds, clip.duration - clip.start))} step={0.05} value={clip.length} onChange={(e) => set({ length: Number(e.target.value) })} />
            </label>
            <label className="grid gap-1">
              <span className="label">Volume: {Math.round(clip.volume * 100)}%</span>
              <input type="range" min={0.2} max={2.5} step={0.05} value={clip.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
            </label>
            <label className="flex min-h-11 items-center gap-3 self-end">
              <input type="checkbox" className="h-5 w-5 accent-ink" checked={clip.fade} onChange={(e) => set({ fade: e.target.checked })} />
              Suavizar início e fim
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft" onClick={play} aria-pressed={playing}>{playing ? 'Parar' : 'Ouvir o trecho'}</button>
            {videoFile && <button className="btn-ghost" onClick={() => set({ start: Math.min(videoStart, maxStart) })}>Alinhar com o vídeo</button>}
          </div>
        </div>
      ) : (
        <p className="text-muted">Sem som, a figurinha sai normal. Com som, o WhatsApp toca o áudio quando alguém toca na figurinha.</p>
      )}
    </div>
  )
}
