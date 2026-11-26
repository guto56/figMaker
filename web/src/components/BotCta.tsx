import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { botChatLink } from '../lib/api'
import { WhatsAppIcon } from './ReceiveWhatsApp'

/** Convite para criar a figurinha conversando com o robô no WhatsApp. */
export function BotCta({ compact = false }: { compact?: boolean }) {
  const [link, setLink] = useState<string | null>(null)
  useEffect(() => {
    botChatLink().then(setLink)
  }, [])
  if (!link) return null
  if (compact)
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className="btn h-12 bg-[#1f7a4d] px-6 text-base text-paper hover:bg-[#17603c]">
        <WhatsAppIcon /> Fazer pelo WhatsApp
      </a>
    )
  return (
    <section className="grid items-center gap-6 rounded-xl2 bg-[#e7f3ec] p-6 ring-1 ring-[#b9dcc8] md:grid-cols-[1fr_auto] md:p-8" aria-labelledby="bot-cta">
      <div>
        <h2 id="bot-cta" className="text-2xl md:text-3xl">Ou faça direto no WhatsApp</h2>
        <p className="mt-2 max-w-xl text-[#2c4a3a]">
          Mande uma foto, vídeo ou GIF para o robô do Zapfig. Ele pergunta se você quer texto e som, você escolhe tocando nas opções, e a figurinha chega pronta. São 3 por dia.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={link} target="_blank" rel="noopener noreferrer" className="btn h-12 bg-[#1f7a4d] px-6 text-base text-paper hover:bg-[#17603c]">
          <WhatsAppIcon /> Abrir conversa com o robô
        </a>
        <Link to="/robo" className="btn h-12 px-5 text-[#17603c] hover:bg-[#d4ebdd]">Como funciona</Link>
      </div>
    </section>
  )
}
