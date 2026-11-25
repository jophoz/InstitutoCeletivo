// Páginas de erro do site (404 e 500) com o mesmo cabeçalho, rodapé e visual das demais páginas.
// Montadas aqui, e não como arquivo em public/, para não existir um endereço /erro que responda 200.
// Não carregam track.js: um endereço digitado errado não deve contar como visita nas métricas.
const { html } = require("./html");
const { rewriteHtml } = require("./assets");
const defaultBrand = require("./default-brand");
const { injectSiteBrand } = require("./site-brand");

const PAGES = {
  404: {
    title: "Página não encontrada",
    message: "O endereço que você abriu não existe ou mudou de lugar. Confira se ele foi digitado certo ou siga por um dos caminhos abaixo.",
  },
  500: {
    title: "Algo deu errado",
    message: "Tivemos um problema ao abrir esta página. Tente de novo em alguns instantes; se continuar, fale com a gente pela página de contato.",
  },
};

function errorPageHtml(status, message) {
  const page = PAGES[status] || PAGES[500];
  const source = html`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${page.title} — Instituto Celetivo</title>
  <link rel="icon" type="image/png" href="/assets/favicon/favicon.png">
  <meta name="robots" content="noindex">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="preload" href="/fonts/inter/InterVariable-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/source-serif-4/SourceSerif4Variable-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/theme.css">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/site.css">
  <script src="/js/theme.js"></script>
  <script src="/data/site.js" defer></script>
  <script src="/js/components.js" defer></script>
  <script src="/js/main.js" defer></script>
</head>
<body data-page="erro">
<div id="site-header"></div>
<main id="conteudo">
  <section class="v-hero page-hero" aria-labelledby="t-erro">
    <div class="container">
      <p class="v-eyebrow">Erro ${status}</p>
      <h1 id="t-erro">${page.title}</h1>
      <p class="lead">${message || page.message}</p>
      <div class="hero-actions">
        <a class="btn-cta" href="/catalogo">Ver o catálogo</a>
        <a class="btn-ghost" href="/">Voltar ao início</a>
      </div>
    </div>
  </section>
</main>
<div id="site-footer"></div>
</body>
</html>`;
  return rewriteHtml(String(source), "/"); // ?v= nos CSS e JS, como nas outras páginas
}

// Responde com a página de erro. A empresa padrão (logo e ícone) entra se o banco responder;
// num erro 500 o banco pode ser justamente o problema, então a página sai sem ela.
async function sendErrorPage(res, status, message) {
  let body = errorPageHtml(status, message);
  try { body = injectSiteBrand(body, await defaultBrand.get()); } catch { /* sem logo da empresa */ }
  return res.status(status).set("Cache-Control", "no-store").type("html").send(body);
}

module.exports = { errorPageHtml, sendErrorPage };
