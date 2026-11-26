import { useEffect, useState } from 'react'
import { createSend, sendConfig, type SendTicket } from '../lib/api'

type Props = {
  kind: 'static' | 'animated'
  hasSound?: boolean
  getFiles: () => Promise<{ webp: Blob; ogg: Blob | null }>
  className?: string
}

export function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3a.4.4 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z" />
    </svg>
  )
}

/** Botão principal: gera um código e abre o WhatsApp com a mensagem pronta para o robô do Zapfig. */
export function ReceiveWhatsApp({ kind, hasSound, getFiles, className = '' }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ticket, setTicket] = useState<SendTicket | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    sendConfig().then(setEnabled)
  }, [])
  if (!enabled) return null

  const go = async () => {
    setBusy(true)
    setErr('')
    // abre a aba já no clique (senão o celular bloqueia) e manda para o WhatsApp quando o código ficar pronto
    const win = window.open('', '_blank')
    try {
      const files = await getFiles()
      const t = await createSend({ kind, ...files })
      setTicket(t)
      if (win) win.location.href = t.link
    } catch (e) {
      win?.close()
      setErr((e as Error).message || 'Não deu para preparar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`grid gap-3 ${className}`}>
      {!ticket && (
        <button className="nudge btn h-14 w-full bg-[#1f7a4d] px-6 text-[17px] text-paper hover:bg-[#17603c]" onClick={go} disabled={busy}>
          {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-paper/40 border-t-paper" aria-hidden="true" /> : <WhatsAppIcon />}
          {busy ? 'Preparando…' : 'Receber no meu WhatsApp'}
        </button>
      )}
      {!ticket && !busy && (
        <p className="text-center text-sm text-muted">
          {hasSound ? 'Chega no seu WhatsApp já com o som. Sem baixar nada.' : 'Chega no seu WhatsApp em segundos. Sem baixar nada.'}
        </p>
      )}
      {ticket && (
        <div className="pop-in grid gap-3 rounded-xl2 bg-[#e7f3ec] p-4 ring-1 ring-[#b9dcc8]" role="status">
          <p className="flex items-center gap-2 font-medium text-[#17603c]">
            <span className="check-draw inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1f7a4d] text-paper" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            Falta só um toque
          </p>
          <ol className="grid gap-1.5 text-[15px]">
            <li>1. O WhatsApp abriu com a mensagem <span className="mono rounded bg-paper px-1.5 py-0.5">{ticket.text}</span></li>
            <li>2. Toque em <b>enviar</b> ➤</li>
            <li>3. A figurinha chega em segundos{hasSound ? '. Toque nela para ouvir o som' : ''}.</li>
          </ol>
          <a className="btn h-12 bg-[#1f7a4d] text-paper hover:bg-[#17603c]" href={ticket.link} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon /> Abrir o WhatsApp
          </a>
          <p className="text-xs text-muted">O código vale {Math.round(ticket.expiresIn / 60)} minutos e serve uma vez.</p>
          <button className="btn-ghost justify-self-center text-sm text-muted" onClick={() => setTicket(null)}>Pedir de novo</button>
        </div>
      )}
      {err && <p className="text-sm text-accent" role="alert">{err}</p>}
    </div>
  )
}
