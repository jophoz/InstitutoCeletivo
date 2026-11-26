const express = require("express");
const healthRoutes = require("./routes/health.routes");
const productRoutes = require("./routes/product.routes");
const adminProductRoutes = require("./routes/admin-product.routes");
const adminAuthRoutes = require("./routes/admin-auth.routes");
const adminMediaRoutes = require("./routes/admin-media.routes");
const adminSharedBlockRoutes = require("./routes/admin-shared-block.routes");
const adminBrandRoutes = require("./routes/admin-brand.routes");
const adminDashboardRoutes = require("./routes/admin-dashboard.routes");
const adminBackupRoutes = require("./routes/admin-backup.routes");
const adminUserRoutes = require("./routes/admin-user.routes");
const trackRoutes = require("./routes/track.routes");
const storage = require("./lib/storage");
const assets = require("./lib/assets");
const defaultBrand = require("./lib/default-brand");
const { injectSiteBrand } = require("./lib/site-brand");
const { showPublicPage, showPreview } = require("./controllers/page-view.controller");
const { goToCheckout } = require("./controllers/checkout.controller");
const { sendErrorPage } = require("./lib/error-page");
const requireAdmin = require("./middleware/admin-auth");
const { findSession } = requireAdmin;
const { getBlockSchema } = require("./controllers/sales-page.controller");
const { themeStylesheet, checkColors } = require("./sales/theme");

const app = express();

app.disable("x-powered-by");

// Atrás de proxy HTTPS (Nginx, Caddy, Cloudflare...), o IP do visitante e o "https" chegam nos
// cabeçalhos X-Forwarded-*. TRUST_PROXY = quantos proxies há na frente (normalmente 1). Sem isso,
// todos parecem ter o IP do proxy: o limite de tentativas de login vira um só para o mundo inteiro.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isInteger(hops) ? hops : process.env.TRUST_PROXY); // ou lista de IPs/sub-redes
}

// Páginas de vendas com muitos blocos passam de 100 KB. A importação de backup tem limite próprio
// (routes/admin-backup.routes.js) e por isso pula este.
const jsonBody = express.json({ limit: "300kb" });
app.use((req, res, next) => (req.path === "/api/admin/backup/content" ? next() : jsonBody(req, res, next)));

// Cabeçalhos de segurança de todas as respostas (painel, API, páginas de vendas e do site).
// A CSP só permite recursos do próprio site: mesmo que algum texto malicioso escapasse do
// template, o navegador não carregaria scripts de fora.
// HSTS só com HTTPS confirmado (COOKIE_SECURE=true): o navegador passa a recusar http:// no domínio.
// Nenhuma página do site pode ser aberta dentro de outro site (frame-ancestors 'none'); a
// pré-visualização do editor usa iframe srcdoc dentro do próprio painel, que não é afetada.
// Permissions-Policy desliga recursos do navegador que o site não usa.
const HSTS = process.env.COOKIE_SECURE === "true" ? { "Strict-Transport-Security": "max-age=31536000" } : {};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; "
  + "font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; "
  // Único iframe permitido: o vídeo de apresentação da abertura (YouTube sem cookies e Vimeo).
  + "frame-src https://www.youtube-nocookie.com https://player.vimeo.com";
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": CSP,
    ...HSTS,
  });
  next();
});

// Painel e API administrativa: além dos de cima, nada em cache e fora dos buscadores.
app.use(["/admin", "/api/admin"], (_req, res, next) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  next();
});

app.use("/api/health", healthRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/media", adminMediaRoutes);
app.use("/api/admin/shared-blocks", adminSharedBlockRoutes);
app.use("/api/admin/brands", adminBrandRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/backup", adminBackupRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/track", trackRoutes); // visitas e cliques do site (aba Resumo), sem cookies
app.get("/api/admin/sales-blocks", requireAdmin, getBlockSchema);

// Cores da página de vendas (ver sales/theme.js). As cores vêm na URL e são validadas; como a
// resposta depende só delas, o navegador pode guardar em cache por 1 ano.
app.get("/page-theme.css", (req, res) => {
  const hero = `#${String(req.query.fundo || "").toLowerCase()}`;
  const accent = `#${String(req.query.botao || "").toLowerCase()}`;
  const HEX = /^#[0-9a-f]{6}$/;
  if (!HEX.test(hero) || !HEX.test(accent)) return res.status(400).type("css").send("/* cores inválidas */");
  try { checkColors(hero, accent); } catch { return res.status(400).type("css").send("/* combinação recusada */"); }
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  return res.type("css").send(themeStylesheet(hero, accent));
});

// Endereços antigos -> novos (301 = mudança permanente: o Google atualiza o endereço e links
// já divulgados continuam funcionando).
app.get("/curso-reforma-tributaria.html", (_req, res) => res.redirect(301, "/p/manual-reforma-tributaria"));
app.get("/curso.html", (req, res) => {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  res.redirect(301, id ? `/produto?id=${encodeURIComponent(id)}` : "/catalogo");
});

// Páginas de vendas geradas no servidor (cabeçalhos de segurança: os gerais, no início).
app.get("/p/:slug", showPublicPage);
app.get("/admin/preview/:id", showPreview); // cabeçalhos do /admin (no-store, CSP, noindex) já se aplicam
// Botão "comprar": segue para o checkout da Kiwify (o link não fica no HTML, ver o controller).
app.get("/comprar/:slug", goToCheckout);

// Páginas do painel: confere a sessão antes de entregar o HTML. Sem isso, o navegador mostrava o
// painel vazio por um instante até o JavaScript descobrir que não havia login ("pisca").
// Só páginas (/admin/ e *.html); JS, CSS e o editor seguem livres para o express.static.
// Sem diferenciar maiúsculas: em disco do Windows, /admin/INDEX.HTML abriria o mesmo arquivo.
const ADMIN_PAGE = /^\/(?:[a-z0-9-]+\.html)?$/i;
app.use("/admin", async (req, res, next) => {
  if ((req.method !== "GET" && req.method !== "HEAD") || !ADMIN_PAGE.test(req.path)) return next();
  const loggedIn = Boolean(await findSession(req));
  if (req.path.toLowerCase() === "/login.html") return loggedIn ? res.redirect(302, "/admin/") : next();
  return loggedIn ? next() : res.redirect(302, "/admin/login.html");
});

// Rota de API inexistente responde em JSON, e não com a página HTML padrão do Express.
app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

// Imagens enviadas pelo painel. O nome de cada arquivo é único e nunca muda, então o navegador
// pode guardar em cache por 1 ano ("immutable"). nosniff impede que o navegador "adivinhe"
// outro tipo de conteúdo; a CSP bloqueia scripts caso alguém abra o arquivo diretamente.
app.use("/uploads", express.static(storage.UPLOAD_DIR, {
  index: false,
  dotfiles: "deny",
  fallthrough: false, // arquivo inexistente responde 404 aqui, sem cair nas páginas do site
  immutable: true,
  maxAge: "365d",
  setHeaders: (res) => res.set({
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  }),
}));

// Páginas HTML do site e do painel: entregues com a versão (?v=) nos links de CSS e JS (ver
// lib/assets.js). O HTML em si é sempre revalidado (no-cache; o painel continua no-store), então
// uma mudança publicada aparece na próxima visita.
app.use(async (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  let urlPath;
  try { urlPath = decodeURIComponent(req.path); } catch { return next(); }
  if (urlPath.includes("\0") || /\/\./.test(urlPath)) return next();
  const sitePage = !urlPath.startsWith("/admin/");
  // Site público com endereços sem ".html" (/catalogo). O endereço antigo (/catalogo.html,
  // /index.html) redireciona com 301, mantendo o ?id=..., para links já divulgados e o Google.
  if (sitePage && /\.html$/i.test(urlPath) && assets.htmlPage(urlPath) !== null) {
    const clean = urlPath.replace(/(?:^|\/)index\.html$/i, "/").replace(/\.html$/i, "");
    const q = req.originalUrl.indexOf("?");
    return res.redirect(301, clean + (q === -1 ? "" : req.originalUrl.slice(q)));
  }
  if (urlPath.endsWith("/")) urlPath += "index.html";
  else if (sitePage && !/\.[a-z0-9]+$/i.test(urlPath)) urlPath += ".html";
  if (!/\.html$/.test(urlPath)) return next();
  let body = assets.htmlPage(urlPath);
  if (body === null) return next();
  // Páginas do site (fora do painel): logo e ícone da aba da empresa padrão (aba Empresas).
  if (!urlPath.startsWith("/admin/")) body = injectSiteBrand(body, await defaultBrand.get());
  if (!res.get("Cache-Control")) res.set("Cache-Control", "no-cache");
  return res.type("html").send(body); // send() gera o ETag e responde 304 se nada mudou
});

// Cache dos demais arquivos do site (CSS, JS, fontes, ícones):
//  - com ?v= igual à versão atual: 1 ano sem revalidar (a URL muda quando o arquivo muda);
//  - fontes: 30 dias (praticamente nunca mudam); favicon: 1 dia;
//  - o resto: o navegador revalida a cada uso (ETag; resposta 304 sem corpo se não mudou).
// No /admin vale o no-store definido acima, exceto para os CSS/JS com versão atual.
app.use((req, res, next) => {
  if (assets.isCurrentVersion(req.path, req.query.v)) {
    res.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (!res.get("Cache-Control")) {
    if (req.path.startsWith("/fonts/")) res.set("Cache-Control", "public, max-age=2592000");
    else if (req.path.startsWith("/assets/")) res.set("Cache-Control", "public, max-age=86400");
    else res.set("Cache-Control", "no-cache");
  }
  next();
});

// Mantém API e frontend na mesma origem no ambiente local, evitando CORS.
app.use(express.static(assets.PUBLIC_DIR, { cacheControl: false }));

// Quem está navegando (o navegador pede HTML) vê a página de erro do site; chamadas da API, fetch()
// e imagens continuam recebendo JSON. A API nunca recebe HTML, mesmo que peça.
const wantsPage = (req) => !req.path.startsWith("/api/") && req.accepts(["json", "html"]) === "html";

// Endereço que não existe (nenhuma rota nem arquivo atendeu).
app.use((req, res) => {
  if ((req.method === "GET" || req.method === "HEAD") && wantsPage(req)) return sendErrorPage(res, 404);
  return res.status(404).json({ error: "Não encontrado." });
});

// Tratador de erros: o Express 5 encaminha para cá também as exceções de funções async.
// Detalhes técnicos ficam só no log do servidor; o cliente recebe uma mensagem genérica.
app.use((error, req, res, _next) => {
  if (res.headersSent) return res.end(); // a resposta já começou: só dá para encerrá-la
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error(error);
  if ((status === 404 || status === 500) && wantsPage(req)) return sendErrorPage(res, status);
  if (error.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido." });
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Arquivo ou requisição grande demais (imagens: até 5 MB)." });
  }
  // Outros erros do cliente (ex.: arquivo inexistente em /uploads) mantêm o próprio código.
  if (error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ error: error.status === 404 ? "Não encontrado." : "Requisição inválida." });
  }
  return res.status(500).json({ error: "Erro interno do servidor." });
});

module.exports = app;
