import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AudioEditor, actx, fmt, type AudioClip } from '../components/AudioEditor'
import { MemeSearch, type Picked } from '../components/MemeSearch'
import { ReceiveWhatsApp } from '../components/ReceiveWhatsApp'
import { getSticker, publishSticker, sendConfig, toSticker, type RemoteSticker } from '../lib/api'
import { SoundIcon, useSound, useUrl } from '../components/StickerTile'
import { arrange, canvasToWebp, defaultLayout, hitTest, layerImg, loadImage, newLayer, renderStatic, textOverlay, type Arrange, type ImgLayer, type Layout } from '../lib/compose'
import { LIMITS, getFFmpeg, mediaDuration, toAnimatedWebp, toOpus, toWav } from '../lib/ffmpeg'
import { SEED } from '../lib/seed'
import { asBlob, download, getMine, newId, saveSticker, shareSticker, slug, type Sticker } from '../lib/store'

type Tab = 'origem' | 'editar' | 'som' | 'baixar'
type Video = { file: File | Blob; url: string; duration: number; start: number; length: number; fit: 'crop' | 'fit'; speed: number }
type Result = { webp: Blob; ogg: Blob | null; kind: 'static' | 'animated' }

const TABS: Array<[Tab, string]> = [['origem', 'Escolher'], ['editar', 'Editar'], ['som', 'Som'], ['baixar', 'Pronto']]

export default function Maker() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('origem')
  const [mode, setMode] = useState<'image' | 'video' | null>(null)
  const [layers, setLayers] = useState<ImgLayer[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [arr, setArr] = useState<Arrange>('livre')
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
  const [sendOn, setSendOn] = useState(true)
  useEffect(() => {
    sendConfig().then(setSendOn)
  }, [])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const vidRef = useRef<HTMLVideoElement>(null)
  const drag = useRef<{ id: string; x: number; y: number; lx: number; ly: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number; scale: number } | null>(null)

  const sel = layers.find((l) => l.id === selId) ?? layers[layers.length - 1] ?? null
  const MAX_LAYERS = 8

  // desenha a prévia (com a imagem escolhida marcada)
  useEffect(() => {
    if (mode === 'image' && canvasRef.current) renderStatic(canvasRef.current, layers, layout, sel?.id)
    if (mode === 'video' && overlayRef.current) renderStatic(overlayRef.current, [], { ...defaultLayout(), text: layout.text })
  }, [mode, layers, layout, sel?.id])

  // qualquer mudança invalida o resultado gerado
  useEffect(() => {
    setResult(null)
    setSaved('')
    setPublished(null)
  }, [layers, layout, video?.start, video?.length, video?.fit, video?.speed, audio])

  // fontes podem chegar depois do primeiro desenho
  useEffect(() => {
    document.fonts?.ready.then(() => setLayout((l) => ({ ...l })))
  }, [])

  /** Adiciona imagens como camadas. Com mais de uma, organiza lado a lado e redimensiona. */
  const addImages = useCallback(async (items: Array<{ blob: Blob; label: string }>, replace = false) => {
    setErr('')
    const loaded: ImgLayer[] = []
    for (const it of items) {
      try {
        loaded.push(newLayer(await loadImage(it.blob), it.label.replace(/\.[a-z0-9]+$/i, '').slice(0, 40)))
      } catch {
        setErr(`"${it.label}" não abriu como imagem.`)
      }
    }
    if (!loaded.length) return
    const base = replace || mode !== 'image' ? [] : layers
    const room = MAX_LAYERS - base.length
    if (loaded.length > room) setErr(`Cabem até ${MAX_LAYERS} imagens na mesma figurinha.`)
    const next = [...base, ...loaded.slice(0, Math.max(0, room))]
    if (next.length === base.length) return
    const mode2: Arrange = next.length === 1 ? 'livre' : base.length <= 1 && arr === 'livre' ? (next.length > 3 ? 'grade' : 'lado') : arr
    const outline = mode !== 'image' || replace ? 0 : layout.outline
    setArr(mode2)
    setLayers(arrange(next, mode2, outline))
    setSelId(next[next.length - 1].id)
    if (mode !== 'image' || replace) {
      setVideo(null)
      setMode('image')
      setLayout(defaultLayout())
    }
    if (!name) setName(loaded[0].name)
    setTab('editar')
  }, [arr, layers, layout.outline, mode, name])

  const setImage = (blob: Blob, label: string) => addImages([{ blob, label }])

  const setVideoFile = async (file: File, label?: string) => {
    setErr('')
    const duration = await mediaDuration(file)
    setVideo({ file, url: URL.createObjectURL(file), duration, start: 0, length: Math.min(duration, LIMITS.maxSeconds), fit: file.type.includes('gif') ? 'fit' : 'crop', speed: 1 })
    setLayers([])
    setMode('video')
    setLayout(defaultLayout())
    if (!name) setName((label ?? file.name.replace(/\.[a-z0-9]+$/i, '')).slice(0, 40))
    setTab('editar')
    if (!file.type.includes('gif')) {
      // usa o som do vídeo por padrão, se ele tiver
      toWav(file)
        .then(async (wav) => {
          const ab = await wav.arrayBuffer()
          const b = await actx().decodeAudioData(ab)
          setAudio({ wav, name: 'Áudio do vídeo', duration: b.duration, start: 0, length: Math.min(b.duration, LIMITS.maxSeconds), volume: 1, fade: true })
        })
        .catch(() => {})
    }
  }

  const onFiles = (list?: FileList | File[] | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const vid = files.find((f) => f.type.startsWith('video/') || f.type === 'image/gif')
    if (vid && files.length === 1) return setVideoFile(vid)
    const imgs = files.filter((f) => f.type.startsWith('image/') && f.type !== 'image/gif')
    if (imgs.length) return addImages(imgs.map((f) => ({ blob: f, label: f.name })))
    setErr(vid ? 'Vídeo e GIF entram sozinhos na figurinha. Escolha um de cada vez.' : 'Use uma imagem (PNG, JPG, WebP), um GIF ou um vídeo.')
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
      await addImages([{ blob: await asBlob(s.webp), label: s.name }], true)
      setName(s.name)
      setTags(s.tags.join(', '))
      if (s.ogg) {
        const wav = await toWav(await asBlob(s.ogg)).catch(() => null)
        if (wav) {
          const b = await actx().decodeAudioData(await wav.arrayBuffer())
          setAudio({ wav, name: 'Som da figurinha', duration: b.duration, start: 0, length: Math.min(b.duration, LIMITS.maxSeconds), volume: 1, fade: false })
        }
      }
    })()
  }, [params])

  // colar imagem com Ctrl+V
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const fs = Array.from(e.clipboardData?.files ?? [])
      if (fs.length) onFiles(fs)
    }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  })

  // libera a URL do vídeo anterior
  useEffect(() => {
    const u = video?.url
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [video?.url])

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

  const L = (id: string, p: Partial<ImgLayer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)))
  const relayout = (mode2: Arrange, ls = layers, outline = layout.outline) => {
    setArr(mode2)
    setLayers(arrange(ls, mode2, outline))
  }

  const removeBg = async () => {
    if (!sel) return
    if (sel.cutout) return L(sel.id, { useCut: !sel.useCut })
    setErr('')
    setBusy('Baixando o modelo de remoção de fundo (só na primeira vez)…')
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const src = await fetch(sel.original.src).then((r) => r.blob())
      const out = await removeBackground(src, {
        model: 'isnet_quint8',
        progress: (key: string, cur: number, total: number) => {
          if (key.startsWith('fetch')) setBusy(`Baixando o modelo: ${Math.round((cur / Math.max(total, 1)) * 100)}%`)
          else setBusy('Tirando o fundo…')
        },
      })
      const cutImg = await loadImage(out)
      const id = sel.id
      const outline = layout.outline || 10
      setLayers((ls) => arrange(ls.map((l) => (l.id === id ? { ...l, cutout: cutImg, useCut: true } : l)), arr, outline))
      setLayout((l) => ({ ...l, outline }))
    } catch {
      setErr('Não deu para tirar o fundo neste aparelho. Tente uma imagem menor ou outro navegador.')
    } finally {
      setBusy('')
    }
  }

  const reset = () => {
    setMode(null)
    setLayers([])
    setSelId(null)
    setArr('livre')
    setVideo(null)
    setAudio(null)
    setResult(null)
    setName('')
    setTags('')
    setLayout(defaultLayout())
    setTab('origem')
  }
  const removeLayer = (id: string) => {
    const next = layers.filter((l) => l.id !== id)
    if (!next.length) return reset()
    if (next.length === 1) {
      setArr('livre')
      setLayers([{ ...next[0], x: 0, y: 0, scale: 1, rotate: 0 }])
    } else relayout(arr, next)
    setSelId(next[next.length - 1].id)
  }
  const moveLayer = (id: string, dir: 1 | -1) => {
    const i = layers.findIndex((l) => l.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= layers.length) return
    const next = [...layers]
    ;[next[i], next[j]] = [next[j], next[i]]
    setLayers(arr === 'livre' ? next : arrange(next, arr, layout.outline))
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
        const out = document.createElement('canvas')
        renderStatic(out, layers, layout)
        webp = await canvasToWebp(out)
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

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { px: ((e.clientX - r.left) / r.width) * LIMITS.size, py: ((e.clientY - r.top) / r.height) * LIMITS.size }
  }
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'image') return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && sel) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: sel.scale }
      drag.current = null
      return
    }
    const { px, py } = toCanvas(e)
    const hit = hitTest(layers, px, py) ?? sel
    if (!hit) return
    setSelId(hit.id)
    drag.current = { id: hit.id, x: e.clientX, y: e.clientY, lx: hit.x, ly: hit.y }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && sel && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const k = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d
      if (arr !== 'livre') setArr('livre')
      L(sel.id, { scale: Math.min(4, Math.max(0.1, pinch.current.scale * k)) })
      return
    }
    const d = drag.current
    if (!d) return
    const k = LIMITS.size / e.currentTarget.clientWidth
    if (arr !== 'livre' && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3) setArr('livre')
    L(d.id, { x: d.lx + (e.clientX - d.x) * k, y: d.ly + (e.clientY - d.y) * k })
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    drag.current = null
  }
  // zoom com a roda do mouse sem rolar a página
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const h = (e: WheelEvent) => {
      if (!sel) return
      e.preventDefault()
      if (arr !== 'livre') setArr('livre')
      L(sel.id, { scale: Math.min(4, Math.max(0.1, sel.scale * (e.deltaY < 0 ? 1.05 : 0.95))) })
    }
    c.addEventListener('wheel', h, { passive: false })
    return () => c.removeEventListener('wheel', h)
  })

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
              onFiles(e.dataTransfer.files)
            }}
          >
            {mode === 'image' && (
              <canvas
                ref={canvasRef}
                className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                aria-label="Prévia da figurinha. Toque numa imagem para escolher e arraste para mover."
              />
            )}
            {mode === 'video' && video && (
              <>
                {video.file.type.includes('gif') ? (
                  <img src={video.url} alt="" className={`h-full w-full ${video.fit === 'crop' ? 'object-cover' : 'object-contain'}`} />
                ) : (
                  <video
                    ref={vidRef}
                    src={video.url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className={`h-full w-full ${video.fit === 'crop' ? 'object-cover' : 'object-contain'}`}
                  />
                )}
                <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
              </>
            )}
            {!hasSource && (
              <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 p-8 text-center">
                <img src="/seed/sacabambaspis.webp" alt="" className="h-24 w-24 opacity-90" />
                <span className="text-lg">Solte aqui imagens, um GIF ou um vídeo</span>
                <span className="text-muted">ou toque para escolher. Dá para escolher várias fotos de uma vez e colar com Ctrl+V.</span>
                <input type="file" accept="image/*,video/*" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
              </label>
            )}
          </div>
          {hasSource && (
            <div className="mx-auto mt-3 flex max-w-[460px] flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>{mode === 'image' ? (layers.length > 1 ? 'Toque numa imagem para escolher e arraste para mover. Dois dedos ou a roda do mouse mudam o tamanho.' : 'Arraste para mover. Dois dedos ou a roda do mouse mudam o tamanho.') : video?.file.type.includes('gif') ? 'GIF animado (até 10 s)' : `Trecho de ${fmt(video?.length ?? 0)} em loop`}</span>
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

          <div className="fade-in mt-6" key={tab}>
            {tab === 'origem' && (
              <div className="grid gap-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="panel flex cursor-pointer flex-col gap-1 p-5 transition hover:ring-ink">
                    <span className="text-xl">{layers.length ? 'Mais imagens' : 'Imagens ou fotos'}</span>
                    <span className="text-muted">{layers.length ? 'Entram junto com as que já estão na figurinha.' : 'Uma ou várias: lado a lado, uma sobre a outra ou do seu jeito.'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
                  </label>
                  <label className="panel flex cursor-pointer flex-col gap-1 p-5 transition hover:ring-ink">
                    <span className="text-xl">Vídeo ou GIF</span>
                    <span className="text-muted">Vira figurinha animada. O som do vídeo já vem junto.</span>
                    <input type="file" accept="video/*,image/gif" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
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
                <div className="rounded-xl2 border border-dashed border-line p-5 text-muted">
                  <span className="text-ink">Figurinha por IA</span> chega na próxima versão: descreva a figurinha e o Zapfig desenha.
                </div>
              </div>
            )}

            {tab === 'editar' && (
              <div className="grid gap-6">
                {mode === 'image' && (
                  <section className="panel grid gap-4 p-5" aria-label="Imagens">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl">Imagens ({layers.length} de {MAX_LAYERS})</h2>
                      <label className={`btn-soft cursor-pointer ${layers.length >= MAX_LAYERS ? 'pointer-events-none opacity-40' : ''}`}>
                        Adicionar imagem
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
                      </label>
                    </div>
                    {layers.length > 1 && (
                      <>
                        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Organização">
                          <span className="label mr-1">Organizar</span>
                          {([['lado', 'Lado a lado'], ['pilha', 'Uma sobre a outra'], ['grade', 'Grade'], ['livre', 'Livre']] as Array<[Arrange, string]>).map(([k, label]) => (
                            <button key={k} role="radio" aria-checked={arr === k} className="chip" onClick={() => relayout(k)}>{label}</button>
                          ))}
                        </div>
                        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Imagens, da de baixo para a de cima">
                          {layers.map((l, i) => (
                            <li key={l.id} className="shrink-0">
                              <button
                                className={`checker block h-16 w-16 overflow-hidden rounded-xl p-1 ring-1 ${sel?.id === l.id ? 'ring-2 ring-accent' : 'ring-line hover:ring-ink'}`}
                                onClick={() => setSelId(l.id)}
                                aria-pressed={sel?.id === l.id}
                                aria-label={`Escolher imagem ${i + 1}: ${l.name}`}
                              >
                                <img src={layerImg(l).src} alt="" className="h-full w-full object-contain" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {sel && (
                      <div className="grid gap-4 rounded-xl bg-bg p-4">
                        <div className="flex flex-wrap gap-2">
                          <button className="btn-main" onClick={removeBg} disabled={!!busy}>
                            {sel.cutout ? (sel.useCut ? 'Voltar ao fundo original' : 'Usar sem fundo') : 'Tirar o fundo'}
                          </button>
                          <button className="btn-soft" onClick={() => L(sel.id, { flip: !sel.flip })}>Espelhar</button>
                          {layers.length > 1 ? (
                            <>
                              <button className="btn-soft" onClick={() => moveLayer(sel.id, 1)} disabled={layers[layers.length - 1].id === sel.id}>Para frente</button>
                              <button className="btn-soft" onClick={() => moveLayer(sel.id, -1)} disabled={layers[0].id === sel.id}>Para trás</button>
                              <button className="btn-ghost text-accent" onClick={() => removeLayer(sel.id)}>Tirar esta imagem</button>
                            </>
                          ) : (
                            <button className="btn-soft" onClick={() => L(sel.id, { scale: 1, x: 0, y: 0, rotate: 0 })}>Centralizar</button>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1"><span className="label">Tamanho: {Math.round(sel.scale * 100)}%</span>
                            <input type="range" min={0.1} max={4} step={0.01} value={sel.scale} onChange={(e) => { if (arr !== 'livre') setArr('livre'); L(sel.id, { scale: Number(e.target.value) }) }} /></label>
                          <label className="grid gap-1"><span className="label">Girar: {Math.round(sel.rotate)}°</span>
                            <input type="range" min={-180} max={180} step={1} value={sel.rotate} onChange={(e) => { if (arr !== 'livre') setArr('livre'); L(sel.id, { rotate: Number(e.target.value) }) }} /></label>
                        </div>
                      </div>
                    )}
                    <label className="grid gap-1"><span className="label">Contorno branco em volta de tudo: {layout.outline}px</span>
                      <input type="range" min={0} max={20} step={1} value={layout.outline} onChange={(e) => {
                        const outline = Number(e.target.value)
                        setLayout((l) => ({ ...l, outline }))
                        if (arr !== 'livre') setLayers((ls) => arrange(ls, arr, outline))
                      }} /></label>
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
                  <button className="btn-main h-12 px-6 text-base" onClick={() => setTab('som')}>Próximo: colocar som</button>
                  <button className="btn-soft h-12 px-6" onClick={generate}>Pronto, gerar sem som</button>
                </div>
              </div>
            )}

            {tab === 'som' && (
              <div className="grid gap-6">
                <section className="panel p-5" aria-label="Som">
                  <AudioEditor clip={audio} onChange={setAudio} videoFile={mode === 'video' && video && !video.file.type.includes('gif') ? video.file : null} videoStart={video?.start} setBusy={setBusy} />
                </section>
                <button className="btn-main h-12 justify-self-start px-6 text-base" onClick={generate} disabled={!!busy}>Gerar figurinha</button>
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
                    <section className="panel pop-in grid gap-5 p-5 sm:grid-cols-[200px_1fr] sm:items-center" aria-label="Resultado">
                      <div className="checker aspect-square overflow-hidden rounded-xl ring-1 ring-line">
                        {resUrl && <img src={resUrl} alt="Figurinha gerada" className={`sticker-land h-full w-full object-contain ${playing ? 'playing' : ''}`} />}
                      </div>
                      <div className="grid content-start gap-3">
                        <h2 className="text-3xl">Sua figurinha está pronta</h2>
                        {kb <= limitKB ? (
                          <p className="text-muted">
                            {result.kind === 'animated' ? 'Animada' : 'Figurinha'}
                            {result.ogg ? ` com ${fmt(audio?.length ?? 0)} de som` : ''}, no tamanho certo para o WhatsApp.
                          </p>
                        ) : (
                          <p className="text-accent">Ficou grande demais para o WhatsApp. Volte em Editar e diminua a duração ou use Cortar quadrado.</p>
                        )}
                        {sndUrl && <button className="btn-soft justify-self-start" onClick={play} aria-pressed={playing}><SoundIcon /> {playing ? 'Parar o som' : 'Ouvir o som'}</button>}
                      </div>
                    </section>

                    <ReceiveWhatsApp kind={result.kind} hasSound={!!result.ogg} getFiles={async () => ({ webp: result.webp, ogg: result.ogg })} />

                    <details className="panel group p-5" open={!sendOn}>
                      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-lg">
                        Baixar, salvar ou publicar
                        <span className="text-muted transition group-open:rotate-45" aria-hidden="true">+</span>
                      </summary>
                      <div className="mt-4 grid gap-4">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button className="btn-main" onClick={() => download(result.webp, `${slug(name || 'figurinha')}.webp`)}>Baixar figurinha</button>
                          {result.ogg ? (
                            <button className="btn-soft" onClick={() => download(result.ogg!, `${slug(name || 'figurinha')}.ogg`)}>Baixar o som</button>
                          ) : (
                            <button className="btn-soft" onClick={async () => {
                              const s = sticker()
                              if (s && !(await shareSticker(s))) setErr('Este navegador não compartilha arquivos. Use Baixar figurinha.')
                            }}>Compartilhar</button>
                          )}
                        </div>
                        {result.ogg && (
                          <p className="text-sm text-muted">O WhatsApp ainda não abre a figurinha com som a partir de um arquivo baixado. Para receber com som, use o botão verde.</p>
                        )}
                        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                          <label className="grid gap-1"><span className="label">Nome (para achar depois)</span>
                            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gato julgando" maxLength={40} /></label>
                          <label className="grid gap-1"><span className="label">Palavras para a busca, separadas por vírgula</span>
                            <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gato, bravo, julgando" /></label>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button className="btn-soft" onClick={async () => {
                            const s = sticker()
                            if (!s) return
                            await saveSticker(s)
                            setSaved(s.id)
                          }} disabled={!!saved}>{saved ? 'Salva neste aparelho' : 'Salvar em Minhas figurinhas'}</button>
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
                        {saved && <p className="text-sm text-muted" role="status">Guardada neste aparelho. <Link className="text-ink underline underline-offset-4" to="/galeria?aba=minhas">Ver minhas figurinhas</Link></p>}
                        {published && (
                          <p className="text-sm text-muted" role="status">
                            Publicada. Link para compartilhar: <Link className="break-all text-ink underline underline-offset-4" to={`/f/${published.id}`}>{location.host}/f/{published.id}</Link>
                          </p>
                        )}
                      </div>
                    </details>
                    <p className="text-center text-sm text-muted">Dúvidas? Veja <Link className="text-ink underline underline-offset-4" to="/como-usar">como usar</Link>.</p>
                    <button className="btn-ghost justify-self-start" onClick={reset}>
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
