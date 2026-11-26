import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SoundIcon, StickerTile, useSound } from '../components/StickerTile'
import { StickerDialog } from '../components/StickerDialog'
import { SEED } from '../lib/seed'
import type { Sticker } from '../lib/store'

const pile = [
  { id: 'seed-e-o-pix', x: '6%', y: '4%', w: '46%', r: '-6deg', d: '0ms' },
  { id: 'seed-gato-bobo', x: '50%', y: '0%', w: '44%', r: '5deg', d: '90ms' },
  { id: 'seed-harold', x: '0%', y: '48%', w: '38%', r: '4deg', d: '180ms' },
  { id: 'seed-bebe-rindo', x: '34%', y: '40%', w: '40%', r: '-3deg', d: '270ms' },
  { id: 'seed-cavalo', x: '64%', y: '50%', w: '36%', r: '-8deg', d: '360ms' },
]

function PileSticker({ s, p }: { s: Sticker; p: (typeof pile)[number] }) {
  const { playing, play } = useSound((s.ogg as string) ?? null)
  return (
    <button
      type="button"
      onClick={play}
      className="enter sticker-hover absolute"
      style={{ left: p.x, top: p.y, width: p.w, ['--r' as string]: p.r, animationDelay: p.d }}
      aria-label={`Ouvir ${s.name}`}
      aria-pressed={playing}
    >
      <img src={s.webp as string} alt="" className={`w-full drop-shadow-[0_8px_14px_rgba(28,29,31,0.16)] ${playing ? 'playing' : ''}`} />
      <span className="absolute right-[4%] top-[4%] inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper">
        <SoundIcon className="h-4 w-4" />
      </span>
    </button>
  )
}

const kinds = [
  { id: 'seed-drake', title: 'Figurinha de imagem', text: 'Uma foto ou print vira figurinha com fundo removido, contorno branco e texto de meme.' },
  { id: 'seed-kirby-ok', title: 'Figurinha animada', text: 'Um trecho de vídeo ou GIF vira WebP animada de até 10 segundos, comprimida para caber em 500 KB.' },
  { id: 'seed-macaco-disfarcando', title: 'Figurinha com som', text: 'Grave sua voz, envie um MP3 ou use o áudio do próprio vídeo. Sai em Opus, o formato que o WhatsApp toca.' },
]

const steps = [
  { t: 'Escolha a origem', d: 'Foto, print, GIF, vídeo ou um meme da busca.' },
  { t: 'Ajuste do seu jeito', d: 'Junte várias fotos, tire o fundo e escreva o texto.' },
  { t: 'Coloque o som', d: 'Grave, envie um áudio ou escolha um som de meme.' },
  { t: 'Receba no WhatsApp', d: 'Um toque no botão verde e ela chega no seu WhatsApp, com som.' },
]

export default function Home() {
  const [open, setOpen] = useState<Sticker | null>(null)
  const byId = (id: string) => SEED.find((s) => s.id === id)!

  return (
    <>
      <section className="wrap grid min-h-[calc(100dvh-4rem)] items-center gap-10 py-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="enter max-w-xl">
          <h1 className="text-[clamp(2.6rem,6.4vw,5rem)] leading-[0.98] tracking-[-0.045em]">
            Figurinhas para WhatsApp com som, feitas no navegador
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted">
            Monte a figurinha a partir de uma foto, GIF ou vídeo, coloque até 10 segundos de áudio e receba no seu WhatsApp com um toque. Grátis e sem cadastro.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/criar" className="btn-main h-12 px-6 text-base">Criar figurinha</Link>
            <Link to="/galeria" className="btn-soft h-12 px-6 text-base">Ver a galeria</Link>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-5">
            <div><dt className="label">Tamanho</dt><dd className="mono mt-1 text-ink">512 × 512 px</dd></div>
            <div><dt className="label">Animada</dt><dd className="mono mt-1 text-ink">até 500 KB</dd></div>
            <div><dt className="label">Som</dt><dd className="mono mt-1 text-ink">até 10 s</dd></div>
          </dl>
        </div>
        <div className="relative mx-auto aspect-[1/0.95] w-full max-w-[560px]" aria-label="Figurinhas de exemplo; toque para ouvir">
          {pile.map((p) => <PileSticker key={p.id} s={byId(p.id)} p={p} />)}
        </div>
      </section>

      <section className="wrap py-20" aria-labelledby="tipos">
        <h2 id="tipos" className="max-w-2xl text-[clamp(2rem,4vw,3.25rem)] leading-[1.02]">Três tipos de figurinha no mesmo editor</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {kinds.map((k) => (
            <Link key={k.title} to="/criar" className="group panel flex flex-col p-6 transition hover:-translate-y-0.5 hover:ring-ink">
              <img src={byId(k.id).webp as string} alt="" className="sticker-hover mx-auto h-48 w-48 object-contain" />
              <h3 className="mt-6 text-2xl">{k.title}</h3>
              <p className="mt-2 text-muted">{k.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-paper py-20" aria-labelledby="passos">
        <div className="wrap grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 id="passos" className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.02]">Da foto ao seu WhatsApp em quatro passos</h2>
            <p className="mt-5 max-w-md text-muted">
              Funciona no navegador do celular ou do computador, inclusive no Mac. A figurinha chega numa conversa do WhatsApp e é só favoritar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/criar" className="btn-main">Criar figurinha</Link>
              <Link to="/como-usar" className="btn-soft">Ver como usar</Link>
            </div>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-xl2 bg-line ring-1 ring-line sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.t} className="bg-bg p-6">
                <span className="mono text-accent">{i + 1}</span>
                <h3 className="mt-3 text-xl">{s.t}</h3>
                <p className="mt-1.5 text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="wrap py-20" aria-labelledby="galeria">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="galeria" className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.02]">Figurinhas da galeria</h2>
          <Link to="/galeria" className="btn-soft">Ver a galeria</Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {SEED.slice(0, 6).map((s) => <StickerTile key={s.id} sticker={s} onOpen={setOpen} />)}
        </div>
      </section>
      <StickerDialog sticker={open} onClose={() => setOpen(null)} />
    </>
  )
}
