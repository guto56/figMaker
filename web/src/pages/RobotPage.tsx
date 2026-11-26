import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { WhatsAppIcon } from '../components/ReceiveWhatsApp'
import { SoundIcon } from '../components/StickerTile'
import { botInfo } from '../lib/api'

const pretty = (n: string) => (n.length === 13 ? `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 9)}-${n.slice(9)}` : `+${n}`)

function saveContact(number: string) {
  const vcf = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Zapfig (figurinhas)', 'ORG:Zapfig', `TEL;type=CELL;waid=${number}:+${number}`, `URL:${location.origin}`, 'END:VCARD'].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([vcf], { type: 'text/vcard' }))
  a.download = 'Zapfig.vcf'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 3000)
}

type Bubble = { me?: boolean; kind: 'text' | 'photo' | 'poll' | 'audio' | 'sticker'; text?: string; options?: string[]; picked?: number; img?: string }

const chat: Bubble[] = [
  { me: true, kind: 'photo', img: '/seed/gato-feliz.webp' },
  { kind: 'poll', text: 'Bora fazer a figurinha! Quer escrever um texto nela?', options: ['➡️ Sem texto', '✍️ Texto embaixo', '✍️ Texto em cima'], picked: 1 },
  { kind: 'text', text: 'Digite o texto (até 40 letras):' },
  { me: true, kind: 'text', text: 'sextou' },
  { kind: 'poll', text: 'Quer com som?', options: ['🔇 Sem som', '🎤 Mandar meu áudio', '🔊 Som de meme'], picked: 2 },
  { kind: 'poll', text: 'Escolha o som (você ouve antes de confirmar):', options: ['💥 Vine boom', '😂 Risada do Kiko', '😱 FAAAH', '🔎 Buscar outro som'], picked: 1 },
  { kind: 'audio' },
  { kind: 'poll', text: 'Som: Risada do Kiko. É esse?', options: ['✅ É esse, gerar', '🔁 Escolher outro som', '🔇 Sem som'], picked: 0 },
  { kind: 'sticker', img: '/seed/gato-feliz.webp' },
  { kind: 'text', text: 'Pronto! Toque e segure na figurinha e escolha Favoritar para guardar.' },
]

function ChatBubble({ b, i }: { b: Bubble; i: number }) {
  const side = b.me ? 'ml-auto bg-[#d9fdd3]' : 'mr-auto bg-paper'
  return (
    <li className={`chat-in max-w-[85%] shrink-0 rounded-2xl px-3 py-2 text-[15px] shadow-sm ${side}`} data-i={i}>
      {b.kind === 'text' && <p>{b.text}</p>}
      {b.kind === 'photo' && <img src={b.img} alt="Foto enviada" className="h-28 w-28 rounded-lg bg-surface object-contain p-2" />}
      {b.kind === 'sticker' && <img src={b.img} alt="Figurinha recebida" className="sticker-land h-32 w-32 object-contain" />}
      {b.kind === 'audio' && (
        <p className="flex items-center gap-2 text-muted">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1f7a4d] text-paper"><SoundIcon /></span>
          <span className="h-1.5 w-32 rounded-full bg-line" />
          <span className="mono">0:03</span>
        </p>
      )}
      {b.kind === 'poll' && (
        <div className="grid gap-1.5">
          <p className="font-medium">{b.text}</p>
          {b.options!.map((o, k) => (
            <p key={o} className="flex items-center gap-2">
              <span className={`inline-block h-4 w-4 rounded-full ring-2 ${k === b.picked ? 'bg-[#1f7a4d] ring-[#1f7a4d]' : 'ring-line'}`} />
              {o}
            </p>
          ))}
        </div>
      )}
    </li>
  )
}

export default function RobotPage() {
  const [info, setInfo] = useState<{ number: string | null; link: string | null }>({ number: null, link: null })
  const [replay, setReplay] = useState(0)
  const [shown, setShown] = useState(1)
  useEffect(() => {
    botInfo().then(setInfo)
  }, [])
  // as mensagens aparecem uma a uma, como numa conversa de verdade
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(chat.length)
    setShown(1)
    const t = setInterval(() => setShown((n) => (n >= chat.length ? n : n + 1)), 1100)
    return () => clearInterval(t)
  }, [replay])

  return (
    <div className="wrap py-10">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_440px]">
        <div className="enter">
          <p className="inline-flex items-center gap-2 rounded-full bg-[#e7f3ec] px-3 py-1 text-sm text-[#17603c]">
            <WhatsAppIcon className="h-4 w-4" /> Robô oficial do Zapfig
          </p>
          <h1 className="mt-4 text-[clamp(2.4rem,5.6vw,4.25rem)] leading-[1] tracking-[-0.04em]">Faça a figurinha conversando no WhatsApp</h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Mande uma foto, vídeo ou GIF para o robô. Ele pergunta se você quer texto e som, você escolhe tocando nas opções, e a figurinha chega pronta, com som e tudo.
          </p>
          {info.link ? (
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={info.link} target="_blank" rel="noopener noreferrer" className="nudge btn h-14 bg-[#1f7a4d] px-7 text-[17px] text-paper hover:bg-[#17603c]">
                <WhatsAppIcon /> Abrir conversa com o robô
              </a>
              <button className="btn-soft h-14 px-6" onClick={() => saveContact(info.number!)}>Salvar contato</button>
            </div>
          ) : (
            <p className="mt-8 text-muted">O robô está em manutenção. Enquanto isso, crie pelo site.</p>
          )}
          {info.number && (
            <p className="mt-4 text-sm text-muted">
              Número oficial: <span className="mono text-ink">{pretty(info.number)}</span>. Desconfie de outros números usando o nome Zapfig.
            </p>
          )}

          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {[
              ['Texto de meme', 'Em cima ou embaixo, branco com contorno preto.'],
              ['Seu próprio áudio', 'Grave segurando o microfone ou mande um arquivo.'],
              ['Sons de meme', 'Vine boom, risada do Kiko, FAAAH… ou busque pelo nome.'],
              ['Ouve antes de confirmar', 'O robô manda a prévia do som e pergunta se é esse.'],
              ['Foto, vídeo e GIF', 'Vídeo e GIF viram figurinha animada.'],
              ['3 por dia, grátis', 'Pelo site, você cria e recebe quantas quiser.'],
            ].map(([t, d]) => (
              <li key={t} className="panel p-4">
                <p className="font-medium">{t}</p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-[28px] ring-1 ring-line shadow-[0_20px_50px_-20px_rgba(28,29,31,0.35)]">
            <div className="flex items-center gap-3 bg-[#1f7a4d] px-4 py-3 text-paper">
              <img src="/brand/mark-256.png" alt="" className="h-9 w-9 rounded-full bg-paper p-1" />
              <div className="leading-tight">
                <p className="font-medium">Zapfig</p>
                <p className="text-xs opacity-80">robô de figurinhas</p>
              </div>
            </div>
            <ul key={replay} className="flex h-[540px] flex-col justify-end gap-2 overflow-hidden bg-[#efe7dd] p-3" aria-label="Exemplo de conversa com o robô">
              {chat.slice(0, shown).map((b, i) => <ChatBubble key={i} b={b} i={i} />)}
            </ul>
          </div>
          <button className="btn-ghost mx-auto mt-2 flex text-sm text-muted" onClick={() => setReplay((r) => r + 1)}>Ver a conversa de novo</button>
        </div>
      </div>

      <section className="mt-20 border-t border-line pt-12" aria-labelledby="robo-duvidas">
        <h2 id="robo-duvidas" className="text-3xl">Dúvidas sobre o robô</h2>
        <div className="mt-6 grid gap-3">
          {[
            ['Preciso digitar alguma coisa?', 'Quase nada. As perguntas vêm como enquete: é só tocar na opção. Se preferir, responda com o número da opção.'],
            ['Por que só 3 por dia?', 'Para o robô continuar grátis e rápido para todo mundo. Pelo site você cria e recebe no WhatsApp sem limite.'],
            ['O som da prévia ficou mais rápido que o da figurinha.', 'A prévia chega como mensagem de voz, e o WhatsApp toca na velocidade que você usou por último (1x, 1,5x ou 2x). Toque no botão de velocidade para voltar a 1x.'],
            ['Errei uma escolha. Como recomeço?', 'Mande "cancelar" ou simplesmente mande outra foto ou vídeo.'],
            ['O robô guarda minhas fotos?', 'Não. Ele usa a foto e o áudio só para fazer a figurinha e descarta logo depois.'],
          ].map(([q, a]) => (
            <details key={q} className="panel group p-5">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-lg">
                {q}
                <span className="text-muted transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="fade-in mt-3 max-w-2xl text-muted">{a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/criar" className="btn-main h-12 px-6 text-base">Criar pelo site</Link>
          <Link to="/como-usar" className="btn-soft h-12 px-6 text-base">Ver como usar</Link>
        </div>
      </section>
    </div>
  )
}
