import type { Sticker } from './store'

const s = (id: string, name: string, tags: string[], sound = false): Sticker => ({
  id: `seed-${id}`,
  name,
  kind: 'static',
  webp: `/seed/${id}.webp`,
  ogg: sound ? `/seed/audio/${id}.ogg` : null,
  tags,
  createdAt: 0,
  seed: true,
})

export const SEED: Sticker[] = [
  s('caramelo', 'Caramelo chocado', ['cachorro', 'susto', 'surpresa'], true),
  s('capivara', 'Capivara de boa', ['capivara', 'tranquilo', 'óculos']),
  s('papagaio', 'Papagaio cantor', ['papagaio', 'música', 'bom dia'], true),
  s('gato', 'Gato julgando', ['gato', 'julgando', 'bravo']),
  s('cafe', 'Café com sono', ['café', 'sono', 'segunda-feira'], true),
  s('coxinha', 'Coxinha apaixonada', ['coxinha', 'amor', 'comida']),
  s('galinha', 'Galinha gritando', ['galinha', 'grito', 'desespero'], true),
  s('paodequeijo', 'Pão de queijo aprova', ['pão de queijo', 'joinha', 'ok', 'comida']),
  s('tartaruga', 'Atrasado de novo', ['tartaruga', 'atraso', 'relógio']),
  s('brigadeiro', 'Brigadeiro rindo', ['brigadeiro', 'risada', 'kkkk', 'doce']),
  s('sapo', 'Sapo pensando', ['sapo', 'pensando', 'dúvida']),
  s('abacaxi', 'Abacaxi dançando', ['abacaxi', 'dança', 'sextou', 'festa']),
]
