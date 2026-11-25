import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import Home from './pages/Home'

const Maker = lazy(() => import('./pages/Maker'))
const Gallery = lazy(() => import('./pages/Gallery'))
const HowTo = lazy(() => import('./pages/HowTo'))
const StickerPage = lazy(() => import('./pages/StickerPage'))
const PackPage = lazy(() => import('./pages/PackPage'))
const PackBuilder = lazy(() => import('./pages/PackBuilder'))

function NotFound() {
  return (
    <div className="wrap py-24">
      <h1 className="text-5xl">Página não encontrada</h1>
      <a href="/" className="btn-main mt-8">Voltar ao início</a>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="wrap py-24 text-muted">Carregando…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="criar" element={<Maker />} />
            <Route path="galeria" element={<Gallery />} />
            <Route path="como-usar" element={<HowTo />} />
            <Route path="f/:id" element={<StickerPage />} />
            <Route path="p/:id" element={<PackPage />} />
            <Route path="pacote/novo" element={<PackBuilder />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
