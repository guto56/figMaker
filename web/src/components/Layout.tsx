import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

const links = [
  { to: '/galeria', label: 'Galeria' },
  { to: '/pacote/novo', label: 'Montar pacote' },
  { to: '/como-usar', label: 'Como usar' },
]

export function Logo() {
  return (
    <Link to="/" className="flex min-h-11 items-center gap-2" aria-label="Zapfig, página inicial">
      <img src="/brand/mark-256.png" alt="" width="32" height="32" className="h-8 w-8" />
      <span className="text-[22px] font-medium tracking-[-0.04em]">zapfig</span>
    </Link>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/90 backdrop-blur">
        <div className="wrap flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Principal">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `btn-ghost ${isActive ? 'text-accent' : ''}`}>
                {l.label}
              </NavLink>
            ))}
            {pathname !== '/criar' && <Link to="/criar" className="btn-main ml-2">Criar figurinha</Link>}
          </nav>
          <button className="btn-ghost h-11 w-11 px-0 sm:hidden" aria-expanded={open} aria-controls="menu" aria-label={open ? 'Fechar menu' : 'Abrir menu'} onClick={() => setOpen(!open)}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>
        {open && (
          <nav id="menu" className="wrap flex flex-col gap-1 pb-4 sm:hidden" aria-label="Menu">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className="btn-ghost justify-start text-lg">{l.label}</NavLink>
            ))}
            <Link to="/criar" className="btn-main mt-2">Criar figurinha</Link>
          </nav>
        )}
      </header>
      <main id="conteudo" className="flex-1">
        <Outlet />
      </main>
      <footer className="mt-24 border-t border-line">
        <div className="wrap flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-muted">
              Figurinhas para WhatsApp com som, feitas no seu navegador. Suas fotos e vídeos ficam no seu aparelho; só a figurinha pronta sai dele, quando você pede.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-2" aria-label="Rodapé">
            <Link to="/criar" className="btn-ghost">Criar</Link>
            <Link to="/galeria" className="btn-ghost">Galeria</Link>
            <Link to="/como-usar" className="btn-ghost">Como usar</Link>
          </nav>
        </div>
        <div className="wrap pb-8 text-sm text-muted">
          Zapfig versão 1. Figurinhas de exemplo ilustradas com IA (Cloudflare Workers AI). Memes via Imgflip e KLIPY. Sons via MyInstants e Freesound (CC). Não é afiliado ao WhatsApp nem à Meta.
        </div>
      </footer>
    </div>
  )
}
