// Monta o HTML da página de vendas a partir dos blocos. A marcação segue a página original do
// Manual (mesmas classes de public/css/venda.css), então o visual é o mesmo.
const { html } = require("../lib/html");
const { BLOCKS, ICONS, NETWORKS, validBlocks, hasOffer } = require("./blocks");
const { normalizeTheme, themeHref, DEFAULT_THEME } = require("./theme");
const { toHtml, paragraphsHtml, alignOf } = require("./richtext");
const { assetUrl } = require("../lib/assets"); // ?v= nos CSS/JS: cache longo no navegador
const { headerAttrs } = require("../lib/site-brand");
const { effectiveOffer, formatEnd } = require("../lib/offer");

// Largura em que cada tipo de imagem aparece na tela (atributo sizes; ver venda.css). Com isso e
// o srcset, o navegador baixa a menor versão que fica nítida naquela tela.
const IMAGE_SIZES = {
  "v-media": "(min-width: 1100px) 480px, (min-width: 860px) 44vw, calc(100vw - 2rem)",
  "slide-img": "(min-width: 1100px) 700px, (min-width: 760px) 64vw, calc(100vw - 2rem)",
  "author-photo": "(min-width: 760px) 320px, calc(100vw - 2rem)",
  "buy-media": "240px",
  "stack-img": "(min-width: 860px) 300px, 55vw",
  "book-img": "(min-width: 860px) 340px, 60vw",
  "laptop-img": "(min-width: 1100px) 480px, (min-width: 860px) 44vw, calc(100vw - 2rem)",
  "phone-img": "160px",
  "tablet-img": "220px",
  "mosaic-img": "(min-width: 860px) 260px, 45vw",
  "demo-img": "(min-width: 1100px) 1000px, calc(100vw - 2rem)",
  "feature-img": "(min-width: 1100px) 520px, (min-width: 860px) 46vw, calc(100vw - 2rem)",
  "quote-photo": "52px",
  "bonus-img": "(min-width: 900px) 320px, (min-width: 600px) 45vw, calc(100vw - 4rem)",
  "seal-img": "200px",
};

const brl = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Textos dos blocos podem ter formatação (negrito, cor, alinhamento: ver richtext.js). Antes de
// desenhar, cada texto vira HTML seguro já formatado, guardando o original em .raw: assim os
// ${x.title} dos blocos saem formatados, e "vazio" continua sendo "" (some da página).
function rich(value) {
  if (!value) return "";
  const out = toHtml(value);
  out.raw = value;
  return out;
}
function richFields(value, fields) {
  const out = { ...value };
  for (const [name, field] of Object.entries(fields)) {
    if (field.type === "text" || field.type === "textarea") out[name] = rich(value[name]);
    if (field.type === "list") out[name] = (value[name] || []).map((item) => richFields(item, field.item));
  }
  return out;
}
// Texto formatado que divide um elemento flex com um ícone (itens de lista, pergunta do FAQ,
// botões): ganha um <span>, senão cada trecho em negrito/cor viraria um item separado da linha.
const inline = (value) => (value && String(value).includes("<") ? html`<span>${value}</span>` : value);
const rawOf = (value) => (value && value.raw !== undefined ? value.raw : value || "");
// Alinhamento escolhido no texto: atributo (a política de segurança bloqueia style="" inline).
const alignAttr = (value) => { const a = alignOf(rawOf(value)); return a ? html` data-align="${a}"` : null; };

// Textos com várias linhas: cada parágrafo (separado por linha em branco) vira um <p>.
const paragraphs = (value, cls) => paragraphsHtml(rawOf(value)).map((p) =>
  html`<p${cls ? html` class="${cls}"` : null}${alignAttr(value)}>${p}</p>`);

// Texto "um item por linha" (tópicos de módulo, listas): cada linha não vazia vira um item.
const linesOf = (value) => rawOf(value).replace(/^\[align=[a-z]+\]/, "").split(/\n+/).filter((l) => l.trim()).map(toHtml);
// Número com dois dígitos (01, 02…): passos da linha do tempo e módulos do currículo.
const pad2 = (n) => String(n).padStart(2, "0");

const svg = (name, cls = "ico") => html`<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const mark = (positive) => html`<svg aria-hidden="true"><use href="#i-${positive ? "check" : "x"}"/></svg>`;

// Nota em estrelas de um depoimento (4 ou 5 de 5): as que valem levam .is-on.
const stars = (n) => html`<p class="stars" role="img" aria-label="${n} de 5 estrelas">${[1, 2, 3, 4, 5].map((i) =>
  html`<svg class="star${i <= n ? " is-on" : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS.star.d}"/></svg>`)}</p>`;

// Caixas do cronômetro grande (bloco Contagem regressiva): venda.js preenche os números.
const COUNT_UNITS = [["d", "dias"], ["h", "horas"], ["m", "min"], ["s", "seg"]];
const countBoxes = (hidden) => html`<div class="v-count-boxes" data-count-boxes aria-hidden="true"${hidden ? html` hidden` : null}>${COUNT_UNITS.map(([unit, label]) =>
  html`<span class="v-count-box"><strong data-unit="${unit}">00</strong><small>${label}</small></span>`)}</div>`;

// Sprite com os ícones dos blocos (desenhos definidos em blocks.js, compartilhados com o editor)
// e os das redes sociais (#i-net-instagram, ...).
const SPRITE = html`<svg class="svg-sprite" aria-hidden="true">${[
  ...Object.entries(ICONS),
  ...Object.entries(NETWORKS).map(([name, icon]) => [`net-${name}`, icon]),
].map(([name, icon]) =>
  html`<symbol id="i-${name}" viewBox="0 0 24 24"><path d="${icon.d}" fill="none" stroke="currentColor" stroke-width="${icon.width || 1.8}" stroke-linecap="round" stroke-linejoin="round"/></symbol>`)}</svg>`;

// Ícone e nome de um link, adivinhados pelo endereço (botões de link do autor).
const LINK_HOSTS = [
  [/(^|\.)linkedin\.com$/, "net-linkedin", "LinkedIn"],
  [/(^|\.)lattes\.cnpq\.br$/, "cap", "Currículo Lattes"],
  [/(^|\.)instagram\.com$/, "net-instagram", "Instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "net-youtube", "YouTube"],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, "net-whatsapp", "WhatsApp"],
  [/(^|\.)facebook\.com$/, "net-facebook", "Facebook"],
  [/(^|\.)tiktok\.com$/, "net-tiktok", "TikTok"],
  [/(^|\.)(x\.com|twitter\.com)$/, "net-x", "X"],
];
function linkKind(url) {
  if (url.startsWith("mailto:")) return { icon: "net-email", label: "E-mail" };
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { /* vazio ou incompleto: ícone de site */ }
  const hit = LINK_HOSTS.find(([re]) => re.test(host));
  return hit ? { icon: hit[1], label: hit[2] } : { icon: "net-site", label: "Site" };
}

// Botão de link de uma lista (links do autor, redes sociais). O texto é editável na página; o
// endereço, no painel do bloco. Na página pública só entram links com endereço (filtrados antes).
function linkItem(ctx, list, i, x, kind) {
  const external = x.url && !x.url.startsWith("mailto:");
  const label = ctx.live
    ? html`<span${ctx.field(`${list}.${i}.label`, x.label, { fallback: true })}>${x.label || kind.label}</span>`
    : inline(x.label) || kind.label;
  const target = x.url
    ? html` href="${x.url}"${external ? html` target="_blank" rel="noopener noreferrer"` : null}`
    : html` data-no-url title="Defina o endereço em Configurar bloco ⚙"`;
  return html`<li${ctx.item(list, i)}><a class="link-btn"${target}>${svg(kind.icon, "link-ico")}${label}${external ? html`<span class="sr-only"> (abre em nova aba)</span>` : null}</a>${ctx.remove(list, i)}</li>`;
}

// Campo do esquema pelo caminho ("items.0.question" -> o campo "Pergunta"): rótulo do texto de
// exemplo e tamanho recomendado das imagens.
function schemaField(type, path) {
  let fields = BLOCKS[type]?.fields, field = null;
  for (const part of path.split(".")) {
    if (/^\d+$/.test(part)) continue;
    field = fields?.[part];
    fields = field?.item;
  }
  return field;
}
const fieldLabel = (type, path) => schemaField(type, path)?.label || "";

// Desenho do espaço de imagem vazia no editor (moldura com montanha e sol).
const IMAGE_GLYPH = html`<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Fundo padrão dos tipos que não seguem a alternância claro/cinza (como no conceito visual:
// o autor fica numa faixa escura). Abertura, oferta e chamada são sempre escuras.
const BACKGROUND_DEFAULT = { author: "dark" };

// Número de colunas escolhido no bloco (grades): "auto" não leva classe.
const COLUMNS = { two: 2, three: 3, four: 4 };
const cols = (b) => (COLUMNS[b.columns] ? ` cols-${COLUMNS[b.columns]}` : "");

// Marca do professor no menu (montado por public/js/components.js a partir destes atributos).
// Sem nome nem logo, o menu mostra a marca do site. Produto sem empresa usa a empresa padrão
// (ver PRODUCT_FROM em pages.js).
function brandAttrs(data) {
  const logo = data.brand_logo_id && data.media.get(data.brand_logo_id);
  return headerAttrs({ name: data.brand_name, logo: logo && { ...logo, alt: logo.alt_text } });
}

// Contexto de uma renderização: produto, imagens e contadores (ids de títulos, fundo alternado).
// live = true: pré-visualização dentro do editor, com os textos marcados para edição direta.
function createContext(data, { live = false } = {}) {
  let sectionCount = 0, headingCount = 0, heroCount = 0, offerCount = 0;
  const ctx = {
    product: data,
    live,
    type: null, // tipo do bloco sendo desenhado (o laço de renderSalesPage atualiza)

    /* ---- Edição direta no editor (só com live = true) ----
       Na página pública estes devolvem a marcação de sempre (ou nada): o público não vê diferença. */

    // Atributos de um texto editável: data-field="items.0.question" (caminho dentro do bloco).
    // Vazio -> data-empty + data-placeholder (o editor mostra o rótulo só no bloco selecionado).
    // fallback: o texto exibido é um padrão (ex.: título do produto); editar grava o campo do bloco.
    // O alinhamento do texto (data-align) vale também na página pública.
    field(path, value, { fallback = false } = {}) {
      if (!ctx.live) return alignAttr(value);
      const empty = !value && !fallback;
      return html` data-field="${path}"${alignAttr(value)}${empty ? html` data-empty data-placeholder="${fieldLabel(ctx.type, path)}"` : null}${fallback && !value ? html` data-fallback` : null}`;
    },
    // Texto que divide o elemento com outra coisa (ícone, outro texto): ganha um <span> só no editor.
    text(path, value) {
      return ctx.live ? html`<span${ctx.field(path, value)}>${value}</span>` : inline(value);
    },
    // Texto longo (parágrafos): no editor, os <p> ficam dentro de um <div> editável.
    paras(path, value, cls) {
      return ctx.live ? html`<div${ctx.field(path, value)} data-multiline>${paragraphs(value, cls)}</div>` : paragraphs(value, cls);
    },
    // Lista "um item por linha". Página pública: <ul> (nada, se vazia). No editor: um <div> editável
    // com uma linha por <div> (Enter cria outra linha), com a mesma aparência da lista.
    lines(path, value, cls = "") {
      const items = linesOf(value);
      if (ctx.live) return html`<div class="v-lines${cls ? ` ${cls}` : ""}"${ctx.field(path, value)} data-multiline>${items.map((l) => html`<div>${l}</div>`)}</div>`;
      return items.length ? html`<ul class="v-lines${cls ? ` ${cls}` : ""}">${items.map((l) => html`<li>${l}</li>`)}</ul>` : null;
    },
    // Ícone de um campo "icon". No editor leva data-icon-field (clicar nele abre a escolha de ícone).
    icon(path, name, cls = "ico") {
      if (!ctx.live) return svg(name, cls);
      return html`<svg class="${cls}" aria-hidden="true" data-icon-field="${path}"><use href="#i-${name}"/></svg>`;
    },
    // Campo opcional: na página pública só aparece preenchido; no editor, sempre (vazio = espaço para digitar).
    show: (value) => ctx.live || !!value,

    // <img> de uma imagem da biblioteca; "priority" para a primeira dobra (não espera rolar).
    // No editor (com path, o caminho do campo): a imagem leva data-image-field (clicar troca) e,
    // sem imagem, aparece um espaço clicável com o tamanho recomendado. optional: esse espaço só
    // aparece no bloco selecionado (como os textos vazios), para não pesar na prévia.
    img(id, cls, { priority = false, path = null, optional = false } = {}) {
      const m = id && data.media.get(id);
      const editable = ctx.live && path;
      if (!m) return editable ? ctx.imageSlot(cls, path, { optional }) : null;
      const responsive = m.srcset && IMAGE_SIZES[cls] ? html` srcset="${m.srcset}" sizes="${IMAGE_SIZES[cls]}"` : null;
      return html`<img class="${cls}" src="${m.url}"${responsive} alt="${m.alt_text || ""}" width="${m.width}" height="${m.height}" ${priority ? html`fetchpriority="high"` : html`loading="lazy"`} decoding="async"${editable ? html` data-image-field="${path}"` : null}>`;
    },
    // Espaço de imagem vazia (só no editor). add: lista onde a imagem escolhida entra (carrossel).
    imageSlot(cls, path, { optional = false, add = null } = {}) {
      const field = schemaField(ctx.type, path);
      const size = field?.size ? `${field.size}${field.tip ? ` · ${field.tip}` : ""}` : "";
      const attr = add ? html` data-image-add="${add}"` : html` data-image-field="${path}"`;
      return html`<span class="img-slot ${cls}"${attr}${optional ? html` data-empty` : null} title="Adicionar imagem${size ? ` (${size})` : ""}">${IMAGE_GLYPH}<strong>Adicionar imagem</strong>${size && html`<small>Tamanho recomendado: ${size}</small>`}</span>`;
    },
    /* ---- Itens das listas, direto na página (só no editor) ---- */
    // Atributo do item: data-item="items.3" (caminho do item dentro do bloco).
    item: (list, i) => (ctx.live ? html` data-item="${list}.${i}"` : null),
    // Botão × que remove o item (aparece ao passar o mouse, no bloco selecionado).
    remove(list, i) {
      if (!ctx.live) return null;
      const noun = BLOCKS[ctx.type].fields[list].noun;
      return html`<button type="button" class="item-remove" data-item-remove="${list}.${i}" aria-label="Remover ${noun} ${i + 1}" title="Remover ${noun}">${svg("x", "item-remove-ico")}</button>`;
    },
    // Fim da lista: botão "+ Adicionar <item>" (no bloco selecionado, enquanto cabe mais um).
    // tag: "li" dentro de <ul>; "div" nas grades de <article>, <details> e <figure>.
    addItem(list, items, tag = "li") {
      const field = BLOCKS[ctx.type].fields[list];
      if (!ctx.live || items.length >= field.max) return null;
      const button = html`<button type="button" class="item-add-btn" data-item-add="${list}">+ Adicionar ${field.noun}</button>`;
      return tag === "li" ? html`<li class="item-add">${button}</li>` : html`<div class="item-add">${button}</div>`;
    },
    // Botão de compra: o link vem SEMPRE do cadastro do produto (fonte única).
    // label: texto do bloco (vazio = usa o fallback); path: o campo, para a edição no editor.
    // icon: ícone antes do texto (ex.: o cadeado do cartão de compra).
    cta(label, fallback, path, { icon = null } = {}) {
      if (!data.checkout_url) return html`<span class="btn-cta is-disabled" aria-disabled="true">Em breve</span>`;
      return html`<a class="btn-cta" href="${data.checkout_url}" target="_blank" rel="noopener noreferrer">${icon && svg(icon, "cta-ico")}${ctx.ctaText(label, fallback, path)}<span class="sr-only"> (abre em nova aba)</span></a>`;
    },
    ctaText(label, fallback, path) {
      return ctx.live ? html`<span${ctx.field(path, label, { fallback: true })}>${label || fallback}</span>` : inline(label) || fallback;
    },
    // Botão que rola a página até a seção de compra (#oferta). Página sem Oferta final (salva antes
    // da regra) ou ainda sem checkout: o mesmo botão dos outros blocos.
    scrollCta(label, fallback, path) {
      if (!ctx.hasOffer || !data.checkout_url) return ctx.cta(label, fallback, path);
      return html`<a class="btn-cta" href="#${OFFER_ANCHOR}">${ctx.ctaText(label, fallback, path)}</a>`;
    },
    // A âncora #oferta fica só no primeiro bloco Oferta final.
    firstOffer: () => offerCount++ === 0,
    // Preço que vale agora. Com oferta ativa: "de R$ X por R$ Y" e, com prazo, o cronômetro.
    price(label, path) {
      if (data.price_cents === null || data.price_cents === undefined) return null;
      return html`<p class="price-big">${ctx.show(label) && html`<span class="muted-on-dark"${ctx.field(path, label)}>${label}</span>`} ${ctx.amount()}</p>${ctx.timer()}`;
    },
    amount() {
      const was = data.offer.compare_cents;
      if (was === null || was === undefined) return brl(data.price_cents);
      return html`<s class="price-was"><span class="sr-only">De </span>${brl(was)}</s> <span class="sr-only">por </span>${brl(data.price_cents)}`;
    },
    // Cronômetro da oferta: o texto com a data já vem pronto (funciona sem JavaScript); venda.js
    // acrescenta a contagem e recarrega a página quando o prazo acaba. data-now: horário do servidor
    // (corrige relógio errado no aparelho do visitante).
    timer() {
      const ends = data.offer.ends_at;
      if (!ends) return null;
      return html`<p class="offer-timer" data-ends-at="${ends}" data-now="${new Date(data.now).toISOString()}">${svg("stopwatch", "offer-timer-ico")}<span>Oferta válida até ${formatEnd(ends)}</span><span class="offer-timer-count" data-countdown hidden></span></p>`;
    },
    // Rótulo curto em caixa alta acima do título (opcional).
    eyebrow: (b) => ctx.show(b.eyebrow) && html`<p class="v-eyebrow"${ctx.field("eyebrow", b.eyebrow)}>${b.eyebrow}</p>`,
    // Descrição curta e centralizada abaixo do título da seção (opcional).
    intro: (b) => ctx.show(b.intro) && html`<p class="v-intro"${ctx.field("intro", b.intro)}>${b.intro}</p>`,
    headingId: () => `t-${++headingCount}`,
    // Fundo da seção: o escolhido no bloco ou, em "auto", o padrão do tipo. Sem padrão, claro e
    // cinza se alternam na ordem em que aparecem (contando só as seções automáticas).
    sectionClass(b) {
      const tone = b.background && b.background !== "auto" ? b.background
        : BACKGROUND_DEFAULT[ctx.type] || (sectionCount++ % 2 ? "soft" : "light");
      return `v-section is-${tone}`;
    },
    firstHero: () => heroCount++ === 0,
  };
  return ctx;
}

// Links do autor (Lattes, LinkedIn, site…) abaixo da biografia. Página pública: só os com endereço.
function authorLinks(b, ctx) {
  const links = b.links.map((x, i) => [x, i]).filter(([x]) => ctx.live || x.url);
  if (!links.length && !ctx.live) return null;
  return html`<ul class="link-list author-links">${links.map(([x, i]) => linkItem(ctx, "links", i, x, linkKind(x.url)))}${ctx.addItem("links", b.links)}</ul>`;
}

// Âncora da seção de compra (bloco Oferta final): o botão da abertura e o do cabeçalho levam até ela.
const OFFER_ANCHOR = "oferta";

// Triângulo do botão de play (dentro do círculo laranja; o ícone "play" do sprite já tem círculo).
const PLAY = html`<svg class="v-play-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 6.5l10 5.5-10 5.5z" fill="currentColor"/></svg>`;

// Endereço do player embutido de um vídeo do YouTube ou do Vimeo (ou null para outros sites).
// YouTube vai pelo domínio "nocookie" (sem cookies de rastreio até a pessoa dar play).
function videoEmbed(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") || (/^\/(?:embed|shorts|live)\/([^/]+)/.exec(u.pathname) || [])[1];
  }
  if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const num = (/^\/(?:video\/)?(\d{5,12})(?:\/|$)/.exec(u.pathname) || [])[1];
    if (num) return `https://player.vimeo.com/video/${num}?autoplay=1`;
  }
  return null;
}

// Visual da abertura, conforme o estilo escolhido no bloco:
//   image   -> a imagem principal, como sempre;
//   book    -> a imagem principal como capa de um livro em 3D (manuais, guias);
//   stack   -> composição 3D com a principal e as extras (mesmas peças da página inicial);
//   mosaic  -> grade com a principal e as extras;
//   screen  -> a principal dentro de uma janela (barra com três pontos), para telas de software;
//   devices -> a principal num notebook, a 1ª extra num celular e a 2ª num tablet, à frente;
//   video   -> a principal como capa, com o botão de play do vídeo de apresentação.
// Sem imagem nenhuma: null (o texto ocupa a largura).
function heroVisual(b, ctx) {
  // Principal + extras com imagem (no editor, extras vazias viram o espaço clicável de imagem).
  const pieces = (cls) => [
    { img: ctx.img(b.image, cls, { priority: true, path: "image" }), i: null },
    ...b.extra_images.map((x, i) => ({
      img: ctx.img(x.image, cls, { path: `extra_images.${i}.image` }), // só a principal tem prioridade de download
      i,
    })),
  ].filter((x) => x.img);
  const piece = (x, cls) => html`<figure class="${cls}"${x.i !== null && ctx.item("extra_images", x.i)}>${x.img}${x.i !== null && ctx.remove("extra_images", x.i)}</figure>`;
  const addExtra = () => ctx.addItem("extra_images", b.extra_images, "div");

  if (b.visual === "stack" || b.visual === "mosaic") {
    const stack = b.visual === "stack";
    const items = pieces(stack ? "stack-img" : "mosaic-img");
    if (!items.length) return null;
    const inner = stack
      ? html`<div class="hero-covers v-stack" data-count="${items.length}">${items.map((x) => piece(x, "hero-cover"))}</div>`
      : html`<div class="v-mosaic" data-count="${items.length}">${items.map((x) => piece(x, "v-tile"))}</div>`;
    return html`<div class="v-visual-wrap">${inner}${addExtra()}</div>`;
  }

  if (b.visual === "book") {
    const cover = ctx.img(b.image, "book-img", { priority: true, path: "image" });
    if (!cover) return null;
    return html`<figure class="v-visual v-book"><div class="v-book-3d">${cover}</div></figure>`;
  }

  // Notebook (principal), celular à frente à direita (1ª extra) e tablet à frente à esquerda (2ª extra).
  if (b.visual === "devices") {
    const screen = ctx.img(b.image, "laptop-img", { priority: true, path: "image" });
    if (!screen) return null;
    const device = (i, cls) => {
      const x = b.extra_images[i];
      const img = x && ctx.img(x.image, `${cls}-img`, { path: `extra_images.${i}.image` });
      return img && html`<div class="v-${cls}"${ctx.item("extra_images", i)}>${img}${ctx.remove("extra_images", i)}</div>`;
    };
    const phone = device(0, "phone");
    const tablet = device(1, "tablet");
    return html`<div class="v-visual-wrap"><figure class="v-visual v-devices${phone ? " has-phone" : ""}${tablet ? " has-tablet" : ""}">
      <div class="v-laptop"><div class="v-laptop-screen">${screen}</div><span class="v-laptop-base" aria-hidden="true"></span></div>
      ${tablet}${phone}
    </figure>${!(phone && tablet) && addExtra()}</div>`;
  }

  if (b.visual === "video") {
    const embed = b.video_url ? videoEmbed(b.video_url) : null;
    const img = ctx.img(b.image, "v-media", { priority: true, path: "image" });
    if (!img && !b.video_url && !ctx.live) return null;
    const cover = img || html`<span class="v-video-blank" aria-hidden="true"></span>`;
    const play = b.video_url
      ? html`<a class="v-play" href="${b.video_url}" target="_blank" rel="noopener noreferrer"${embed ? html` data-embed="${embed}"` : null} aria-label="Assistir ao vídeo de apresentação (abre o vídeo)">${PLAY}</a>`
      : ctx.live && html`<span class="v-play is-empty" title="Defina o link do vídeo em Configurar bloco ⚙">${PLAY}</span>`;
    return html`<figure class="v-visual v-video">${cover}${play}</figure>`;
  }

  const img = ctx.img(b.image, "v-media", { priority: true, path: "image" });
  if (!img) return null;
  if (b.visual === "screen") {
    return html`<figure class="v-visual v-screen"><span class="v-screen-bar" aria-hidden="true"><i></i><i></i><i></i></span>${img}</figure>`;
  }
  return html`<figure class="v-visual">${img}</figure>`;
}

const RENDERERS = {
  hero(b, ctx) {
    const media = heroVisual(b, ctx);
    const Title = ctx.firstHero() ? "h1" : "h2"; // só um <h1> por página
    const title = b.title || ctx.product.title;
    const titleField = ctx.field("title", b.title, { fallback: true });
    // Centralizada: uma coluna só, no meio, com a imagem entre o subtítulo e o parágrafo.
    // Lado a lado: o texto à esquerda e a imagem à direita.
    const center = b.layout === "center";
    return html`<section class="v-hero"${ctx.mark()}>
  <div class="container v-hero-grid${center ? " is-center" : media ? "" : " no-media"}">
    <div class="v-hero-text">
      ${ctx.eyebrow(b)}
      ${Title === "h1" ? html`<h1${titleField}>${title}</h1>` : html`<h2${titleField}>${title}</h2>`}
      ${ctx.show(b.lead) && html`<p class="lead"${ctx.field("lead", b.lead)}>${b.lead}</p>`}
      ${center && media}
      ${ctx.paras("text", b.text, "v-hero-para")}
      ${(b.bullets.length > 0 || ctx.live) && html`<ul class="v-bullets">${b.bullets.map((x, i) => html`<li${ctx.item("bullets", i)}>${ctx.icon(`bullets.${i}.icon`, x.icon)}${ctx.text(`bullets.${i}.text`, x.text)}${ctx.remove("bullets", i)}</li>`)}${ctx.addItem("bullets", b.bullets)}</ul>`}
      <p class="v-hero-cta">${ctx.scrollCta(b.cta_label, "Comprar agora", "cta_label")}</p>
      ${ctx.show(b.note) && html`<p class="cta-note"${ctx.field("note", b.note)}>${b.note}</p>`}
    </div>
    ${!center && media}
  </div>
</section>`;
  },

  // Apresentação: itens com ícone, título e texto, no estilo escolhido (ver PRESENTATION_STYLES).
  // Sem título, a seção leva um h2 só para leitores de tela. Lista vazia: some da página; no editor
  // fica só com o botão de adicionar.
  presentation(b, ctx) {
    if (!b.items.length && !ctx.live) return null;
    const id = ctx.headingId();
    const { fallback, body } = PRESENTATION_STYLES[b.style];
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark({ hidden: !b.items.length })}><div class="container">
  ${ctx.show(b.title) ? html`<h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>` : html`<h2 id="${id}" class="sr-only">${fallback}</h2>`}
  ${body(b, ctx)}
  ${ctx.show(b.intro) && html`<p class="v-intro is-last"${ctx.field("intro", b.intro)}>${b.intro}</p>`}
</div></section>`;
  },

  author(b, ctx) {
    if (!b.name) return null;
    const id = ctx.headingId();
    const photo = ctx.img(b.photo, "author-photo", { path: "photo" });
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark()}><div class="container author${photo ? "" : " no-media"}">
  ${photo}
  <div>${ctx.eyebrow(b)}<h2 id="${id}"${ctx.field("name", b.name)}>${b.name}</h2>${ctx.show(b.role) && html`<p class="muted"><strong${ctx.field("role", b.role)}>${b.role}</strong></p>`}${ctx.paras("bio", b.bio)}${authorLinks(b, ctx)}${b.show_cta && html`<p class="author-cta">${ctx.cta(b.cta_label, "Quero começar agora", "cta_label")}</p>`}</div>
</div></section>`;
  },

  highlight(b, ctx) {
    const id = ctx.headingId();
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark()}><div class="container">
  <div class="banner">
    <div>${ctx.eyebrow(b)}<h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>${ctx.paras("text", b.text)}</div>
    ${(b.items.length > 0 || ctx.live) && html`<ul class="mini">${b.items.map((x, i) => html`<li class="yes"${ctx.item("items", i)}>${mark(true)}${ctx.text(`items.${i}.text`, x.text)}${ctx.remove("items", i)}</li>`)}${ctx.addItem("items", b.items)}</ul>`}
  </div>
</div></section>`;
  },

  // Faixa compacta no meio da página: título à esquerda e, à direita, o botão que leva à oferta final.
  cta(b, ctx) {
    return html`<section class="v-strip" aria-label="Chamada para compra"${ctx.mark()}><div class="container v-strip-row">
  ${ctx.show(b.title) && html`<p class="v-strip-text"${ctx.field("title", b.title)}>${b.title}</p>`}
  <div class="v-strip-action">${ctx.scrollCta(b.cta_label, "Quero garantir", "cta_label")}</div>
</div></section>`;
  },

  testimonials(b, ctx) {
    // Na página pública só entram depoimentos com texto. No editor aparecem todos (vazio = espaço
    // para digitar); sem nenhum texto, a seção leva data-hidden ("não aparece na página").
    const filled = b.items.some((x) => x.quote);
    const items = b.items.map((x, i) => [x, i]).filter(([x]) => ctx.live || x.quote);
    if (!items.length && !ctx.live) return null;
    const id = ctx.headingId();
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark({ hidden: !filled })}><div class="container">
  ${ctx.eyebrow(b)}<h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>${ctx.intro(b)}
  <div class="quotes">${items.map(([x, i]) => html`<figure class="v-quote"${ctx.item("items", i)}>${ctx.remove("items", i)}${x.stars !== "none" && stars(Number(x.stars))}
    <blockquote>${ctx.paras(`items.${i}.quote`, x.quote)}</blockquote>
    <figcaption>${ctx.img(x.photo, "quote-photo", { path: `items.${i}.photo`, optional: true })}<span>${ctx.show(x.name) && html`<strong${ctx.field(`items.${i}.name`, x.name)}>${x.name}</strong>`}${ctx.show(x.role) && html`<span class="muted"${ctx.field(`items.${i}.role`, x.role)}>${x.role}</span>`}</span></figcaption>
  </figure>`)}${ctx.addItem("items", b.items, "div")}</div>
</div></section>`;
  },

  faq(b, ctx) {
    if (!b.items.length && !ctx.live) return null;
    const id = ctx.headingId();
    // No editor as respostas ficam abertas, para serem editáveis.
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark({ hidden: !b.items.length })}><div class="container narrow">
  ${ctx.eyebrow(b)}<h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>${ctx.intro(b)}
  ${b.items.map((x, i) => html`<details class="faq"${ctx.live ? html` open` : null}${ctx.item("items", i)}><summary>${ctx.text(`items.${i}.question`, x.question)}</summary>${ctx.paras(`items.${i}.answer`, x.answer)}${ctx.remove("items", i)}</details>`)}${ctx.addItem("items", b.items, "div")}
</div></section>`;
  },

  // Garantia: com o selo (imagem), ele fica à esquerda e o texto à direita; sem selo, tudo centralizado.
  guarantee(b, ctx) {
    const id = ctx.headingId();
    const hasSeal = !!ctx.product.media.get(b.image);
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark()}><div class="container narrow">
  <div class="v-card center${hasSeal ? " has-seal" : ""}">${ctx.img(b.image, "seal-img", { path: "image", optional: true })}<div class="guarantee-body">${ctx.eyebrow(b)}<h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>${ctx.intro(b)}${ctx.paras("text", b.text)}
    ${(b.items.length > 0 || ctx.live) && html`<ul class="seals">${b.items.map((x, i) => html`<li${ctx.item("items", i)}>${ctx.icon(`items.${i}.icon`, x.icon)}${ctx.text(`items.${i}.text`, x.text)}${ctx.remove("items", i)}</li>`)}${ctx.addItem("items", b.items)}</ul>`}
  </div></div>
</div></section>`;
  },

  // Oferta final: texto, benefícios e credibilidade à esquerda; cartão de compra à direita.
  // Os cartões opcionais (credibilidade, garantia) só aparecem preenchidos; no editor, vazios,
  // levam data-empty (aparecem só com o bloco selecionado, como os textos vazios).
  offer(b, ctx) {
    const id = ctx.headingId();
    const card = (filled, cls, content) => (filled || ctx.live)
      && html`<div class="${cls}"${!filled ? html` data-empty` : null}>${content}</div>`;
    const pair = (titlePath, title, textPath, text) => html`<p>${ctx.show(title) && html`<strong${ctx.field(titlePath, title)}>${title}</strong>`}${ctx.show(text) && html`<span${ctx.field(textPath, text)}>${text}</span>`}</p>`;
    return html`<section class="v-final"${ctx.firstOffer() ? html` id="${OFFER_ANCHOR}"` : null} aria-labelledby="${id}"${ctx.mark()}>
  <div class="container offer-grid">
    <div class="offer-main">
      ${ctx.eyebrow(b)}<h2 id="${id}"${ctx.field("title", b.title, { fallback: true })}>${b.title || ctx.product.title}</h2>
      ${ctx.paras("text", b.text, "lead")}
      ${(b.items.length > 0 || ctx.live) && html`<ul class="offer-benefits">${b.items.map((x, i) => html`<li${ctx.item("items", i)}>${ctx.icon(`items.${i}.icon`, x.icon)}${ctx.text(`items.${i}.text`, x.text)}${ctx.remove("items", i)}</li>`)}${ctx.addItem("items", b.items)}</ul>`}
      ${card(b.proof_title || b.proof_text, "offer-proof", html`${ctx.icon("proof_icon", b.proof_icon)}${pair("proof_title", b.proof_title, "proof_text", b.proof_text)}`)}
    </div>
    <div class="buy-card">
      ${ctx.img(b.image, "buy-media", { path: "image", optional: true })}
      ${ctx.price(b.price_label, "price_label")}
      ${(b.conditions.length > 0 || ctx.live) && html`<ul class="mini buy-conditions">${b.conditions.map((x, i) => html`<li class="yes"${ctx.item("conditions", i)}>${mark(true)}${ctx.text(`conditions.${i}.text`, x.text)}${ctx.remove("conditions", i)}</li>`)}${ctx.addItem("conditions", b.conditions)}</ul>`}
      ${card(b.guarantee_title || b.guarantee_text, "buy-guarantee", html`${svg("shield")}${pair("guarantee_title", b.guarantee_title, "guarantee_text", b.guarantee_text)}`)}
      ${ctx.cta(b.cta_label, "Garantir agora", "cta_label", { icon: "lock" })}
      <p class="buy-note"${ctx.field("note", b.note, { fallback: true })}>${b.note || "Pagamento processado com segurança pela Kiwify."}</p>
      ${(b.seals.length > 0 || ctx.live) && html`<ul class="buy-seals" aria-label="Compra segura">${b.seals.map((x, i) => html`<li${ctx.item("seals", i)}>${ctx.icon(`seals.${i}.icon`, x.icon, "seal-ico")}${ctx.text(`seals.${i}.text`, x.text)}${ctx.remove("seals", i)}</li>`)}${ctx.addItem("seals", b.seals)}</ul>`}
    </div>
  </div>
</section>`;
  },

  // Demonstração: o produto por dentro, no estilo escolhido (ver DEMO_STYLES).
  demo: (b, ctx) => DEMO_STYLES[b.style](b, ctx),

  // Cronômetro: o prazo da oferta como faixa de urgência ou contagem regressiva (ver TIMER_STYLES).
  timer: (b, ctx) => TIMER_STYLES[b.style](b, ctx),

  // Bônus: cartões numerados com imagem, nome, descrição e o valor que sai de graça.
  bonus(b, ctx) {
    if (!b.items.length && !ctx.live) return null;
    const id = ctx.headingId();
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark({ hidden: !b.items.length })}><div class="container">
  ${ctx.eyebrow(b)}<h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>${ctx.intro(b)}
  <div class="bonus-grid" data-count="${b.items.length}">${b.items.map((x, i) => html`<article class="bonus-card"${ctx.item("items", i)}><p class="v-tag">Bônus #${i + 1}</p>${ctx.img(x.image, "bonus-img", { path: `items.${i}.image`, optional: true })}<h3${ctx.field(`items.${i}.title`, x.title)}>${x.title}</h3>${ctx.paras(`items.${i}.text`, x.text)}${ctx.show(x.value) && html`<p class="bonus-value">Valor: <s${ctx.field(`items.${i}.value`, x.value)}>${x.value}</s> <strong>Grátis</strong></p>`}${ctx.remove("items", i)}</article>`)}${ctx.addItem("items", b.items, "div")}</div>
</div></section>`;
  },

  // Comparação: dois lados (VS) ou tabela critério a critério (ver COMPARE_STYLES).
  compare(b, ctx) {
    return COMPARE_STYLES[b.style](b, ctx);
  },

  // Redes sociais: botões em pílula centralizados. Página pública: só as redes com link.
  social(b, ctx) {
    const items = b.items.map((x, i) => [x, i]).filter(([x]) => ctx.live || x.url);
    if (!items.length && !ctx.live) return null;
    const id = ctx.headingId();
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark({ hidden: !b.items.some((x) => x.url) })}><div class="container">
  ${ctx.eyebrow(b)}<h2 id="${id}"${ctx.field("title", b.title, { fallback: true })}>${b.title || "Acompanhe nas redes"}</h2>${ctx.intro(b)}
  <ul class="link-list social-links">${items.map(([x, i]) => linkItem(ctx, "items", i, x, { icon: `net-${x.network}`, label: NETWORKS[x.network].label }))}${ctx.addItem("items", b.items)}</ul>
</div></section>`;
  },
};

// Estilos do bloco Apresentação: o h2 de leitor de tela (seção sem título) e a lista de itens.
const PRESENTATION_STYLES = {
  // Cartões de benefícios, dois por linha, com destaque opcional.
  cards: {
    fallback: "Benefícios",
    body: (b, ctx) => html`<div class="two">${b.items.map((x, i) => html`<article class="v-card"${ctx.item("items", i)}>${ctx.icon(`items.${i}.icon`, x.icon)}<h3${ctx.field(`items.${i}.title`, x.title)}>${x.title}</h3>${ctx.paras(`items.${i}.text`, x.text)}${ctx.show(x.callout) && html`<p class="callout"${ctx.field(`items.${i}.callout`, x.callout)}>${x.callout}</p>`}${ctx.remove("items", i)}</article>`)}${ctx.addItem("items", b.items, "div")}</div>`,
  },
  // Grade de tópicos curtos, com o número de colunas escolhido.
  grid: {
    fallback: "Tópicos",
    body: (b, ctx) => html`<ul class="grid8${cols(b)}">${b.items.map((x, i) => html`<li${ctx.item("items", i)}>${ctx.icon(`items.${i}.icon`, x.icon)}<strong${ctx.field(`items.${i}.title`, x.title)}>${x.title}</strong><span${ctx.field(`items.${i}.text`, x.text)}>${x.text}</span>${ctx.remove("items", i)}</li>`)}${ctx.addItem("items", b.items)}</ul>`,
  },
  // Linha do tempo: passos numerados (01, 02…) ligados por uma linha.
  timeline: {
    fallback: "Passo a passo",
    body: (b, ctx) => html`<ol class="v-steps" data-count="${b.items.length}">${b.items.map((x, i) => html`<li${ctx.item("items", i)}><span class="v-step-num" aria-hidden="true">${pad2(i + 1)}</span><strong${ctx.field(`items.${i}.title`, x.title)}>${x.title}</strong><span${ctx.field(`items.${i}.text`, x.text)}>${x.text}</span>${ctx.remove("items", i)}</li>`)}${ctx.addItem("items", b.items)}</ol>`,
  },
  // Módulos que abrem e fecham (mesmo acordeão do FAQ): "Módulo 01", o título, o destaque como
  // detalhe (ex.: "5 aulas") e, ao abrir, o texto com um tópico por linha. No editor ficam abertos.
  modules: {
    fallback: "Módulos",
    body: (b, ctx) => html`<div class="v-modules narrow">${b.items.map((x, i) => html`<details class="faq module"${ctx.live ? html` open` : null}${ctx.item("items", i)}><summary><span class="module-head"><span class="module-tag">Módulo ${pad2(i + 1)}</span>${ctx.text(`items.${i}.title`, x.title)}${ctx.show(x.callout) && html`<small class="module-meta"${ctx.field(`items.${i}.callout`, x.callout)}>${x.callout}</small>`}</span></summary>${ctx.lines(`items.${i}.text`, x.text, "module-topics")}${ctx.remove("items", i)}</details>`)}${ctx.addItem("items", b.items, "div")}</div>`,
  },
};

// Estilos do bloco Comparação.
const COMPARE_STYLES = {
  // Dois lados: um cartão com a alternativa (✗) e outro, escuro, com o produto (✓), separados por "VS".
  columns(b, ctx) {
    const id = ctx.headingId();
    const side = (prefix, title, items, positive) => html`<article class="v-card${positive ? " dark" : ""}"><h3${ctx.field(`${prefix}_title`, title)}>${title}</h3>
      <ul class="mini">${items.map((x, i) => html`<li class="${positive ? "yes" : "no"}"${ctx.item(`${prefix}_items`, i)}>${mark(positive)}${ctx.text(`${prefix}_items.${i}.text`, x.text)}${ctx.remove(`${prefix}_items`, i)}</li>`)}${ctx.addItem(`${prefix}_items`, items)}</ul></article>`;
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark()}><div class="container">
  <h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>${ctx.intro(b)}
  <div class="versus">${side("left", b.left_title, b.left_items, false)}<div class="vs" aria-hidden="true">VS</div>${side("right", b.right_title, b.right_items, true)}</div>
</div></section>`;
  },

  // Tabela: uma linha por critério, a alternativa (✗) e o produto (✓) lado a lado.
  // No celular cada linha vira um cartão: o critério em cima e as duas colunas embaixo (CSS).
  table(b, ctx) {
    if (!b.rows.length && !ctx.live) return null;
    const id = ctx.headingId();
    const cell = (path, value, positive, extra = null) => html`<td class="${positive ? "yes" : "no"}"><span class="v-compare-cell">${mark(positive)}<span${ctx.field(path, value)}>${value}</span></span>${extra}</td>`;
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark({ hidden: !b.rows.length })}><div class="container">
  <h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>${ctx.intro(b)}
  <div class="v-compare-wrap"><table class="v-compare" aria-labelledby="${id}">
    <thead><tr><td></td><th scope="col" class="no"${ctx.field("left_title", b.left_title)}>${b.left_title}</th><th scope="col" class="yes"${ctx.field("right_title", b.right_title)}>${b.right_title}</th></tr></thead>
    <tbody>${b.rows.map((x, i) => html`<tr${ctx.item("rows", i)}><th scope="row"${ctx.field(`rows.${i}.label`, x.label)}>${x.label}</th>${cell(`rows.${i}.left`, x.left, false)}${cell(`rows.${i}.right`, x.right, true, ctx.remove("rows", i))}</tr>`)}</tbody>
  </table></div>${ctx.addItem("rows", b.rows, "div")}
</div></section>`;
  },
};

// Estilos do bloco Demonstração. Página pública: o carrossel e as abas só mostram itens com imagem.
const demoHeading = (b, ctx, id) => html`<h2 id="${id}"${ctx.field("title", b.title)}>${b.title}</h2>`;
const DEMO_STYLES = {
  // Carrossel. Com título ou lista nos itens: ao lado, o painel do slide atual (venda.js mostra só o
  // do slide na tela; sem JavaScript aparecem todos). No editor, um último slide "Adicionar imagem"
  // (a escolhida entra no fim da lista), que é o que aparece quando ainda não há imagens.
  carousel(b, ctx) {
    const slides = b.items.map((x, i) => ({ img: ctx.img(x.image, "slide-img", { path: `items.${i}.image` }), i })).filter((s) => s.img);
    const filled = b.items.some((x) => ctx.product.media.get(x.image));
    if (ctx.live && b.items.length < BLOCKS.demo.fields.items.max) slides.push({ img: ctx.imageSlot("slide-img", "items.0.image", { add: "items" }), i: null });
    if (!slides.length) return null;
    const id = ctx.headingId();
    const real = slides.filter((x) => x.i !== null);
    const panels = real.some((x) => b.items[x.i].title || b.items[x.i].bullets) && html`<div class="module-panels" aria-live="polite">${real.map((x, n) => {
      const item = b.items[x.i];
      return html`<div class="module-panel" data-slide="${n}"><p class="module-num"><strong>${pad2(n + 1)}</strong> / ${pad2(real.length)}</p>${ctx.show(item.title) && html`<h3${ctx.field(`items.${x.i}.title`, item.title)}>${item.title}</h3>`}${ctx.lines(`items.${x.i}.bullets`, item.bullets)}</div>`;
    })}</div>`;
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark({ hidden: !filled })}><div class="container">
  ${demoHeading(b, ctx, id)}
  ${panels ? html`<div class="gallery-split">` : null}
  <div class="carousel" role="region" aria-roledescription="carrossel" aria-labelledby="${id}">
    <button class="car-btn prev" type="button" aria-label="Slide anterior" hidden>‹</button>
    <ul class="track">${slides.map((s, n) => html`<li class="slide" aria-label="Slide ${n + 1} de ${slides.length}"${s.i !== null && ctx.item("items", s.i)}>${s.img}${s.i !== null && ctx.remove("items", s.i)}</li>`)}</ul>
    <button class="car-btn next" type="button" aria-label="Próximo slide" hidden>›</button>
    <div class="dots" hidden></div>
  </div>
  ${panels ? html`${panels}</div>` : null}
</div></section>`;
  },

  // Abas com uma imagem grande e legenda (venda.js liga as abas; sem JavaScript e no editor, os
  // painéis ficam um embaixo do outro).
  tabs(b, ctx) {
    const items = b.items.map((x, i) => [x, i]).filter(([x]) => ctx.live || ctx.product.media.get(x.image));
    if (!items.length && !ctx.live) return null;
    const id = ctx.headingId();
    const filled = b.items.some((x) => ctx.product.media.get(x.image));
    return html`<section class="${ctx.sectionClass(b)}" aria-labelledby="${id}"${ctx.mark({ hidden: !filled })}><div class="container">
  ${demoHeading(b, ctx, id)}
  <div class="demo" data-demo>
    <div class="demo-tabs" role="tablist" aria-labelledby="${id}" hidden>${items.map(([x], n) => html`<button type="button" role="tab" id="${id}-tab-${n}" aria-controls="${id}-panel-${n}" aria-selected="${n === 0}"${n ? html` tabindex="-1"` : null}>${x.label || `Parte ${n + 1}`}</button>`)}</div>
    ${items.map(([x, i], n) => html`<figure class="demo-panel" role="tabpanel" id="${id}-panel-${n}" aria-labelledby="${id}-tab-${n}"${ctx.item("items", i)}>${ctx.live ? html`<p class="demo-label"${ctx.field(`items.${i}.label`, x.label)}>${x.label}</p>` : null}${ctx.img(x.image, "demo-img", { path: `items.${i}.image` })}${ctx.show(x.text) && html`<figcaption${ctx.field(`items.${i}.text`, x.text)}>${x.text}</figcaption>`}${ctx.remove("items", i)}</figure>`)}${ctx.addItem("items", b.items, "div")}
  </div>
</div></section>`;
  },

  // Texto e imagem: linhas em duas colunas que alternam o lado da imagem (CSS: :nth-child(even)).
  // O título da seção é opcional; sem ele, o título de cada linha é o título principal (h2).
  rows(b, ctx) {
    if (!b.items.length && !ctx.live) return null;
    const head = ctx.show(b.title);
    const id = head && ctx.headingId();
    const h = head ? "h3" : "h2";
    return html`<section class="${ctx.sectionClass(b)}"${head ? html` aria-labelledby="${id}"` : html` aria-label="Destaques"`}${ctx.mark({ hidden: !b.items.length })}><div class="container">
  ${head ? demoHeading(b, ctx, id) : null}
  <div class="features-alt">${b.items.map((x, i) => {
    const img = ctx.img(x.image, "feature-img", { path: `items.${i}.image` });
    return html`<article class="feature-row${img ? "" : " no-media"}"${ctx.item("items", i)}><div class="feature-text"><${h}${ctx.field(`items.${i}.title`, x.title)}>${x.title}</${h}>${ctx.paras(`items.${i}.text`, x.text)}</div>${img}${ctx.remove("items", i)}</article>`;
  })}${ctx.addItem("items", b.items, "div")}</div>
</div></section>`;
  },
};

// Estilos do bloco Cronômetro. Só existem com oferta ativa no cadastro do produto (a contagem, com
// prazo): nada de "só hoje" sem prazo de verdade. No editor aparecem sempre, marcados como ocultos.
const TIMER_STYLES = {
  // Faixa de urgência: texto curto e o cronômetro da oferta (oferta sem prazo: só o texto).
  bar(b, ctx) {
    const active = ctx.product.offer.active;
    if (!active && !ctx.live) return null;
    return html`<section class="v-urgent" aria-label="Oferta por tempo limitado"${ctx.mark({ hidden: !active })}><div class="container v-urgent-row">
  ${svg("bolt", "v-urgent-ico")}<p class="v-urgent-text"${ctx.field("text", b.text, { fallback: true })}>${b.text || "Oferta especial por tempo limitado"}</p>${ctx.timer()}
</div></section>`;
  },

  // Contagem regressiva: cronômetro grande até o fim da oferta, com o botão de compra. Sem
  // JavaScript fica a data por extenso; venda.js troca pelas caixas (dias, horas, min, seg).
  countdown(b, ctx) {
    const ends = ctx.product.offer.ends_at;
    if (!ends && !ctx.live) return null;
    const id = ctx.headingId();
    return html`<section class="v-countdown" aria-labelledby="${id}"${ctx.mark({ hidden: !ends })}><div class="container">
  <h2 id="${id}"${ctx.field("title", b.title, { fallback: true })}>${b.title || "Oferta por tempo limitado"}</h2>
  ${ctx.show(b.text) && html`<p class="v-countdown-text"${ctx.field("text", b.text)}>${b.text}</p>`}
  ${ends
    ? html`<div class="v-count" data-count-ends="${ends}" data-now="${new Date(ctx.product.now).toISOString()}"><p class="v-count-date">Oferta válida até ${formatEnd(ends)}</p>${countBoxes(true)}</div>`
    : html`<div class="v-count">${countBoxes(false)}</div>`}
  ${ctx.cta(b.cta_label, "Quero aproveitar", "cta_label")}
</div></section>`;
  },
};

// Por que um bloco não aparece na página (aviso exibido só no editor).
const HIDDEN_REASON = {
  testimonials: "escreva pelo menos um depoimento",
  author: "preencha o nome do autor",
  social: "coloque o link de pelo menos uma rede",
  demo: "adicione pelo menos uma imagem",
  timer: "cadastre uma oferta com prazo no produto",
};

// Cores da página: só inclui a folha de estilo quando não é a paleta padrão (que já está no venda.css).
// Tema inválido (dado antigo/estragado) cai na paleta padrão em vez de derrubar a página.
function themeLink(stored) {
  let theme;
  try { theme = normalizeTheme(stored && Object.keys(stored).length ? stored : undefined); } catch { return null; }
  if (theme.preset === DEFAULT_THEME) return null;
  return html`<link rel="stylesheet" href="${themeHref(theme)}">`;
}

// data: resultado de loadForRender. options:
//   preview: false (público) | true (pré-visualização salva, com faixa) | "live" (dentro do editor, sem faixa)
//   now: horário usado para decidir se a oferta vale (padrão: agora; os testes passam outro).
function renderSalesPage(product, { baseUrl, preview = false, now = Date.now() }) {
  const live = preview === "live";
  // Preço e link que valem agora: os da oferta (se ativa) ou os normais. Nada da oferta encerrada
  // (nem o link promocional) chega à página.
  const offer = effectiveOffer(product, now);
  const { offer_price_cents: _p, offer_checkout_url: _u, offer_ends_at: _e, ...rest } = product;
  const data = { ...rest, price_cents: offer.price_cents, checkout_url: offer.checkout_url, offer, now };
  const ctx = createContext(data, { live });
  ctx.hasOffer = hasOffer(data.sections);
  // Blocos inválidos são ignorados um a um; index (posição original) liga a seção ao bloco do editor.
  const rendered = validBlocks(data.sections).map(({ block, index }) => {
    // Bloco que vem de um bloco salvo: no editor é desenhado como na página pública (sem textos
    // editáveis), com a etiqueta data-shared; o conteúdo se edita na aba "Blocos salvos".
    const shared = data.shared?.get(index);
    ctx.live = live && !shared;
    // Na pré-visualização, cada seção leva data-block="N" (clicar nela abre o bloco N no editor).
    // hidden: a seção só aparece no editor (ex.: depoimentos ainda sem texto) — marcada como oculta.
    ctx.mark = ({ hidden = false } = {}) => (preview
      ? html` data-block="${index}"${live && hidden ? html` data-hidden` : null}${live && shared ? html` data-shared="${shared.name}"` : null}`
      : null);
    ctx.type = block.type;
    const section = RENDERERS[block.type](richFields(block, BLOCKS[block.type].fields), ctx);
    if (section) return { type: block.type, style: block.style, section };
    // No editor, um bloco que não aparece na página vira um aviso selecionável (senão ficaria inalcançável).
    if (live) {
      const reason = shared ? `o bloco salvo “${shared.name}” está vazio (preencha na aba Blocos salvos)`
        : HIDDEN_REASON[block.type] || "preencha o conteúdo principal do bloco";
      return { type: null, section: html`<section class="editor-hidden-block" data-block="${index}" data-hidden><div class="container">
  <p><strong>${BLOCKS[block.type].label}</strong> — não aparece na página: ${reason}.</p>
</div></section>` };
    }
    return null;
  }).filter(Boolean);
  // A faixa de urgência, quando é o primeiro bloco da página, fica acima do menu (fora do <main>):
  // o menu flutua sobre a primeira seção, e cobriria uma faixa fina.
  const topBar = rendered[0]?.type === "timer" && rendered[0].style === "bar" ? rendered.shift().section : null;
  const body = rendered.map((x) => x.section);

  const title = data.title;
  const description = data.short_description || ""; // o resumo do produto (tela Editar produto)
  const url = `${baseUrl}/p/${data.slug}`;
  const cover = data.media.get(data.image_id);
  // Ícone da aba: o da empresa do produto (aba Empresas), senão o logo dela, senão o do site.
  const tabIcon = data.media.get(data.brand_icon_id) || data.media.get(data.brand_logo_id);

  return html`<!DOCTYPE html>
<html lang="pt-BR"${live ? html` data-editor` : null}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  ${description && html`<meta name="description" content="${description}">`}
  ${preview ? html`<meta name="robots" content="noindex, nofollow">` : html`<link rel="canonical" href="${url}">`}
  ${tabIcon
    ? html`<link rel="icon" type="image/webp" href="${tabIcon.url}">`
    : html`<link rel="icon" type="image/png" href="/assets/favicon/favicon.png">`}
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <!-- Prévia do link em WhatsApp, Instagram, Facebook etc. (lidas sem executar JavaScript) -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="${title}">
  ${description && html`<meta property="og:description" content="${description}">`}
  <meta property="og:url" content="${url}">
  ${cover && html`<meta property="og:image" content="${baseUrl}${cover.url}">
  <meta property="og:image:width" content="${cover.width}">
  <meta property="og:image:height" content="${cover.height}">`}
  <meta name="twitter:card" content="${cover ? "summary_large_image" : "summary"}">
  <link rel="preload" href="/fonts/inter/InterVariable-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${assetUrl("/css/theme.css")}">
  <link rel="stylesheet" href="${assetUrl("/css/style.css")}">
  <link rel="stylesheet" href="${assetUrl("/css/site.css")}">
  <link rel="stylesheet" href="${assetUrl("/css/venda.css")}">
  ${themeLink(data.theme)}${live && html`
  <link rel="stylesheet" href="${assetUrl("/css/venda-editor.css")}">`}
  <script src="${assetUrl("/js/theme.js")}"></script>
  <script src="${assetUrl("/data/site.js")}" defer></script>
  <script src="${assetUrl("/js/components.js")}" defer></script>${!preview && html`
  <script src="${assetUrl("/js/track.js")}" defer></script>`}
  <script src="${assetUrl("/js/main.js")}" defer></script>
  <script src="${assetUrl("/js/venda.js")}" defer></script>
</head>
<body data-page="venda">
  ${preview === true && html`<div class="preview-banner" role="status"><strong>Pré-visualização do rascunho salvo.</strong> ${data.published_at && data.status === "published" ? "O público vê a última versão publicada; publique no editor para levar estas alterações ao ar." : "Esta página ainda não está visível para o público."}</div>`}
  ${SPRITE}
  ${topBar}
  <div id="site-header"${brandAttrs(data)}></div>
  <main id="conteudo" class="venda">
${body}
  </main>
  <footer class="site-footer v-footer">
    <div class="container foot3 foot4">
      <div>${data.brand_name
        ? html`<p><strong>${data.brand_name}</strong> © <span data-year></span></p>`
        : html`<p><strong data-site="nome"></strong> © <span data-year></span></p><p data-site="slogan"></p>`}</div>
      <nav aria-label="Rodapé: navegação"><p><strong>Navegação</strong></p><p><a href="/catalogo.html">Catálogo</a></p><p><a href="/sobre.html">Sobre</a></p><p><a href="/contato.html">Contato</a></p></nav>
      <nav aria-label="Rodapé: ajuda"><p><strong>Ajuda</strong></p><p><a href="/duvidas.html">Dúvidas frequentes</a></p><p><a href="/termos.html">Termos de uso</a></p><p><a href="/privacidade.html">Política de privacidade</a></p></nav>
      <div><p><strong>Compra segura</strong></p><p>Pagamentos e acesso aos cursos processados pela Kiwify.</p></div>
    </div>
  </footer>
</body>
</html>`.toString();
}

module.exports = { renderSalesPage };
