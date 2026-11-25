import { Link } from 'react-router-dom'

const guides = [
  {
    id: 'android',
    title: 'Android',
    steps: [
      'No Zapfig, toque em Compartilhar e escolha o WhatsApp. Se preferir, baixe o .zip e abra os arquivos no celular.',
      'No WhatsApp, abra uma conversa, toque no ícone de figurinhas e depois em Criar figurinha.',
      'Escolha a imagem figurinha.webp que você baixou.',
      'Toque no ícone de áudio e escolha som.ogg, ou grave o som na hora.',
      'Envie. A figurinha fica salva nas suas figurinhas recentes; toque nela e em Favoritar para guardar.',
    ],
  },
  {
    id: 'iphone',
    title: 'iPhone',
    steps: [
      'No Zapfig, toque em Compartilhar e salve os arquivos em Arquivos, ou baixe o .zip pelo Safari.',
      'No WhatsApp, abra uma conversa, toque no ícone de figurinhas e depois em Criar figurinha.',
      'Escolha a imagem da figurinha.',
      'Toque no ícone de áudio para adicionar o som.',
      'Envie e favorite a figurinha para usar de novo.',
    ],
  },
  {
    id: 'computador',
    title: 'WhatsApp Web, Windows e Mac',
    steps: [
      'Baixe a figurinha. No Mac e no Windows, o Zapfig funciona direto no navegador, sem instalar nada.',
      'Abra o WhatsApp Web ou o app do WhatsApp no computador.',
      'Use Criar figurinha no painel de figurinhas e escolha o arquivo .webp.',
      'Envie para você mesmo (a conversa com o seu número) e favorite no celular.',
    ],
  },
]

export default function HowTo() {
  return (
    <div className="wrap py-10">
      <h1 className="max-w-3xl text-[clamp(2.2rem,5vw,3.75rem)] leading-none">Como usar a figurinha com som no WhatsApp</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        O WhatsApp está liberando a figurinha com áudio aos poucos, desde novembro de 2026. Se o ícone de áudio ainda não aparece na sua conta, a figurinha funciona normalmente, só que sem som.
      </p>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {guides.map((g) => (
          <section key={g.id} id={g.id} className="panel p-6" aria-labelledby={`h-${g.id}`}>
            <h2 id={`h-${g.id}`} className="text-2xl">{g.title}</h2>
            <ol className="mt-5 grid gap-4">
              {g.steps.map((s, i) => (
                <li key={i} className="grid grid-cols-[28px_1fr] gap-2">
                  <span className="mono pt-0.5 text-accent">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="mt-16 grid gap-8 border-t border-line pt-12 lg:grid-cols-2" aria-labelledby="formato">
        <div>
          <h2 id="formato" className="text-3xl">O formato que o Zapfig entrega</h2>
          <p className="mt-4 max-w-lg text-muted">
            Os arquivos já saem dentro dos limites do WhatsApp. O editor mostra o tamanho em tempo real e comprime sozinho quando passa.
          </p>
        </div>
        <dl className="panel grid grid-cols-2 gap-px overflow-hidden bg-line">
          {[
            ['Imagem', 'WebP 512 × 512 px, fundo transparente'],
            ['Estática', 'até 100 KB'],
            ['Animada', 'até 500 KB e 10 s'],
            ['Som', 'OGG Opus mono 48 kHz, até 10 s'],
          ].map(([k, v]) => (
            <div key={k} className="bg-paper p-5">
              <dt className="label">{k}</dt>
              <dd className="mono mt-1">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16 border-t border-line pt-12" aria-labelledby="duvidas">
        <h2 id="duvidas" className="text-3xl">Perguntas comuns</h2>
        <div className="mt-6 grid gap-3">
          {[
            ['Preciso criar conta?', 'Não. Criar, baixar e guardar no navegador funciona sem cadastro.'],
            ['Meus vídeos vão para algum servidor?', 'Não. A conversão roda no seu aparelho. Só a remoção de fundo baixa um modelo de IA uma vez, e a busca de memes consulta o Imgflip.'],
            ['Por que o Zapfig não manda direto para o meu WhatsApp?', 'O WhatsApp não tem um jeito oficial de um site importar figurinha com som. Programas que se conectam ao seu número fazem isso de forma não oficial e podem fazer o número ser banido.'],
            ['Funciona no Mac?', 'Sim. Abra no Safari, Chrome ou Firefox. Dá para instalar como app pelo menu do navegador.'],
          ].map(([q, a]) => (
            <details key={q} className="panel group p-5">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-lg">
                {q}
                <span className="text-muted transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-16">
        <Link to="/criar" className="btn-main">Criar figurinha</Link>
      </div>
    </div>
  )
}
