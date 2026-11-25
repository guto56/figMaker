# Relatório de segurança: Zapfig

Data: 25/11/2026. Alvo: `https://zapfig.hrycsngb42.workers.dev` (produção) e o código deste repositório (branch `claude/keen-cray-naswc6`).
Testes repetíveis: `scripts/pentest.sh [host]`. Resultado antes das correções: **55 PASS, 20 FAIL**. Resultado depois das correções: **81 PASS, 0 FAIL**.

## 1. Reconhecimento

**Stack**
- Front: Vite + React 19 + TypeScript + Tailwind, SPA estática (`web/`). Processamento de mídia no navegador: ffmpeg.wasm (baixado de `cdn.jsdelivr.net`) e `@imgly/background-removal` (modelo baixado de `staticimgly.com`).
- Back: um Cloudflare Worker (`worker/src/index.ts`) que serve os arquivos estáticos e a API `/api/*`.
- Dados: D1 `zapfig` (tabelas `stickers`, `packs`, `reports_seen`, `downloads_seen`). Arquivos: KV `zapfig-files`. Limites: Durable Object `Limiter` e rate limit binding `PROXY_LIMIT`.
- Sem login, sem cookies, sem sessões, sem webhooks e sem IA no código atual. Publicar é anônimo. Quem publica recebe um código de edição aleatório de 24 caracteres; o banco guarda só o SHA-256 desse código.
- Terceiros chamados só pelo servidor: KLIPY (`KLIPY_KEY`), Freesound (`FREESOUND_KEY`), Imgflip, MyInstants (página HTML lida pelo Worker).
- Segredos do Worker: `KLIPY_KEY`, `FREESOUND_KEY` e `IP_SALT`. O segredo `KEY`, que não era mais usado, foi removido.
- Outros recursos na conta: o Worker `zapfig-img` (geração de imagens por IA, usado só para criar as imagens do site) e o KV `zapfig-site` (site antigo, que não é mais servido). Os Workers `asky-central` e `contramulta` são de outro projeto e ficaram fora do escopo.

**Superfície de ataque**

| Endpoint | Método | Auth | Recebe | Devolve |
|---|---|---|---|---|
| `/*` (site) | GET | não | — | HTML/JS/CSS/imagens estáticas |
| `/api/media/memes` | GET | não | — | lista de modelos do Imgflip |
| `/api/media/klipy` | GET | não | `type` (gifs/stickers/clips), `q`, `page` | lista de mídia (URLs via proxy) |
| `/api/sounds/myinstants` | GET | não | `q`, `page` | lista de sons |
| `/api/sounds/freesound` | GET | não | `q`, `page` | lista de sons com crédito |
| `/api/proxy`, `/api/img` | GET | não | `u` (URL de mídia) | o arquivo de mídia (só hosts permitidos) |
| `/api/f/s/<id>.webp\|ogg` | GET | não | id | arquivo da figurinha |
| `/api/stickers` | GET | não | `q`, `sort`, `sound`, `kind`, `offset`, `limit` | lista pública |
| `/api/stickers` | POST | não (limite + mesma origem) | multipart: `name`, `tags`, `kind`, `webp`, `ogg` | `id`, código de edição |
| `/api/stickers/<id>` | GET | não | id | dados públicos da figurinha |
| `/api/stickers/<id>` | DELETE | código de edição (`x-edit-token`) | id | ok |
| `/api/stickers/<id>/download` | POST | não | id | ok (conta 1 vez por faixa de rede por dia) |
| `/api/stickers/<id>/report` | POST | não | id | ok (1 por faixa de rede; some com 3 faixas diferentes) |
| `/api/packs` | GET / POST | não (limite + mesma origem) | JSON `name`, `author`, `stickerIds`, `coverId` | lista / `id` |
| `/api/packs/<id>` | GET | não | id | pacote com figurinhas |
| `/api/packs/<id>/download` | POST | não | id | ok |

## 2. Segredos

| Segredo | No código atual | No histórico do git | No bundle do cliente | Onde está |
|---|---|---|---|---|
| Token da API Cloudflare (`cfut_…`) | não | não | não | só em arquivo temporário desta sessão de trabalho; foi colado no chat |
| `KLIPY_KEY` | não | não | não | secret do Worker; foi colada no chat |
| `FREESOUND_KEY` (e client id) | não | não | não | secret do Worker; foi colada no chat |
| `KEY` (antigo, upload do site e geração de imagem) | não | não | não | secret do Worker `zapfig-img`; removido do Worker `zapfig` |
| `IP_SALT` | não | não | não | secret do Worker (criado nesta auditoria) |

Como verifiquei:
- `gitleaks git --log-opts=--all`: 6 commits, "no leaks found".
- `detect-secrets` na árvore atual: 4 achados, todos falsos positivos (nomes de secrets no README, hashes do `skills-lock.json`, o alfabeto do gerador de IDs e o ID do namespace KV, que não é segredo).
- Busca exata dos valores reais no `git log -p --all`, na árvore e no `dist/`: nenhuma ocorrência.
- Nenhuma variável `VITE_`, `import.meta.env` ou `process.env` no front. Sem source maps no build.
- Nenhuma chamada a API paga sai do navegador: KLIPY e Freesound passam pelo Worker, e a chave nunca aparece nas respostas (teste 12).

## 3. Vulnerabilidades

| ID | Severidade | Local | Descrição | Prova (antes) | Correção | Status |
|---|---|---|---|---|---|---|
| V01 | Alta | `web/public/_headers`; `worker/src/index.ts:32` | Sem cabeçalhos de segurança no site e na API: sem CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy ou Permissions-Policy. Isso permitia clickjacking e não havia defesa extra contra XSS. | `curl -I /` não trazia nenhum desses (12 FAIL no teste 1) | `_headers` com CSP restrita (scripts só do próprio site, jsDelivr e blob; `frame-ancestors 'none'`), HSTS, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy e COOP. Na API, `secure()` aplica `default-src 'none'` e CORP same-origin. | Corrigido |
| V02 | Alta | `worker/src/index.ts:5` (Limiter), rota `route()` | Buscas KLIPY, Freesound e MyInstants sem limite efetivo. Qualquer um podia gastar a cota das suas chaves (a chave de teste do KLIPY é de 100/min) ou fazer o site ser bloqueado pelos provedores. O rate limit binding nativo do Cloudflare não barrou nada no teste (70 chamadas com a mesma chave, todas liberadas). Além disso, o IP de saída muda a cada requisição (160.79.106.x), o que fura limites por IP exato. | 80 buscas seguidas → 0 respostas 429 | Durable Object `Limiter` com contador exato por faixa de rede (/24 no IPv4, /64 no IPv6): 60 buscas/min por faixa, teto global de 1.500/min, 40 publicações/min e 10 denúncias/min. | Corrigido (80 seguidas → 60 respostas 200 e 20 respostas 429) |
| V03 | Média | `worker/src/index.ts:304` (`webpSize`) e `:333` | Upload aceitava WebP com qualquer dimensão. Um arquivo de 16384×16384 com cabeçalho válido entrava na galeria e virava uma "bomba de descompressão" para quem abrisse. O corpo também era lido inteiro sem limite prévio. | `POST /api/stickers` com VP8X 16384² → 201 | Lê a largura e a altura do WebP e exige exatamente 512×512. Recusa corpo acima de 1 MB antes de ler, imagem acima de 520 KB e som acima de 400 KB. Confere a assinatura RIFF/WEBP e OggS. | Corrigido |
| V04 | Média | `worker/src/index.ts:499` (`crossSite`) | Qualquer site podia fazer o navegador do visitante publicar, denunciar ou apagar (POST/DELETE vindo de outra origem). | `POST` com `Origin: https://evil.example` → 201 | POST e DELETE com `Origin` diferente do site, ou com `Sec-Fetch-Site: cross-site`, recebem 403. Não há cookies, então não existe sessão para roubar. | Corrigido |
| V05 | Média | `worker/src/index.ts:405` | Abuso de denúncia: 3 POSTs do mesmo visitante ocultavam qualquer figurinha (censura de conteúdo alheio). | Pelo código: `reports = reports + 1` a cada POST e oculta quando chega a 3 | Tabela `reports_seen`: uma denúncia por faixa de rede, com o IP guardado só como hash com sal secreto. A figurinha só sai do ar com 3 faixas diferentes. | Corrigido |
| V06 | Baixa | `worker/src/index.ts:375` | Contador de downloads podia ser inflado à vontade, manipulando o ranking "Mais baixadas". | 5 POST → +4 a +5 | Tabela `downloads_seen`: conta 1 vez por faixa de rede por dia. | Corrigido (5 POST → 1) |
| V07 | Média | `worker/src/index.ts:224` (`proxy`) | O proxy de mídia mandava `Access-Control-Allow-Origin: *`, então outros sites podiam usá-lo como proxy de banda. Também seguia redirecionamentos sem conferir o destino, o que permitia SSRF a partir de um host permitido. E aceitava `application/octet-stream`. | `curl -H "Origin: https://evil.example" …/api/proxy` → `access-control-allow-origin: *` | Sem CORS. Segue no máximo 3 redirecionamentos manuais, todos dentro da lista de hosts. Bloqueia usuário, senha e porta na URL. Aceita só os tipos `image/jpeg\|png\|gif\|webp`, `video/mp4\|webm` e `audio/*` comuns. Limite de 40 MB. | Corrigido |
| V08 | Baixa | `worker/src/index.ts` (`fetch` e handlers) | A resposta de erro expunha mensagem interna e o status de provedores. | `{"error":"Erro no servidor: No initial boundary string (or you have a truncated message)."}` | Mensagens genéricas para o usuário; o detalhe vai só para o `console.error` (logs do Worker). | Corrigido |
| V09 | Baixa | `worker/src/index.ts:488` (`file`) | Figurinha ocultada por denúncia continuava baixável pelo link direto do arquivo. | Pelo código: `/api/f/` não consultava `hidden` | Consulta o D1 e devolve 404 para figurinha oculta ou apagada. | Corrigido |
| V10 | Baixa | `worker/src/index.ts:277` | O código de edição era comparado com `!==` (comparação de tempo variável). | Pelo código | `crypto.subtle.timingSafeEqual` sobre os hashes, e o código é limitado a 64 caracteres. | Corrigido |
| V11 | Baixa | Configuração do Worker `zapfig` | Segredo antigo `KEY` ainda estava configurado. As URLs de preview ficavam ativas, mantendo acessíveis versões antigas do código (incluindo a rota de upload do site antigo, protegida por `KEY`). | API Cloudflare: secrets `[FREESOUND_KEY, KEY, KLIPY_KEY]`, `previews_enabled: true` | `KEY` removido e `preview_urls: false`. | Corrigido |
| V12 | Baixa | Worker `zapfig-img` | Endpoint público de geração de imagem por IA, protegido só por chave na query string. Se a chave vazasse, gastaria seus neurons. | `workers.dev: enabled` | Endereço `workers.dev` desativado (reversível). O Worker continua existindo. | Corrigido |
| V13 | Média | `web/package.json` | `react-router-dom` 6.30.6 vulnerável: GHSA-wrjc-x8rr-h8h6 (open redirect) e GHSA-337j-9hxr-rhxg. | `npm audit` | Atualizado para 7.18.7. Também atualizei `jszip` 3.10.2 e `idb-keyval` 6.3.0. | Corrigido |
| V14 | Baixa | `@imgly/background-removal` → `zod@3` | GHSA-mrhx-c7xc-m3w5 (consumo de memória ao validar coleções enormes). A biblioteca usa o zod só para validar a própria configuração, que é fixa no código; nenhuma entrada do usuário chega nele. | `npm audit` (2 high) | Não há versão corrigida sem trocar de versão maior da biblioteca. Risco aceito e monitorado. | Pendente (aceito) |
| V15 | Baixa | `worker/src/index.ts` (todas as entradas) | Validação de entrada feita à mão, sem schema. | — | `zod@4.6.7` (versão corrigida) em publicar figurinha e pacote: nome e tags limpos de caracteres de controle e invisíveis, limites de tamanho, `kind` enum, IDs `^[a-z0-9]{10}$` validados antes da rota. | Corrigido |
| V16 | Info | Design | Publicar é anônimo (sem login). Spam distribuído por muitas faixas de rede ainda é possível dentro dos limites. | — | Mitigado pelos limites por faixa, pelo teto global e pela validação. Recomendação: Cloudflare Turnstile no botão Publicar. | Pendente (recomendação) |
| V17 | Info | Chat desta conversa | O token Cloudflare e as chaves KLIPY e Freesound foram colados no chat. Não estão no git nem no site, mas ficaram registrados fora do seu controle. | — | Rotacionar (ver seção 6). | Pendente manual |

Sem achados nestas áreas:
- **SQL injection:** todas as consultas usam `bind`. A ordenação vem de lista fechada, e o `LIKE` agora escapa `%` e `_`.
- **XSS:** sem `dangerouslySetInnerHTML`, `innerHTML` ou `eval`. O React escapa o texto e a CSP é a segunda barreira.
- **Path traversal:** o caminho de `/api/f/` é validado por regex.
- **IDOR no apagar:** sem o código de edição, ou com código errado, a resposta é 403.
- **CORS:** a API não libera nenhuma origem.
- **Cookies, JWT e webhooks:** o site não tem nenhum deles.
- **Prompt injection:** não há IA em produção.

## 4. O que foi testado e passou (depois das correções)

`scripts/pentest.sh` contra produção, todos não destrutivos (cria 1 figurinha de teste e a apaga no fim):
1. Os 6 cabeçalhos de segurança em `/` e em `/api/stickers`.
2. Nenhum destes caminhos devolve conteúdo além do `index.html`: `/.env`, `/.env.local`, `/.git/config`, `/.git/HEAD`, `/package.json`, `/wrangler.jsonc`, `/src/index.ts`, `/worker/src/index.ts`, `/vite.config.ts`, `*.map`, `/.DS_Store`, `/backup.zip`, `/admin`, `/api/admin`, `/api/_probe`, `/__upload`, `/__publish`, `/api/debug`, `/swagger.json`, `/openapi.json`. Também não há `.map` para nenhum JS servido.
3. SSRF no proxy recusado para: metadata 169.254.169.254, host externo, sufixo enganoso (`imgflip.com.evil.example`), `user@host`, `file://`, `localhost`, e JSON de API (tipo não permitido). Proxy sem CORS aberto.
4. SQLi em `q` (`'`, `' OR '1'='1`, `UNION SELECT token_hash…`, `%`, `_`) sem erro nem vazamento. Parâmetros inválidos (`sort`, `limit` negativo ou enorme, `offset` negativo, `kind`) tratados. Path traversal em `/api/f/` recusado. ID inválido → 404.
5. JSON quebrado e multipart quebrado → erro genérico.
6. Upload de SVG/HTML disfarçado de WebP, WebP de 700 KB, WebP de 16384×16384 e publicação vinda de outra origem: todos recusados. Publicação normal com nome `<img src=x onerror=…>` funciona e o nome é exibido como texto.
7. Apagar sem código, com código adulterado e figurinha de outra pessoa → 403. O GET não devolve o código nem o hash.
8. Três denúncias da mesma faixa de rede não ocultam a figurinha.
9. Cinco downloads seguidos contam 1.
10. A API não devolve CORS para outro site e o preflight não é liberado.
11. 80 buscas seguidas no KLIPY e no Freesound geram 429.
12. Nenhuma resposta expõe a chave do KLIPY ou do Freesound, e um `type` manipulado é tratado.

Fluxos do site conferidos em produção depois da CSP (navegador automatizado, sem erros nem violações de CSP no console):
- início, galeria da comunidade, pacote e página de figurinha;
- várias imagens até gerar a figurinha;
- publicar e apagar pela própria interface;
- busca de memes e de GIF;
- som do MyInstants;
- figurinha animada com som.

Não testado:
- A remoção de fundo, porque o servidor do modelo (`staticimgly.com`) é inacessível deste ambiente. Conferi que os bundles dela não usam `eval` nem `new Function`, e a CSP libera `staticimgly.com` em `connect-src` e `wasm-unsafe-eval`.
- O ffmpeg veio de uma cópia local do mesmo arquivo do jsDelivr, então o carregamento real a partir do CDN não foi exercido. A CSP já libera `cdn.jsdelivr.net` e `blob:`.

Ferramentas: gitleaks 8.24.3, detect-secrets, npm audit, curl e Playwright. Não usei nuclei, nikto, ffuf nem sqlmap. Os testes equivalentes estão escritos no `scripts/pentest.sh`, com volume baixo de requisições.

## 5. Status final

- **Corrigidos:** V01 a V13 e V15.
- **Aceito:** V14.
- **Recomendação:** V16.
- **Ação manual sua:** V17.

## 6. O que você precisa fazer manualmente

1. **Rotacionar as 3 credenciais coladas no chat** e me mandar as novas; eu troco no Worker com `wrangler secret put`.
   - Token Cloudflare: https://dash.cloudflare.com/profile/api-tokens → no token usado aqui, "Roll" (ou apague e crie outro com as mesmas permissões).
   - KLIPY: https://partner.klipy.com → API Keys → gerar nova e revogar a antiga.
   - Freesound: https://freesound.org/apiv2/apply → apague a credencial "Zapfig" e crie outra.
2. **Histórico do git:** não precisa limpar. Nenhum segredo foi commitado (gitleaks e busca exata no `git log -p --all`).
3. **Opcional no painel do Cloudflare:**
   - Apagar o Worker `zapfig-img` e o KV `zapfig-site` se não forem mais usados. Não apaguei porque é irreversível.
   - Ativar o Turnstile (anti-robô) para o botão Publicar.
   - Ligar um domínio próprio. O site já manda HSTS.
