import { useEffect, useState } from 'react'
import { createSend, sendConfig, type SendTicket } from '../lib/api'

type Props = { kind: 'static' | 'animated'; getFiles: () => Promise<{ webp: Blob; ogg: Blob | null }>; className?: string }

/** Botão que gera um código e abre o WhatsApp com a mensagem pronta para o robô do Zapfig. */
export function ReceiveWhatsApp({ kind, getFiles, className = '' }: Props) {
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
    try {
      const files = await getFiles()
      const t = await createSend({ kind, ...files })
      setTicket(t)
      window.open(t.link, '_blank', 'noopener')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`grid gap-2 ${className}`}>
      <button className="btn h-12 bg-[#1f7a4d] px-6 text-paper hover:bg-[#17603c]" onClick={go} disabled={busy}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3a.4.4 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z" /></svg>
        {busy ? 'Preparando…' : 'Receber no WhatsApp'}
      </button>
      {ticket && (
        <div className="rounded-xl bg-bg p-4 text-sm" role="status">
          <p>
            O WhatsApp abriu com a mensagem <span className="mono rounded bg-paper px-1.5 py-0.5 text-ink">{ticket.text}</span>. Envie e a figurinha chega em segundos.
          </p>
          <p className="mt-2 text-muted">
            Não abriu? <a className="text-ink underline underline-offset-4" href={ticket.link} target="_blank" rel="noopener noreferrer">Abrir o WhatsApp</a>. O código vale por {Math.round(ticket.expiresIn / 60)} minutos e serve uma vez.
          </p>
        </div>
      )}
      {err && <p className="text-sm text-accent" role="alert">{err}</p>}
    </div>
  )
}
