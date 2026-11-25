import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AudioEditor, fmt, type AudioClip } from '../components/AudioEditor'
import { MemeSearch, type Picked } from '../components/MemeSearch'
import { getSticker, publishSticker, toSticker, type RemoteSticker } from '../lib/api'
import { SoundIcon, useSound, useUrl } from '../components/StickerTile'
import { canvasToWebp, defaultLayout, loadImage, renderStatic, textOverlay, type Layout } from '../lib/compose'
import { LIMITS, getFFmpeg, mediaDuration, toAnimatedWebp, toOpus, toWav } from '../lib/ffmpeg'
import { SEED } from '../lib/seed'
import { asBlob, download, getMine, newId, saveSticker, shareSticker, slug, zipStickers, type Sticker } from '../lib/store'

type Tab = 'origem' | 'editar' | 'som' | 'baixar'
type Video = { file: File | Blob; url: string; duration: number; start: number; length: number; fit: 'crop' | 'fit'; speed: number }
type Result = { webp: Blob; ogg: Blob | null; kind: 'static' | 'animated' }

const TABS: Array<[Tab, string]> = [['origem', 'Origem'], ['editar', 'Editar'], ['som', 'Som'], ['baixar', 'Baixar']]

export default function Maker() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('origem')
  const [mode, setMode] = useState<'image' | 'video' | null>(null)
  const [original, setOriginal] = useState<HTMLImageElement | null>(null)
  const [cutout, setCutout] = useState<HTMLImageElement | null>(null)
  const [useCut, setUseCut] = useState(false)
  const [video, setVideo] = useState<Video | null>(null)
  const [layout, setLayout] = useState<Layout>(defaultLayout())
  const [audio, setAudio] = useState<AudioClip | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [saved, setSaved] = useState('')
  const [showMemes, setShowMemes] = useState(false)
  const [published, setPublished] = useState<RemoteSticker | null>(null)
  const [publishing, setPublishing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const vidRef = useRef<HTMLVideoElement>(null)
  const drag = useRef<{ x: number; y: number; lx: number; ly: number } | null>(null)

  const img = useCut && cutout ? cutout : original

  // desenha a prévia
  useEffect(() => {
    if (mode === 'image' && canvasRef.current) renderStatic(canvasRef.current, img, layout)
    if (mode === 'video' && overlayRef.current) renderStatic(overlayRef.current, null, { ...defaultLayout(), text: layout.text })
  }, [mode, img, layout])

  // qualquer mudança invalida o resultado gerado
  useEffect(() => {
    setResult(null)
    setSaved('')
    setPublished(null)
  }, [img, layout, video?.start, video?.length, video?.fit, video?.speed, audio])

  // fontes podem chegar depois do primeiro desenho
  useEffect(() => {
    document.fonts?.ready.then(() => setLayout((l) => ({ ...l })))
  }, [])

  const setImage = useCallback(async (blob: Blob, label: string) => {
    setErr('')
    try {
      const im = await loadImage(blob)
      setOriginal(im)
      setCutout(null)
      setUseCut(false)
      setVideo(null)
      setMode('image')
      setLayout(defaultLayout())
      if (!name) setName(label.replace(/\.[a-z0-9]+$/i, '').slice(0, 40))
      setTab('editar')
    } catch {
      setErr('Esse arquivo não abriu como imagem.')
    }
  }, [name])

  const setVideoFile = async (file: File, label?: string) => {
    setErr('')
    const duration = await mediaDuration(file)
    setVideo({ file, url: URL.createObjectURL(file), duration, start: 0, length: Math.min(duration, LIMITS.maxSeconds), fit: file.type.includes('gif') ? 'fit' : 'crop', speed: 1 })
    setOriginal(null)
    setCutout(null)
    setMode('video')
    setLayout(defaultLayout())
    if (!name) setName((label ?? file.name.replace(/\.[a-z0-9]+$/i, '')).slice(0, 40))
    setTab('editar')
    if (!file.type.includes('gif')) {
      // usa o som do vídeo por padrão, se ele tiver
      toWav(file)
        .then(async (wav) => {
          const ab = await wav.arrayBuffer()
          const b = await new AudioContext().decodeAudioData(ab)
          setAudio({ wav, name: 'Áudio do vídeo', duration: b.duration, start: 0, length: Math.min(b.duration, LIMITS.maxSeconds), volume: 1, fade: true })
        })
        .catch(() => {})
    }
  }

  const onFile = (f?: File | null) => {
    if (!f) return
    if (f.type.startsWith('video/') || f.type === 'image/gif') return setVideoFile(f)
    if (f.type.startsWith('image/')) return setImage(f, f.name)
    setErr('Use uma imagem (PNG, JPG, WebP), um GIF ou um vídeo.')
  }

  const onPicked = (p: Picked) => {
    setShowMemes(false)
    if (p.kind === 'image' && !p.blob.type.includes('gif')) return setImage(p.blob, p.name)
    const type = p.blob.type && p.blob.type !== 'application/octet-stream' ? p.blob.type : 'video/mp4'
    const ext = type.includes('gif') ? 'gif' : type.includes('webm') ? 'webm' : type.includes('webp') ? 'webp' : 'mp4'
    setVideoFile(new File([p.blob], `${slug(p.name)}.${ext}`, { type }), p.name)
  }

  // carregar figurinha existente (?de=id)
  useEffect(() => {
    const id = params.get('de')
    if (!id) return
    ;(async () => {
      const s: Sticker | undefined = SEED.find((x) => x.id === id) ?? (id.startsWith('r-') ? toSticker(await getSticker(id.slice(2))) : await getMine(id))
      if (!s) return
      await setImage(await asBlob(s.webp), s.name)
      setName(s.name)
      setTags(s.tags.join(', '))
      if (s.ogg) {
        const wav = await toWav(await asBlob(s.ogg)).catch(() => null)
        if (wav) {
          const b = await new AudioContext().decodeAudioData(await wav.arrayBuffer())
          setAudio({ wav, name: 'Som da figurinha', duration: b.duration, start: 0, length: Math.min(b.duration, LIMITS.maxSeconds), volume: 1, fade: false })
        }
      }
    })()
  }, [params])

  // colar imagem com Ctrl+V
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? [])[0]
      if (f) onFile(f)
    }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  })

  // vídeo da prévia toca só o trecho escolhido
  useEffect(() => {
    const v = vidRef.current
    if (!v || !video) return
    v.playbackRate = video.speed
    v.currentTime = video.start
    const t = () => {
      if (v.currentTime >= video.start + video.length || v.currentTime < video.start - 0.2) v.currentTime = video.start
    }
    v.addEventListener('timeupdate', t)
    return () => v.removeEventListener('timeupdate', t)
  }, [video?.start, video?.length, video?.speed, video?.url])

  const removeBg = async () => {
    if (!original) return
    if (cutout) return setUseCut(!useCut)
    setErr('')
    setBusy('Baixando o modelo de remoção de fundo (só na primeira vez)…')
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const src = await fetch(original.src).then((r) => r.blob())
      const out = await removeBackground(src, {
        model: 'isnet_quint8',
        progress: (key: string, cur: number, total: number) => {
          if (key.startsWith('fetch')) setBusy(`Baixando o modelo: ${Math.round((cur / Math.max(total, 1)) * 100)}%`)
          else setBusy('Tirando o fundo…')
        },
      })
      setCutout(await loadImage(out))
      setUseCut(true)
      setLayout((l) => ({ ...l, outline: l.outline || 10 }))
    } catch {
      setErr('Não deu para tirar o fundo neste aparelho. Tente uma imagem menor ou outro navegador.')
    } finally {
      setBusy('')
    }
  }

  const generate = async () => {
    setErr('')
    setTab('baixar')
    try {
      if (mode === 'video' || audio) {
        setBusy('Carregando o conversor (cerca de 30 MB, só na primeira vez)…')
        await getFFmpeg()
      }
      let webp: Blob
      let kind: Result['kind'] = 'static'
      if (mode === 'video' && video) {
        kind = 'animated'
        webp = await toAnimatedWebp(video.file, {
          start: video.start,
          duration: video.length,
          fit: video.fit,
          speed: video.speed,
          overlay: await textOverlay(layout.text),
          onStep: setBusy,
        })
      } else {
        setBusy('Gerando a imagem…')
        renderStatic(canvasRef.current!, img, layout)
        webp = await canvasToWebp(canvasRef.current!)
      }
      let ogg: Blob | null = null
      if (audio) {
        setBusy('Convertendo o som para Opus…')
        ogg = await toOpus(audio.wav, audio)
      }
      setResult({ webp, ogg, kind })
    } catch (e) {
      setErr((e as Error).message || 'Algo falhou ao gerar a figurinha.')
    } finally {
      setBusy('')
    }
  }

  const sticker = (): Sticker | null =>
    result && {
      id: newId(),
      name: name.trim() || 'Minha figurinha',
      kind: result.kind,
      webp: result.webp,
      ogg: result.ogg,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      createdAt: Date.now(),
    }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'image') return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, lx: layout.x, ly: layout.y }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const k = LIMITS.size / e.currentTarget.clientWidth
    setLayout((l) => ({ ...l, x: d.lx + (e.clientX - d.x) * k, y: d.ly + (e.clientY - d.y) * k }))
  }
  const onWheel = (e: React.WheelEvent) => {
    if (mode !== 'image') return
    setLayout((l) => ({ ...l, scale: Math.min(4, Math.max(0.2, l.scale * (e.deltaY < 0 ? 1.05 : 0.95))) }))
  }

  const L = (p: Partial<Layout>) => setLayout((l) => ({ ...l, ...p }))
  const T = (p: Partial<Layout['text']>) => setLayout((l) => ({ ...l, text: { ...l.text, ...p } }))
  const V = (p: Partial<Video>) => setVideo((v) => (v ? { ...v, ...p } : v))

  const resUrl = useUrl(result?.webp)
  const sndUrl = useUrl(result?.ogg ?? null)
  const { playing, play } = useSound(sndUrl)
  const limitKB = result?.kind === 'animated' ? LIMITS.animatedKB : LIMITS.staticKB
  const kb = result ? result.webp.size / 1024 : 0
  const hasSource = mode !== null

  return (
    <div className="wrap py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] leading-none">Criar figurinha</h1>
        <p className="mono text-muted">512 × 512 px, até {LIMITS.maxSeconds} s de som</p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,460px)_1fr] lg:items-start">
        {/* prévia */}
        <div className="lg:sticky lg:top-24">
          <div
            className="checker relative mx-auto aspect-square w-full max-w-[460px] overflow-hidden rounded-xl2 ring-1 ring-line"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              onFile(e.dataTransfer.files?.[0])
            }}
          >
            {mode === 'image' && (
              <canvas
                ref={canvasRef}
                className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onWheel={onWheel}
                aria-label="Prévia da figurinha. Arraste para mover."
              />
            )}
            {mode === 'video' && video && (
              <>
                <video
                  ref={vidRef}
                  src={video.url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className={`h-full w-full ${video.fit === 'crop' ? 'object-cover' : 'object-contain'}`}
                />
                <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
              </>
            )}
            {!hasSource && (
              <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 p-8 text-center">
                <img src="/seed/sapo.webp" alt="" className="h-24 w-24 opacity-90" />
                <span className="text-lg">Solte aqui uma imagem, GIF ou vídeo</span>
                <span className="text-muted">ou toque para escolher. Também dá para colar com Ctrl+V.</span>
                <input type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            )}
          </div>
          {hasSource && (
            <div className="mx-auto mt-3 flex max-w-[460px] flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>{mode === 'image' ? 'Arraste para mover. Role ou use o zoom para aumentar.' : `Trecho de ${fmt(video?.length ?? 0)} em loop`}</span>
              {audio && <span className="inline-flex items-center gap-1 text-accent"><SoundIcon /> {fmt(audio.length)}</span>}
            </div>
          )}
        </div>

        {/* controles */}
        <div className="min-w-0">
          <div className="flex gap-1 overflow-x-auto rounded-full bg-surface p-1" role="tablist" aria-label="Etapas">
            {TABS.map(([t, label], i) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                disabled={t !== 'origem' && !hasSource}
                onClick={() => (t === 'baixar' && !result ? generate() : setTab(t))}
                className={`btn min-h-10 flex-1 whitespace-nowrap px-3 ${tab === t ? 'bg-paper shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                <span className="mono mr-1 text-accent">{i + 1}</span> {label}
              </button>
            ))}
          </div>

          {busy && (
            <p className="mt-4 flex items-center gap-3 rounded-xl bg-paper px-4 py-3 ring-1 ring-line" role="status">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" /> {busy}
            </p>
          )}
          {err && <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-accent ring-1 ring-line" role="alert">{err}</p>}

          <div className="mt-6">
            {tab === 'origem' && (
              <div className="grid gap-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="panel flex cursor-pointer flex-col gap-1 p-5 transition hover:ring-ink">
                    <span className="text-xl">Imagem ou foto</span>
                    <span className="text-muted">PNG, JPG, WebP ou print. Dá para tirar o fundo.</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                  </label>
                  <label className="panel flex cursor-pointer flex-col gap-1 p-5 transition hover:ring-ink">
                    <span className="text-xl">Vídeo ou GIF</span>
                    <span className="text-muted">Vira figurinha animada. O som do vídeo já vem junto.</span>
                    <input type="file" accept="video/*,image/gif" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                  </label>
                </div>
                <div className="panel p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl">Memes, GIFs e clips com som</h2>
                      <p className="text-muted">Busque um meme real e use direto na figurinha.</p>
                    </div>
                    <button className="btn-soft" onClick={() => setShowMemes(!showMemes)} aria-expanded={showMemes}>
                      {showMemes ? 'Fechar busca' : 'Buscar meme'}
                    </button>
                  </div>
                  {showMemes && <div className="mt-4"><MemeSearch onPick={onPicked} /></div>}
                </div>
                <div className="panel p-5">
                  <h2 className="text-xl">Partir de uma figurinha da galeria</h2>
                  <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {SEED.map((s) => (
                      <button key={s.id} className="aspect-square rounded-xl p-1.5 ring-1 ring-line hover:ring-ink" onClick={async () => { await setImage(await asBlob(s.webp), s.name); setName(s.name) }} aria-label={`Usar ${s.name}`}>
                        <img src={s.webp as string} alt="" className="h-full w-full object-contain" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl2 border border-dashed border-line p-5 text-muted">
                  <span className="text-ink">Figurinha por IA</span> chega na próxima versão: descreva a figurinha e o Zapfig desenha.
                </div>
              </div>
            )}

            {tab === 'editar' && (
              <div className="grid gap-6">
                {mode === 'image' && (
                  <section className="panel grid gap-4 p-5" aria-label="Imagem">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-main" onClick={removeBg} disabled={!!busy}>
                        {cutout ? (useCut ? 'Voltar ao fundo original' : 'Usar sem fundo') : 'Tirar o fundo'}
                      </button>
                      <button className="btn-soft" onClick={() => L({ scale: 1, x: 0, y: 0, rotate: 0 })}>Centralizar</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-1"><span className="label">Zoom: {Math.round(layout.scale * 100)}%</span>
                        <input type="range" min={0.2} max={4} step={0.01} value={layout.scale} onChange={(e) => L({ scale: Number(e.target.value) })} /></label>
                      <label className="grid gap-1"><span className="label">Girar: {Math.round(layout.rotate)}°</span>
                        <input type="range" min={-180} max={180} step={1} value={layout.rotate} onChange={(e) => L({ rotate: Number(e.target.value) })} /></label>
                      <label className="grid gap-1"><span className="label">Contorno branco: {layout.outline}px</span>
                        <input type="range" min={0} max={20} step={1} value={layout.outline} onChange={(e) => L({ outline: Number(e.target.value) })} /></label>
                    </div>
                  </section>
                )}
                {mode === 'video' && video && (
                  <section className="panel grid gap-4 p-5" aria-label="Vídeo">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1"><span className="label">Começo: {fmt(video.start)}</span>
                        <input type="range" min={0} max={Math.max(0, video.duration - 0.5)} step={0.05} value={video.start} onChange={(e) => {
                          const start = Number(e.target.value)
                          V({ start, length: Math.min(video.length, video.duration - start) })
                        }} /></label>
                      <label className="grid gap-1"><span className="label">Duração: {fmt(video.length)}</span>
                        <input type="range" min={0.5} max={Math.max(0.5, Math.min(LIMITS.maxSeconds, video.duration - video.start))} step={0.05} value={video.length} onChange={(e) => V({ length: Number(e.target.value) })} /></label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="label mr-1">Quadro</span>
                      <button className="chip" aria-pressed={video.fit === 'crop'} onClick={() => V({ fit: 'crop' })}>Cortar quadrado</button>
                      <button className="chip" aria-pressed={video.fit === 'fit'} onClick={() => V({ fit: 'fit' })}>Encaixar inteiro</button>
                      <span className="label ml-3 mr-1">Velocidade</span>
                      {[0.5, 1, 1.5, 2].map((s) => (
                        <button key={s} className="chip" aria-pressed={video.speed === s} onClick={() => V({ speed: s })}>{String(s).replace('.', ',')}×</button>
                      ))}
                    </div>
                  </section>
                )}
                <section className="panel grid gap-4 p-5" aria-label="Texto">
                  <h2 className="text-xl">Texto de meme</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1"><span className="label">Em cima</span>
                      <input className="field" value={layout.text.top} onChange={(e) => T({ top: e.target.value })} placeholder="QUANDO A SEXTA CHEGA" maxLength={60} /></label>
                    <label className="grid gap-1"><span className="label">Embaixo</span>
                      <input className="field" value={layout.text.bottom} onChange={(e) => T({ bottom: e.target.value })} placeholder="SEXTOU" maxLength={60} /></label>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="grid min-w-48 flex-1 gap-1"><span className="label">Tamanho: {layout.text.size}px</span>
                      <input type="range" min={24} max={110} step={2} value={layout.text.size} onChange={(e) => T({ size: Number(e.target.value) })} /></label>
                    <div className="flex items-center gap-2" role="radiogroup" aria-label="Cor do texto">
                      {['#ffffff', '#000000', '#ffd23f', '#c2501b'].map((c) => (
                        <button key={c} role="radio" aria-checked={layout.text.color === c} aria-label={`Cor ${c}`} onClick={() => T({ color: c })}
                          className={`h-11 w-11 rounded-full ring-1 ring-line ${layout.text.color === c ? 'ring-2 ring-ink ring-offset-2' : ''}`} style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </section>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-main" onClick={() => setTab('som')}>Próximo: som</button>
                  <button className="btn-soft" onClick={generate}>Gerar sem som</button>
                </div>
              </div>
            )}

            {tab === 'som' && (
              <div className="grid gap-6">
                <section className="panel p-5" aria-label="Som">
                  <AudioEditor clip={audio} onChange={setAudio} videoFile={mode === 'video' && video && !video.file.type.includes('gif') ? video.file : null} videoStart={video?.start} setBusy={setBusy} />
                </section>
                <button className="btn-main justify-self-start" onClick={generate} disabled={!!busy}>Gerar figurinha</button>
              </div>
            )}

            {tab === 'baixar' && (
              <div className="grid gap-6">
                {!result && !busy && (
                  <div className="panel p-5">
                    <p className="text-muted">Gere a figurinha para baixar.</p>
                    <button className="btn-main mt-4" onClick={generate}>Gerar figurinha</button>
                  </div>
                )}
                {result && (
                  <>
                    <section className="panel grid gap-5 p-5 sm:grid-cols-[180px_1fr]" aria-label="Resultado">
                      <div className="checker aspect-square overflow-hidden rounded-xl ring-1 ring-line">
                        {resUrl && <img src={resUrl} alt="Figurinha gerada" className={`h-full w-full object-contain ${playing ? 'playing' : ''}`} />}
                      </div>
                      <div className="grid content-start gap-3">
                        <div>
                          <div className="flex items-center justify-between text-sm">
                            <span>Tamanho da imagem</span>
                            <span className="mono">{kb.toFixed(0)} de {limitKB} KB</span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
                            <div className={`h-full rounded-full ${kb <= limitKB ? 'bg-ink' : 'bg-accent'}`} style={{ width: `${Math.min(100, (kb / limitKB) * 100)}%` }} />
                          </div>
                          <p className={`mt-2 text-sm ${kb <= limitKB ? 'text-muted' : 'text-accent'}`}>
                            {kb <= limitKB ? 'Dentro do limite do WhatsApp.' : 'Passou do limite. Diminua a duração ou use Cortar quadrado.'}
                          </p>
                        </div>
                        <p className="mono text-muted">
                          WebP {result.kind === 'animated' ? 'animada' : 'estática'} 512 × 512
                          {result.ogg ? `, som Opus ${fmt(audio?.length ?? 0)} (${Math.round(result.ogg.size / 1024)} KB)` : ', sem som'}
                        </p>
                        {sndUrl && <button className="btn-soft justify-self-start" onClick={play} aria-pressed={playing}><SoundIcon /> {playing ? 'Parar o som' : 'Ouvir o som'}</button>}
                      </div>
                    </section>

                    <section className="panel grid gap-4 p-5" aria-label="Baixar">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1"><span className="label">Nome</span>
                          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gato julgando" maxLength={40} /></label>
                        <label className="grid gap-1"><span className="label">Palavras para busca, separadas por vírgula</span>
                          <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gato, bravo, julgando" /></label>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button className="btn-main" onClick={async () => { const s = sticker(); if (s) download(await zipStickers([s]), `${slug(s.name)}.zip`) }}>
                          Baixar figurinha (.zip)
                        </button>
                        <button className="btn-soft" onClick={async () => {
                          const s = sticker()
                          if (s && !(await shareSticker(s))) setErr('Este navegador não compartilha arquivos. Baixe e envie pelo WhatsApp.')
                        }}>Compartilhar no celular</button>
                        <button className="btn-soft" onClick={() => download(result.webp, `${slug(name || 'figurinha')}.webp`)}>Só a imagem (.webp)</button>
                        {result.ogg && <button className="btn-soft" onClick={() => download(result.ogg!, `${slug(name || 'figurinha')}.ogg`)}>Só o som (.ogg)</button>}
                        <button className="btn-soft" onClick={async () => {
                          const s = sticker()
                          if (!s) return
                          await saveSticker(s)
                          setSaved(s.id)
                        }} disabled={!!saved}>{saved ? 'Salva em Minhas figurinhas' : 'Salvar em Minhas figurinhas'}</button>
                        <button className="btn-soft" disabled={publishing || !!published} onClick={async () => {
                          const s = sticker()
                          if (!s || !result) return
                          setPublishing(true)
                          setErr('')
                          try {
                            const r = await publishSticker({ name: s.name, tags: s.tags, kind: s.kind, webp: result.webp, ogg: result.ogg })
                            setPublished(r)
                            await saveSticker({ ...s, remoteId: r.id })
                            setSaved(s.id)
                          } catch (e) {
                            setErr((e as Error).message)
                          } finally {
                            setPublishing(false)
                          }
                        }}>{published ? 'Publicada na galeria' : publishing ? 'Publicando…' : 'Publicar na galeria'}</button>
                      </div>
                      {published && (
                        <p className="text-sm text-muted" role="status">
                          Publicada. Link para compartilhar: <Link className="break-all text-ink underline underline-offset-4" to={`/f/${published.id}`}>{location.host}/f/{published.id}</Link>
                        </p>
                      )}
                      {saved && <p className="text-sm text-muted" role="status">Guardada neste navegador. <Link className="text-ink underline underline-offset-4" to="/galeria?aba=minhas">Ver minhas figurinhas</Link></p>}
                      <p className="text-sm text-muted">Depois de baixar, veja <Link className="text-ink underline underline-offset-4" to="/como-usar">como pôr no WhatsApp</Link>.</p>
                    </section>
                    <button className="btn-ghost justify-self-start" onClick={() => { setMode(null); setOriginal(null); setVideo(null); setAudio(null); setResult(null); setName(''); setTags(''); setTab('origem') }}>
                      Começar outra figurinha
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
