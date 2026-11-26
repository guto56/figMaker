import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotCta } from '../components/BotCta'
import { WhatsAppIcon } from '../components/ReceiveWhatsApp'
import { sendConfig } from '../lib/api'

const steps = [
  {
    t: 'Faça ou escolha a figurinha',
    d: 'Em Criar, use uma foto, um GIF, um vídeo ou um meme da busca. Ou abra qualquer figurinha da Galeria.',
    img: '/seed/pensa-comigo.webp',
  },
  {
    t: 'Toque no botão verde',
    d: 'O botão "Receber no meu WhatsApp" abre o seu WhatsApp com uma mensagem já escrita, tipo ZAPFIG ABC123.',
    img: '/seed/kirby-ok.webp',
  },
  {
    t: 'Envie a mensagem',
    d: 'É só tocar em enviar. Não precisa escrever nada. A figurinha chega em segundos, já com o som.',
    img: '/seed/e-o-pix.webp',
  },
  {
    t: 'Guarde nas suas figurinhas',
    d: 'Toque e segure a figurinha que chegou e escolha Favoritar (ou "Adicionar às figurinhas"). Pronto: ela aparece no seu painel.',
    img: '/seed/gato-feliz.webp',
  },
]

const faqs: Array<[string, string]> = [
  ['A figurinha com som não toca. E agora?', 'Toque uma vez na figurinha: o som toca ao tocar. Se aparece o ícone de alto-falante riscado, ela está no mudo até você tocar. Se não toca de jeito nenhum, atualize o WhatsApp na loja de apps: a figurinha com som está chegando aos poucos para todo mundo.'],
  ['Preciso criar conta ou pagar?', 'Não. Criar, receber no WhatsApp e baixar é grátis e sem cadastro.'],
  ['Dá para fazer a figurinha só pelo WhatsApp?', 'Dá: mande uma foto, vídeo ou GIF para o robô do Zapfig. Ele pergunta se você quer texto e som (seu áudio ou um som de meme) e manda a figurinha pronta. São 3 por dia; pelo site é à vontade.'],
  ['De quem é o número que manda a figurinha?', 'É o robô do Zapfig. Ele só responde quando você manda a mensagem com o código e não manda propaganda. Pode apagar a conversa depois, se quiser.'],
  ['Apareceu "código expirou". O que faço?', 'Cada código vale 30 minutos e serve uma vez. Volte ao site e toque de novo em "Receber no meu WhatsApp".'],
  ['O WhatsApp não abriu quando toquei no botão.', 'Aparece um botão "Abrir o WhatsApp" logo abaixo: toque nele. No computador, ele abre o WhatsApp Web ou o app do WhatsApp.'],
  ['Posso baixar o arquivo em vez de receber?', 'Pode: em "Baixar, salvar ou publicar". A figurinha vem em .webp. Para usar com som, prefira o botão verde, porque o WhatsApp ainda não abre figurinha com som a partir de um arquivo.'],
  ['Meus vídeos e fotos vão para algum servidor?', 'Não para criar: a conversão roda no seu aparelho. Só vão para o Zapfig a figurinha pronta quando você toca em "Receber no meu WhatsApp" (fica guardada por até 30 minutos) ou em "Publicar na galeria".'],
  ['Funciona no iPhone, Android e computador?', 'Sim, no navegador de qualquer um deles, inclusive no Mac. Dá para instalar como app pelo menu do navegador (Adicionar à tela de início).'],
]

export default function HowTo() {
  const [sendOn, setSendOn] = useState(true)
  useEffect(() => {
    sendConfig().then(setSendOn)
  }, [])

  return (
    <div className="wrap py-10">
      <h1 className="max-w-3xl text-[clamp(2.2rem,5vw,3.75rem)] leading-none">Como pôr a figurinha no seu WhatsApp</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        Quatro toques e ela está no seu painel de figurinhas, com som e tudo. Sem baixar arquivo.
      </p>

      <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.t} className="panel pop-in flex flex-col gap-3 p-6" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper">{i + 1}</span>
              <img src={s.img} alt="" className="sticker-hover h-16 w-16 object-contain" />
            </div>
            <h2 className="text-xl">{s.t}</h2>
            <p className="text-muted">{s.d}</p>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/criar" className="btn-main h-12 px-6 text-base">Criar figurinha</Link>
        <Link to="/galeria" className="btn-soft h-12 px-6 text-base">Escolher na galeria</Link>
      </div>

      <div className="mt-16">
        <BotCta />
      </div>

      {sendOn && (
        <section className="mt-16 grid items-center gap-8 rounded-xl2 bg-[#e7f3ec] p-6 ring-1 ring-[#b9dcc8] md:grid-cols-[auto_1fr] md:p-8" aria-labelledby="robo">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#1f7a4d] text-paper"><WhatsAppIcon className="h-9 w-9" /></span>
          <div>
            <h2 id="robo" className="text-2xl">O que acontece quando você toca no botão verde</h2>
            <p className="mt-2 max-w-2xl text-[#2c4a3a]">
              O Zapfig guarda a figurinha por 30 minutos e cria um código só seu. O WhatsApp abre numa conversa com o robô do Zapfig, com o código já escrito. Quando você envia, o robô responde com a figurinha. Ninguém mais recebe nada, e o robô nunca manda mensagem sem você pedir.
            </p>
          </div>
        </section>
      )}

      <section className="mt-16 grid gap-8 border-t border-line pt-12 lg:grid-cols-[1fr_1.2fr]" aria-labelledby="arquivo">
        <div>
          <h2 id="arquivo" className="text-3xl">Prefere baixar o arquivo?</h2>
          <p className="mt-4 max-w-lg text-muted">Também dá. Funciona bem para figurinha sem som.</p>
        </div>
        <ol className="grid gap-3">
          {[
            'Em "Baixar, salvar ou publicar", toque em Baixar figurinha. Vem um arquivo .webp.',
            'No WhatsApp, abra uma conversa, toque no ícone de figurinhas e depois em Criar figurinha.',
            'Escolha o arquivo baixado e envie. Para guardar, toque e segure nela e escolha Favoritar.',
          ].map((s, i) => (
            <li key={i} className="panel grid grid-cols-[32px_1fr] gap-2 p-4">
              <span className="mono pt-0.5 text-accent">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 border-t border-line pt-12" aria-labelledby="duvidas">
        <h2 id="duvidas" className="text-3xl">Dúvidas comuns</h2>
        <div className="mt-6 grid gap-3">
          {faqs.map(([q, a]) => (
            <details key={q} className="panel group p-5">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-lg">
                {q}
                <span className="text-muted transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="fade-in mt-3 max-w-2xl text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-8 border-t border-line pt-12 lg:grid-cols-2" aria-labelledby="formato">
        <div>
          <h2 id="formato" className="text-3xl">O formato que o Zapfig entrega</h2>
          <p className="mt-4 max-w-lg text-muted">Tudo já sai dentro dos limites do WhatsApp. O editor comprime sozinho quando passa.</p>
        </div>
        <dl className="panel grid grid-cols-2 gap-px overflow-hidden bg-line">
          {[
            ['Imagem', 'WebP 512 × 512 px, fundo transparente'],
            ['Parada', 'até 100 KB'],
            ['Animada', 'até 500 KB e 10 s'],
            ['Som', 'OGG Opus, até 10 s'],
          ].map(([k, v]) => (
            <div key={k} className="bg-paper p-5">
              <dt className="label">{k}</dt>
              <dd className="mono mt-1">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
