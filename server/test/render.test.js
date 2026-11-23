// Testes da renderização da página de vendas: a página pública não leva nada do editor, e a
// pré-visualização ao vivo marca os textos editáveis corretamente. Rodar: npm test (node --test)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderSalesPage } = require("../sales/render");
const { BLOCKS, defaultSections } = require("../sales/blocks");

const product = (sections) => ({
  title: "Produto de Teste", slug: "produto-teste", short_description: "", status: "published",
  price_cents: 4990, checkout_url: "https://pay.example.com/x", image_id: null,
  sections, brand_name: null, brand_logo_id: null, theme: null, published_at: null, media: new Map(),
});
const render = (sections, preview) => renderSalesPage(product(sections), { baseUrl: "http://localhost", preview });

// Uma página com todos os tipos, campos vazios, blocos ocultos e texto perigoso.
const sample = () => [
  ...defaultSections(),
  { type: "hero", title: "", lead: "", badges: [{ strong: "", text: "x" }] },
  { type: "author", name: "" },                                     // não aparece: sem nome
  { type: "testimonials", title: "Dizem", items: [{ quote: "Q", name: "N", role: "" }, { quote: "" }] },
  { type: "presentation", items: [{ title: "<script>alert(1)</script>", text: "P1\n\nP2", callout: "" }] },
];

// Cada seção da pré-visualização com o número do bloco: [[índice, html], ...]
function sectionsOf(page) {
  return page.split(/(?=<section[^>]*data-block=")/).slice(1)
    .map((chunk) => [Number(/data-block="(\d+)"/.exec(chunk)[1]), chunk.split("</section>")[0]]);
}

// Campo do esquema a partir do caminho dentro do bloco ("items.0.question").
function schemaField(type, path) {
  let fields = BLOCKS[type].fields, field;
  for (const part of path.split(".")) {
    if (/^\d+$/.test(part)) continue;
    field = fields[part];
    fields = field?.item;
  }
  return field;
}

test("página pública não tem nenhuma marcação do editor", () => {
  for (const preview of [false, true]) {
    const page = render(sample(), preview);
    for (const marker of ["data-field", "data-empty", "data-hidden", "data-fallback", "data-multiline", "venda-editor.css", "editor-hidden-block", "data-editor", "data-icon-field"]) {
      assert.ok(!page.includes(marker), `"${marker}" apareceu com preview=${preview}`);
    }
  }
  assert.ok(!render(sample(), false).includes("data-block"));
});

test("modo ao vivo carrega o CSS do editor", () => {
  assert.match(render(sample(), "live"), /href="\/css\/venda-editor\.css(\?v=[\w-]+)?"/); // com ?v= quando o arquivo existe
});

test("todo data-field aponta para um campo de texto do bloco certo", () => {
  const sections = sample();
  let count = 0;
  for (const [index, chunk] of sectionsOf(render(sections, "live"))) {
    for (const [, path] of chunk.matchAll(/data-field="([^"]+)"/g)) {
      const field = schemaField(sections[index].type, path);
      assert.ok(field && ["text", "textarea"].includes(field.type), `bloco ${index} (${sections[index].type}): "${path}" não é texto`);
      count++;
    }
  }
  assert.ok(count > 40, `poucos campos marcados (${count})`);
});

test("cada texto preenchido do modelo padrão é editável na página", () => {
  const sections = defaultSections();
  const marked = new Map(sectionsOf(render(sections, "live")).map(([i, chunk]) =>
    [i, new Set([...chunk.matchAll(/data-field="([^"]+)"/g)].map((m) => m[1]))]));
  const missing = [];
  sections.forEach((block, i) => {
    const walk = (value, fields, prefix) => {
      for (const [name, field] of Object.entries(fields)) {
        const path = prefix + name;
        if (field.type === "list") value[name].forEach((item, j) => walk(item, field.item, `${path}.${j}.`));
        else if (["text", "textarea"].includes(field.type) && value[name] && !marked.get(i)?.has(path)) missing.push(`${block.type}:${path}`);
      }
    };
    walk(block, BLOCKS[block.type].fields, "");
  });
  // Exceção conhecida: o carrossel do modelo não tem imagens (não aparece; o editor mostra o aviso
  // e o título fica no painel).
  assert.deepEqual(missing.filter((m) => !["demo:title"].includes(m)), []);
});

test("campos vazios ganham texto de exemplo com o rótulo do esquema", () => {
  const page = render([{ type: "hero", lead: "", bullets: [{ icon: "check", text: "" }] }], "live");
  assert.match(page, /<p class="lead" data-field="lead" data-empty data-placeholder="Subtítulo"><\/p>/);
  assert.match(page, /data-field="bullets\.0\.text" data-empty data-placeholder="Texto"/);
});

test("título vazio mostra o do produto, marcado como padrão (não vazio)", () => {
  const page = render([{ type: "hero", title: "" }], "live");
  assert.match(page, /<h1 data-field="title" data-fallback>Produto de Teste<\/h1>/);
  assert.match(page, /<span data-field="cta_label" data-fallback>Comprar agora<\/span>/);
});

test("bloco que não aparece vira aviso selecionável no editor, e some na página pública", () => {
  const sections = [{ type: "hero" }, { type: "author", name: "" }, { type: "demo", items: [] }];
  const live = render(sections, "live");
  assert.match(live, /data-block="1" data-hidden/);
  assert.match(live, /data-block="2" data-hidden/);
  assert.match(live, /Autor \/ Quem somos<\/strong> — não aparece na página: preencha o nome do autor/);
  assert.ok(!render(sections, true).includes('data-block="1"'));
});

test("texto digitado continua escapado no modo ao vivo", () => {
  const page = render(sample(), "live");
  assert.ok(page.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!page.includes("<script>alert(1)"));
});

test("texto longo: parágrafos dentro de um único campo editável", () => {
  const page = render([{ type: "presentation", items: [{ title: "T", text: "P1\n\nP2" }] }], "live");
  assert.match(page, /<div data-field="items\.0\.text" data-multiline><p>P1<\/p><p>P2<\/p><\/div>/);
});

test("FAQ fica aberto no editor e fechado na página pública", () => {
  const sections = [{ type: "faq", items: [{ question: "Q", answer: "A" }] }];
  assert.match(render(sections, "live"), /<details class="faq" open data-item="items\.0">/);
  assert.match(render(sections, false), /<details class="faq">/);
});

test("depoimentos: página pública mostra só os que têm texto", () => {
  const sections = [{ type: "testimonials", title: "Dizem", items: [{ quote: "Mudou meu trabalho.\n\nRecomendo.", name: "Ana", role: "Contadora" }, { quote: "", name: "Sem texto" }] }];
  const page = render(sections, false);
  assert.match(page, /<figure class="v-quote">\s*<blockquote><p>Mudou meu trabalho\.<\/p><p>Recomendo\.<\/p><\/blockquote>/);
  assert.match(page, /<strong>Ana<\/strong><span class="muted">Contadora<\/span>/);
  assert.ok(!page.includes("Sem texto"));
});

test("depoimentos: sem nenhum texto, some da página e aparece marcado no editor", () => {
  const sections = [{ type: "testimonials", items: [{ quote: "" }] }];
  assert.ok(!render(sections, false).includes("v-quote"));
  const live = render(sections, "live");
  assert.match(live, /data-block="0" data-hidden/);
  assert.match(live, /data-field="items\.0\.quote" data-empty data-placeholder="Depoimento" data-multiline/);
  // Lista vazia: no editor a seção continua (oculta), com o botão de adicionar o primeiro.
  const empty = render([{ type: "testimonials", items: [] }], "live");
  assert.match(empty, /data-block="0" data-hidden/);
  assert.match(empty, /data-item-add="items">\+ Adicionar depoimento</);
});

test("depoimentos: foto da biblioteca vira <img> redonda com texto alternativo", () => {
  const photo = "11111111-1111-4111-8111-111111111111";
  const data = product([{ type: "testimonials", items: [{ quote: "Bom.", name: "Ana", photo }] }]);
  data.media = new Map([[photo, { url: "/uploads/ana.webp", alt_text: "Foto de Ana", width: 200, height: 200 }]]);
  const page = renderSalesPage(data, { baseUrl: "http://localhost", preview: false });
  assert.match(page, /<figcaption><img class="quote-photo" src="\/uploads\/ana\.webp" alt="Foto de Ana" width="200" height="200" loading="lazy" decoding="async"><span><strong>Ana<\/strong><\/span><\/figcaption>/);
});

test("fundo: automático alterna claro e cinza; o autor é escuro; a escolha do bloco vale", () => {
  const page = render([
    { type: "faq", items: [{ question: "Q", answer: "A" }] },
    { type: "author", name: "Ana" },
    { type: "faq", items: [{ question: "Q", answer: "A" }] },
    { type: "faq", items: [{ question: "Q", answer: "A" }], background: "dark" },
    { type: "faq", items: [{ question: "Q", answer: "A" }], background: "light" },
  ], false);
  const tones = [...page.matchAll(/<section class="v-section is-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(tones, ["light", "dark", "soft", "dark", "light"]);
});

test("rótulo acima do título: só aparece preenchido na página pública; no editor, editável", () => {
  assert.match(render([{ type: "faq", eyebrow: "Dúvidas", title: "T", items: [{ question: "Q" }] }], false), /<p class="v-eyebrow">Dúvidas<\/p><h2/);
  assert.ok(!render([{ type: "faq", eyebrow: "", title: "T", items: [{ question: "Q" }] }], false).includes("v-eyebrow"));
  assert.match(render([{ type: "faq", eyebrow: "", title: "T", items: [{ question: "Q" }] }], "live"),
    /<p class="v-eyebrow" data-field="eyebrow" data-empty data-placeholder="Rótulo acima do título"><\/p>/);
});

test("chamada intermediária: texto, preço e botão com o link do produto", () => {
  const page = render([{ type: "cta", title: "Pronto para começar?", cta_label: "" }], false);
  assert.match(page, /<section class="v-strip" aria-label="Chamada para compra">/);
  assert.match(page, /<p class="v-strip-text">Pronto para começar\?<\/p>/);
  assert.match(page, /<span class="v-strip-price">R\$\s49,90<\/span>/);
  assert.match(page, /<a class="btn-cta" href="https:\/\/pay\.example\.com\/x"[^>]*>Quero garantir<span class="sr-only">/);
});

test("editor: <html data-editor> desliga as animações; fonte Inter pré-carregada do próprio site", () => {
  assert.match(render(sample(), "live"), /<html lang="pt-BR" data-editor>/);
  assert.match(render(sample(), false), /<html lang="pt-BR">/);
  assert.match(render(sample(), false), /<link rel="preload" href="\/fonts\/inter\/InterVariable-latin\.woff2" as="font" type="font\/woff2" crossorigin>/);
});

test("ícones: no editor levam o caminho do campo (clique troca o ícone); na página pública, não", () => {
  const sections = [{ type: "presentation", items: [{ icon: "gift", title: "T" }] }, { type: "checklist", icon: "shield", title: "C", items: [{ text: "x", positive: true }] }];
  const live = render(sections, "live");
  assert.match(live, /<svg class="ico" aria-hidden="true" data-icon-field="items\.0\.icon"><use href="#i-gift"\/><\/svg>/);
  assert.match(live, /<svg class="ico big" aria-hidden="true" data-icon-field="icon"><use href="#i-shield"\/><\/svg>/);
  assert.match(render(sections, false), /<svg class="ico" aria-hidden="true"><use href="#i-gift"\/><\/svg>/);
});

test("todo data-icon-field aponta para um campo de ícone do bloco certo", () => {
  const sections = [...defaultSections(), { type: "presentation", items: [{ icon: "gift", title: "T" }] }];
  let count = 0;
  for (const [index, chunk] of sectionsOf(render(sections, "live"))) {
    for (const [, path] of chunk.matchAll(/data-icon-field="([^"]+)"/g)) {
      assert.equal(schemaField(sections[index].type, path)?.type, "icon", `bloco ${index}: ${path}`);
      count++;
    }
  }
  assert.ok(count > 8, `poucos ícones marcados (${count})`);
});

const M1 = "0b6f7a52-9c1e-4d3a-8f2b-5e6c7d8e9f01";
test("imagens: no editor, clicáveis e com espaço vazio mostrando o tamanho recomendado", () => {
  const media = new Map([[M1, { url: "/uploads/a.webp", alt_text: "Capa", width: 1200, height: 900 }]]);
  const sections = [
    { type: "hero", title: "T", image: null },
    { type: "author", name: "Ana", photo: M1 },
    { type: "demo", title: "G", items: [{ image: M1 }] },
    { type: "testimonials", items: [{ quote: "Q", name: "N", photo: null }] },
  ];
  const live = renderSalesPage({ ...product(sections), media }, { baseUrl: "http://localhost", preview: "live" });
  assert.match(live, /<span class="img-slot v-media" data-image-field="image" title="[^"]*1200 × 900 px[^"]*">/);
  assert.match(live, /Tamanho recomendado: 1200 × 900 px/);
  assert.ok(!/v-hero-grid no-media/.test(live), "no editor a abertura reserva o espaço da imagem");
  assert.match(live, /<img class="author-photo"[^>]* data-image-field="photo">/);
  assert.match(live, /<img class="slide-img"[^>]* data-image-field="items\.0\.image">/);
  assert.match(live, /data-image-add="items"/);
  assert.match(live, /class="img-slot quote-photo" data-image-field="items\.0\.photo" data-empty/);
  // Todo data-image-field aponta para um campo de imagem do esquema.
  for (const [index, chunk] of sectionsOf(live)) {
    for (const [, path] of chunk.matchAll(/data-image-field="([^"]+)"/g)) {
      assert.equal(schemaField(sections[index].type, path)?.type, "image", `${sections[index].type}:${path}`);
    }
  }
  const pub = renderSalesPage({ ...product(sections), media }, { baseUrl: "http://localhost", preview: false });
  assert.ok(!/img-slot|data-image-field|data-image-add|Tamanho recomendado/.test(pub));
  assert.match(pub, /v-hero-grid no-media/);
});

test("carrossel sem imagens: no editor só o espaço para adicionar, marcado como oculto", () => {
  const live = render([{ type: "demo", title: "G", items: [] }], "live");
  assert.match(live, /data-block="0" data-hidden/);
  assert.match(live, /<li class="slide"[^>]*><span class="img-slot slide-img" data-image-add="items"/);
  assert.match(live, /1500 × 1000 px/);
  assert.ok(!render([{ type: "demo", title: "G", items: [] }], false).includes("carousel"));
});

test("imagens: todo campo de imagem tem tamanho recomendado", () => {
  for (const [type, block] of Object.entries(BLOCKS)) {
    for (const [name, field] of Object.entries(block.fields)) {
      const fields = field.type === "list" ? Object.entries(field.item) : [[name, field]];
      for (const [n, f] of fields) if (f.type === "image") assert.match(f.size || "", /^\d+ × \d+ px$/, `${type}.${n}`);
    }
  }
});

test("descrição abaixo do título: centralizada após o h2, só preenchida na página pública", () => {
  const types = Object.entries(BLOCKS).filter(([, b]) => b.fields.intro).map(([t]) => t);
  assert.deepEqual(types.sort(), ["audience", "bonus", "checklist", "curriculum", "faq", "guarantee", "presentation", "social", "table", "testimonials"]);
  const sections = [{ type: "faq", title: "Dúvidas", intro: "Tudo o que você precisa saber.", items: [{ question: "Q", answer: "A" }] }];
  assert.match(render(sections, false), /Dúvidas<\/h2><p class="v-intro">Tudo o que você precisa saber\.<\/p>/);
  assert.match(render(sections, "live"), /<p class="v-intro" data-field="intro">Tudo o que você precisa saber\.<\/p>/);
  const empty = [{ type: "faq", title: "Dúvidas", items: [{ question: "Q", answer: "A" }] }];
  assert.ok(!render(empty, false).includes("v-intro"));
  assert.match(render(empty, "live"), /<p class="v-intro" data-field="intro" data-empty data-placeholder="Descrição abaixo do título">/);
});

// Um bloco de cada tipo com listas, cada lista com um item preenchido.
const listBlocks = () => Object.entries(BLOCKS).filter(([, b]) => Object.values(b.fields).some((f) => f.type === "list"))
  .map(([type, b]) => {
    const block = { type };
    if (type === "demo") block.style = "rows"; // o carrossel adiciona pelo slide "Adicionar imagem"
    if (b.fields.title || b.fields.name) block[b.fields.title ? "title" : "name"] = "T"; // o autor só aparece com nome
    if (type === "hero") block.visual = "stack"; // as imagens da composição só aparecem nesse estilo
    for (const [name, field] of Object.entries(b.fields)) {
      if (field.type !== "list") continue;
      const item = {};
      for (const [n, f] of Object.entries(field.item)) if (f.type === "text" || f.type === "textarea") item[n] = "x";
      block[name] = [item];
    }
    return block;
  });

test("listas: no editor, cada item tem × e cada lista tem '+ Adicionar …'", () => {
  for (const block of listBlocks()) {
    const live = render([block], "live");
    for (const [name, field] of Object.entries(BLOCKS[block.type].fields)) {
      if (field.type !== "list") continue;
      assert.ok(live.includes(`data-item="${name}.0"`), `${block.type}.${name}: item`);
      assert.ok(live.includes(`data-item-remove="${name}.0" aria-label="Remover ${field.noun} 1"`), `${block.type}.${name}: ×`);
      assert.ok(live.includes(`data-item-add="${name}">+ Adicionar ${field.noun}</button>`), `${block.type}.${name}: +`);
    }
  }
});

test("listas: a página pública não leva os botões de adicionar e remover", () => {
  const page = render(listBlocks(), false);
  assert.ok(!/data-item|item-add|item-remove/.test(page));
});

test("listas: cheia, sem '+ Adicionar'; carrossel com × em cada imagem", () => {
  const full = Array.from({ length: BLOCKS.guarantee.fields.items.max }, () => ({ icon: "check", text: "Selo" }));
  const live = render([{ type: "guarantee", title: "G", items: full }], "live");
  assert.ok(!live.includes("data-item-add"));
  assert.ok(live.includes(`data-item-remove="items.${full.length - 1}"`));
  const data = product([{ type: "demo", title: "G", items: [{ image: M1 }] }]);
  data.media = new Map([[M1, { url: "/uploads/a.webp", alt_text: "", width: 1500, height: 1000 }]]);
  const gallery = renderSalesPage(data, { baseUrl: "http://localhost", preview: "live" });
  assert.match(gallery, /<li class="slide" aria-label="Slide 1 de 2" data-item="items\.0"><img[^>]*><button type="button" class="item-remove" data-item-remove="items\.0"/);
});

test("listas vazias: no editor o bloco continua, oculto, com o botão de adicionar", () => {
  for (const type of ["presentation", "checklist", "audience", "faq"]) {
    const live = render([{ type, title: "T", items: [] }], "live");
    assert.match(live, /data-block="0" data-hidden/, type);
    assert.ok(live.includes('data-item-add="items"'), type);
    assert.ok(!render([{ type, title: "T", items: [] }], false).includes("v-section"), type);
  }
  assert.ok(render([{ type: "hero", bullets: [] }], "live").includes('data-item-add="bullets">+ Adicionar ponto'));
  assert.ok(!render([{ type: "hero", bullets: [] }], false).includes('class="v-bullets"'));
});

/* ---------- Links (autor e redes sociais) ---------- */
const { validateSections } = require("../sales/blocks");
const link = (url) => validateSections([{ type: "social", items: [{ network: "site", url }] }]);

test("endereço de link: completa https:// e mailto:, recusa esquemas perigosos", () => {
  assert.equal(link("linkedin.com/in/fulano").sections[0].items[0].url, "https://linkedin.com/in/fulano");
  assert.equal(link("  https://site.com.br/a?b=1 ").sections[0].items[0].url, "https://site.com.br/a?b=1");
  assert.equal(link("fulano@email.com").sections[0].items[0].url, "mailto:fulano@email.com");
  assert.equal(link("").sections[0].items[0].url, "");
  for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "ftp://x.com", "https://"]) {
    assert.match(link(bad).error || "", /endereço inválido/, bad);
  }
});

test("autor: links com ícone pelo endereço; a página pública mostra só os que têm endereço", () => {
  const sections = [{ type: "author", name: "Ana", links: [
    { label: "", url: "lattes.cnpq.br/123" }, { label: "Meu LinkedIn", url: "https://www.linkedin.com/in/ana" },
    { label: "Sem endereço", url: "" }] }];
  const page = render(sections, false);
  assert.match(page, /<ul class="link-list author-links"><li><a class="link-btn" href="https:\/\/lattes\.cnpq\.br\/123" target="_blank" rel="noopener noreferrer"><svg class="link-ico" aria-hidden="true"><use href="#i-cap"\/><\/svg>Currículo Lattes<span class="sr-only"> \(abre em nova aba\)<\/span><\/a><\/li>/);
  assert.match(page, /#i-net-linkedin"\/><\/svg>Meu LinkedIn</);
  assert.ok(!page.includes("Sem endereço"));
  assert.ok(page.includes('<symbol id="i-net-linkedin"'));
  const live = render(sections, "live");
  assert.match(live, /<a class="link-btn" data-no-url title="Defina o endereço em Configurar bloco ⚙">.*<span data-field="links\.2\.label">Sem endereço<\/span>/);
  assert.match(live, /<span data-field="links\.0\.label" data-fallback>Currículo Lattes<\/span>/);
  assert.ok(!render([{ type: "author", name: "Ana" }], false).includes("author-links"));
});

test("redes sociais: botões com o ícone da rede; sem links, some da página e fica oculto no editor", () => {
  const sections = [{ type: "social", title: "Siga", items: [
    { network: "instagram", url: "instagram.com/perfil", label: "" }, { network: "email", url: "a@b.com", label: "Escreva" },
    { network: "youtube", url: "", label: "" }] }];
  const page = render(sections, false);
  assert.match(page, /<a class="link-btn" href="https:\/\/instagram\.com\/perfil" target="_blank" rel="noopener noreferrer"><svg class="link-ico" aria-hidden="true"><use href="#i-net-instagram"\/><\/svg>Instagram</);
  assert.match(page, /<a class="link-btn" href="mailto:a@b\.com"><svg class="link-ico" aria-hidden="true"><use href="#i-net-email"\/><\/svg>Escreva<\/a>/);
  assert.ok(!page.includes("#i-net-youtube\"/></svg>YouTube"));
  const empty = [{ type: "social", items: [{ network: "x", url: "" }] }];
  assert.ok(!render(empty, false).includes("social-links"));
  assert.match(render(empty, "live"), /data-block="0" data-hidden/);
  assert.match(render(empty, "live"), /<h2 id="t-1" data-field="title" data-fallback>Acompanhe nas redes<\/h2>/);
});

/* ---------- Oferta final ---------- */
test("oferta: texto à esquerda, cartão de compra com preço, garantia, cadeado e aviso da Kiwify", () => {
  const page = render([{ type: "offer", title: "Garanta", text: "Desc.", items: [{ icon: "bolt", text: "Rápido" }],
    proof_title: "Especialista", proof_text: "10 anos", price_label: "Por", conditions: [{ text: "Pagamento único" }],
    guarantee_title: "Garantia de 7 dias", guarantee_text: "Devolvemos.", cta_label: "Quero me matricular agora" }], false);
  assert.match(page, /<div class="container offer-grid">\s*<div class="offer-main">/);
  assert.match(page, /<p class="lead">Desc\.<\/p>/);
  assert.match(page, /<ul class="offer-benefits"><li><svg class="ico" aria-hidden="true"><use href="#i-bolt"\/><\/svg>Rápido<\/li><\/ul>/);
  assert.match(page, /<div class="offer-proof">.*<strong>Especialista<\/strong><span>10 anos<\/span>/);
  assert.match(page, /<div class="buy-card">[\s\S]*R\$\s49,90[\s\S]*Pagamento único[\s\S]*<div class="buy-guarantee"><svg class="ico" aria-hidden="true"><use href="#i-shield"\/><\/svg><p><strong>Garantia de 7 dias<\/strong>/);
  assert.match(page, /<a class="btn-cta" href="https:\/\/pay\.example\.com\/x" target="_blank" rel="noopener noreferrer"><svg class="cta-ico" aria-hidden="true"><use href="#i-lock"\/><\/svg>Quero me matricular agora/);
  assert.match(page, /<p class="buy-note">Pagamento processado com segurança pela Kiwify\.<\/p>/);
});

test("oferta antiga (só os campos de antes) continua válida: preço, botão, e sem cartões vazios", () => {
  const old = [{ type: "offer", image: null, eyebrow: "Oferta", title: "Garanta", price_label: "Oferta especial", cta_label: "Garantir agora" }];
  assert.ok(validateSections(old).sections);
  const page = render(old, false);
  assert.match(page, /Oferta especial<\/span> R\$\s49,90/);
  assert.match(page, />Garantir agora<span class="sr-only">/);
  for (const piece of ["offer-benefits", "offer-proof", "buy-conditions", "buy-guarantee"]) assert.ok(!page.includes(piece), piece);
  const live = render(old, "live");
  assert.match(live, /<div class="offer-proof" data-empty>/);
  assert.match(live, /<div class="buy-guarantee" data-empty>/);
  assert.match(live, /<p class="buy-note" data-field="note" data-fallback>/);
});

test("marca do professor: nome e logo vão para o menu e o rodapé, como texto (sem HTML)", () => {
  const logoId = "11111111-1111-4111-8111-111111111111";
  const data = {
    ...product(defaultSections()), brand_name: "Coutinho <b>Treinamentos</b>", brand_logo_id: logoId,
    media: new Map([[logoId, { id: logoId, url: "/uploads/logo.webp", width: 300, height: 90, alt_text: "Logo" }]]),
  };
  const page = renderSalesPage(data, { baseUrl: "http://localhost", preview: false });
  assert.match(page, /<div id="site-header" data-brand-name="Coutinho &lt;b&gt;Treinamentos&lt;\/b&gt;" data-brand-logo="\/uploads\/logo.webp"/);
  assert.match(page, /<strong>Coutinho &lt;b&gt;Treinamentos&lt;\/b&gt;<\/strong> ©/);
  assert.doesNotMatch(page, /data-site="slogan"/);
  // Sem marca: menu e rodapé do site.
  const plain = render(defaultSections(), false);
  assert.match(plain, /<div id="site-header"><\/div>/);
  assert.match(plain, /<strong data-site="nome"><\/strong>/);
});

test("ícone da aba: o da empresa, senão o logo dela, senão o do site", () => {
  const logoId = "11111111-1111-4111-8111-111111111111", iconId = "22222222-2222-4222-8222-222222222222";
  const media = new Map([
    [logoId, { id: logoId, url: "/uploads/logo.webp", width: 300, height: 90, alt_text: "" }],
    [iconId, { id: iconId, url: "/uploads/icone.webp", width: 64, height: 64, alt_text: "" }],
  ]);
  const page = (extra) => renderSalesPage({ ...product(defaultSections()), media, ...extra },
    { baseUrl: "http://localhost", preview: false });
  assert.match(page({ brand_logo_id: logoId, brand_icon_id: iconId }), /<link rel="icon" type="image\/webp" href="\/uploads\/icone.webp">/);
  assert.match(page({ brand_logo_id: logoId }), /<link rel="icon" type="image\/webp" href="\/uploads\/logo.webp">/);
  assert.match(page({}), /<link rel="icon" type="image\/png" href="\/assets\/favicon\/favicon.png">/);
});

test("página de vendas sem botão voltar (navegação enxuta)", () => {
  for (const mode of [false, true, "live"]) assert.doesNotMatch(render(defaultSections(), mode), /v-back|data-back/);
});

test("grades: colunas escolhidas viram classe; automático não leva classe", () => {
  const item = { icon: "check", title: "T", text: "x" };
  assert.match(render([{ type: "presentation", style: "grid", title: "T", items: [item], columns: "four" }], false), /<ul class="grid8 cols-4">/);
  assert.match(render([{ type: "audience", title: "T", items: [{ icon: "user", text: "A" }], columns: "three" }], false), /<ul class="who cols-3">/);
  assert.match(render([{ type: "presentation", style: "grid", title: "T", items: [item] }], false), /<ul class="grid8">/);
});

test("texto formatado: negrito, cor e alinhamento na página pública e no editor", () => {
  const sections = [{ type: "faq", title: "[align=center]Dúvidas [b]frequentes[/b]", items: [
    { question: "[c=accent]Pergunta[/c]", answer: "[align=right][i]um[/i]\n\ndois" }] }];
  const page = render(sections, false);
  assert.match(page, /<h2 id="t-\d+" data-align="center">Dúvidas <strong>frequentes<\/strong><\/h2>/);
  // Texto formatado dentro de elemento flex (pergunta do FAQ) ganha um <span> em volta.
  assert.match(page, /<summary><span><span class="tx-c-accent">Pergunta<\/span><\/span><\/summary>/);
  assert.match(page, /<p data-align="right"><em>um<\/em><\/p><p data-align="right">dois<\/p>/);
  assert.doesNotMatch(page, /\[b\]|\[align/);
  const live = render(sections, "live");
  assert.match(live, /data-field="title" data-align="center">Dúvidas <strong>frequentes<\/strong>/);
});

/* ---------- Blocos salvos (já resolvidos por pages.js: conteúdo do bloco salvo + campos locais) ---------- */
test("bloco vindo de bloco salvo: público igual a um bloco comum; no editor, trancado e com etiqueta", () => {
  const sections = [
    { type: "faq", title: "Dúvidas", items: [{ question: "P?", answer: "R" }] },
    { type: "social", title: "Siga o professor", background: "dark",
      items: [{ network: "instagram", url: "https://instagram.com/prof", label: "" }] },
  ];
  const data = { ...product(sections), shared: new Map([[1, { id: "x", name: "Redes — <Prof>" }]]) };
  const pub = renderSalesPage(data, { baseUrl: "http://localhost", preview: false });
  assert.ok(pub.includes('href="https://instagram.com/prof"'));
  assert.ok(!pub.includes("data-shared"));

  const live = renderSalesPage(data, { baseUrl: "http://localhost", preview: "live" });
  const [faq, social] = sectionsOf(live).map(([, html]) => html);
  assert.ok(faq.includes("data-field"), "os outros blocos continuam editáveis");
  assert.ok(social.includes('data-shared="Redes — &lt;Prof&gt;"'), "etiqueta com o nome escapado");
  for (const marker of ["data-field", "data-item", "item-add", "item-remove", "data-icon-field"]) {
    assert.ok(!social.includes(marker), `"${marker}" apareceu no bloco salvo`);
  }
  assert.ok(social.includes("is-dark"), "o fundo escolhido na página vale");
});

test("bloco salvo sem nenhuma rede com link: no editor vira aviso com o nome do bloco", () => {
  const data = { ...product([{ type: "social", items: [] }]), shared: new Map([[0, { id: "x", name: "Prof. Vazio" }]]) };
  const live = renderSalesPage(data, { baseUrl: "http://localhost", preview: "live" });
  assert.ok(live.includes("editor-hidden-block"));
  assert.ok(live.includes("Prof. Vazio"));
});

test("imagens com versões menores levam srcset e sizes; sem versões, só src", () => {
  const big = "11111111-1111-4111-8111-111111111111", small = "22222222-2222-4222-8222-222222222222";
  const data = product([{ type: "hero", title: "T", image: big }, { type: "offer", title: "Oferta", image: small }]);
  data.media = new Map([
    [big, { id: big, url: "/uploads/a.webp", width: 1024, height: 1536, alt_text: "",
      srcset: "/uploads/a-480.webp 480w, /uploads/a-960.webp 960w, /uploads/a.webp 1024w" }],
    [small, { id: small, url: "/uploads/b.webp", width: 200, height: 200, alt_text: "", srcset: null }],
  ]);
  const page = renderSalesPage(data, { baseUrl: "http://localhost" });
  assert.match(page, /<img class="v-media" src="\/uploads\/a\.webp" srcset="\/uploads\/a-480\.webp 480w, \/uploads\/a-960\.webp 960w, \/uploads\/a\.webp 1024w" sizes="[^"]+480px[^"]*"/);
  assert.match(page, /<img class="buy-media" src="\/uploads\/b\.webp" alt=""/);
});

/* ---------- Landing pages mais chamativas: visual da abertura, números, linha do tempo, módulos ---------- */
const IMG = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const withMedia = (sections, ids) => {
  const data = product(sections);
  data.media = new Map(ids.map((id) => [id, { id, url: `/uploads/${id}.webp`, width: 900, height: 1200, alt_text: "", srcset: null }]));
  return renderSalesPage(data, { baseUrl: "http://localhost" });
};

test("abertura: imagem única, tela com moldura e composição 3D (etiquetas antigas são descartadas)", () => {
  const [a, b, c] = [IMG(3), IMG(4), IMG(5)];
  const single = withMedia([{ type: "hero", title: "T", image: a, image_label: "Manual em PDF" }], [a]);
  assert.match(single, /<figure class="v-visual"><img class="v-media"[^>]*><\/figure>/);
  assert.ok(!single.includes("Manual em PDF"));
  const screen = withMedia([{ type: "hero", title: "T", visual: "screen", image: a }], [a]);
  assert.match(screen, /<figure class="v-visual v-screen"><span class="v-screen-bar" aria-hidden="true">/);
  const stack = withMedia([{ type: "hero", title: "T", visual: "stack", image: a,
    extra_images: [{ image: b, label: "Fluxogramas" }, { image: c }, { image: null, label: "sem imagem" }] }], [a, b, c]);
  assert.match(stack, /<div class="hero-covers v-stack" data-count="3">/);
  assert.equal((stack.match(/<figure class="hero-cover">/g) || []).length, 3); // a sem imagem não entra
  assert.ok(!stack.includes("v-chip") && !stack.includes("Fluxogramas"));
  assert.ok(!stack.includes("sem imagem"));
  // Sem imagem nenhuma: o texto ocupa a largura toda.
  assert.match(render([{ type: "hero", title: "T", visual: "stack" }], false), /v-hero-grid no-media/);
});

test("abertura antiga: logo, selos, números e preço saem sem invalidar o bloco", () => {
  const old = [{ type: "hero", title: "T", lead: "L", logo: IMG(1), price_label: "Por apenas",
    stats: [{ value: "6", label: "módulos" }], badges: [{ strong: "PDF", text: "Prático" }] }, { type: "offer", title: "O" }];
  const { sections, error } = validateSections(old);
  assert.equal(error, undefined);
  for (const name of ["logo", "price_label", "stats", "badges"]) assert.ok(!(name in sections[0]), name);
  const page = render(old, false);
  assert.ok(!/v-stats|class="badges"|v-logo|Por apenas/.test(page.split('id="oferta"')[0]));
  assert.match(page, /<h1>T<\/h1>/);
});

test("abertura: botão leva à seção de compra (#oferta); sem ela, ao checkout", () => {
  const page = render([{ type: "hero", title: "T", cta_label: "Quero" }, { type: "offer", title: "O" }, { type: "offer", title: "O2" }], false);
  assert.match(page, /<p class="v-hero-cta"><a class="btn-cta" href="#oferta">Quero<\/a><\/p>/);
  assert.equal((page.match(/id="oferta"/g) || []).length, 1, "a âncora fica só na primeira oferta");
  assert.match(page, /<section class="v-final" id="oferta" aria-labelledby=/);
  const alone = render([{ type: "hero", title: "T", cta_label: "Quero" }], false);
  assert.match(alone, /<p class="v-hero-cta"><a class="btn-cta" href="https:\/\/pay\.example\.com\/x" target="_blank"/);
  const live = render([{ type: "hero", title: "T" }, { type: "offer", title: "O" }], "live");
  assert.match(live, /<a class="btn-cta" href="#oferta"><span data-field="cta_label" data-fallback>Comprar agora<\/span><\/a>/);
});

test("abertura: parágrafo abaixo do subtítulo (lado a lado) ou da imagem (centralizada)", () => {
  const a = IMG(7);
  const block = { type: "hero", title: "T", lead: "L", text: "Um parágrafo.", image: a };
  const split = withMedia([block], [a]);
  assert.match(split, /<p class="lead">L<\/p>\s*<p class="v-hero-para">Um parágrafo\.<\/p>/);
  const center = withMedia([{ ...block, layout: "center" }], [a]);
  assert.match(center, /<p class="lead">L<\/p>\s*<figure class="v-visual">.*?<\/figure>\s*<p class="v-hero-para">Um parágrafo\.<\/p>/s);
});

test("apresentação no estilo linha do tempo: passos numerados 01, 02…", () => {
  const items = [{ title: "Assista", text: "a" }, { title: "Estude", text: "b" }];
  const page = render([{ type: "presentation", style: "timeline", title: "Como", items }], false);
  assert.match(page, /<ol class="v-steps" data-count="2"><li><span class="v-step-num" aria-hidden="true">01<\/span><strong>Assista<\/strong><span>a<\/span><\/li><li><span class="v-step-num" aria-hidden="true">02<\/span>/);
  assert.ok(!page.includes("grid8"));
  assert.match(render([{ type: "presentation", style: "grid", title: "Como", items }], false), /<ul class="grid8">/);
});

test("carrossel com títulos e listas: painel do módulo ao lado das imagens", () => {
  const [a, b] = [IMG(6), IMG(7)];
  const page = withMedia([{ type: "demo", title: "G", items: [
    { image: a, title: "Fundamentos", bullets: "IBS e CBS\n\nTransição" }, { image: b, title: "Prática" }] }], [a, b]);
  assert.match(page, /<div class="gallery-split">/);
  assert.match(page, /<div class="module-panel" data-slide="0"><p class="module-num"><strong>01<\/strong> \/ 02<\/p><h3>Fundamentos<\/h3><ul class="v-lines"><li>IBS e CBS<\/li><li>Transição<\/li><\/ul><\/div>/);
  const plain = withMedia([{ type: "demo", title: "G", items: [{ image: a }, { image: b }] }], [a, b]);
  assert.ok(!plain.includes("gallery-split") && !plain.includes("module-panel"));
});

test("tópicos no editor: uma linha por <div>, editável como texto de várias linhas", () => {
  const live = render([{ type: "curriculum", title: "C", items: [{ title: "M1", topics: "Um\nDois" }] }], "live");
  assert.match(live, /<div class="v-lines module-topics" data-field="items\.0\.topics" data-multiline><div>Um<\/div><div>Dois<\/div><\/div>/);
});

test("currículo: módulos que abrem e fecham, com número, detalhe e tópicos", () => {
  const page = render([{ type: "curriculum", title: "Currículo", items: [{ title: "Introdução", meta: "3 aulas", topics: "A\nB" }] }], false);
  assert.match(page, /<details class="faq module"><summary><span class="module-head"><span class="module-tag">Módulo 01<\/span>Introdução<small class="module-meta">3 aulas<\/small><\/span><\/summary><ul class="v-lines module-topics"><li>A<\/li><li>B<\/li><\/ul><\/details>/);
  assert.ok(!render([{ type: "curriculum", title: "C", items: [] }], false).includes("v-section"));
});

test("demonstração: abas só com imagem; sem nenhuma, some da página e fica oculta no editor", () => {
  const a = IMG(8);
  const page = withMedia([{ type: "demo", style: "tabs", title: "Veja", items: [
    { label: "Manual", image: a, text: "Uma página" }, { label: "Aula", image: null }] }], [a]);
  assert.match(page, /<div class="demo-tabs" role="tablist" aria-labelledby="t-1" hidden><button type="button" role="tab" id="t-1-tab-0" aria-controls="t-1-panel-0" aria-selected="true">Manual<\/button><\/div>/);
  assert.match(page, /<figure class="demo-panel" role="tabpanel" id="t-1-panel-0" aria-labelledby="t-1-tab-0"><img class="demo-img"[^>]*><figcaption>Uma página<\/figcaption><\/figure>/);
  assert.ok(!page.includes("Aula"));
  const empty = [{ type: "demo", style: "tabs", title: "Veja", items: [{ label: "Manual" }] }];
  assert.ok(!render(empty, false).includes("v-section"));
  assert.match(render(empty, "live"), /data-block="0" data-hidden/);
});

test("texto e imagem: linhas alternadas; sem imagem, o texto ocupa a linha", () => {
  const a = IMG(9);
  const page = withMedia([{ type: "demo", style: "rows", items: [
    { title: "Um", text: "T", bullets: "x\ny", image: a }, { title: "Dois", text: "T" }] }], [a]);
  assert.match(page, /<article class="feature-row"><div class="feature-text"><h2>Um<\/h2><p>T<\/p><\/div><img class="feature-img"/); // a lista é só do carrossel
  assert.match(page, /<article class="feature-row no-media"><div class="feature-text"><h2>Dois<\/h2><p>T<\/p><\/div><\/article>/);
  assert.match(page, /<section class="[^"]*" aria-label="Destaques">/);
  // Com título na seção, o título de cada linha vira h3.
  const titled = withMedia([{ type: "demo", style: "rows", title: "Por dentro", items: [{ title: "Um", text: "T" }] }], []);
  assert.match(titled, /aria-labelledby="(t-\d+)">.*<h2 id="\1">Por dentro<\/h2>.*<h3>Um<\/h3>/s);
});

test("oferta: selos de compra segura em linha no fim do cartão de compra", () => {
  const page = render([{ type: "offer", title: "O", seals: [{ icon: "lock", text: "Pagamento seguro" }, { icon: "shield", text: "7 dias de garantia" }] }], false);
  assert.match(page, /<p class="buy-note">[^<]*<\/p>\s*<ul class="buy-seals" aria-label="Compra segura"><li><svg class="seal-ico" aria-hidden="true"><use href="#i-lock"\/><\/svg>Pagamento seguro<\/li>/);
  assert.ok(!render([{ type: "offer", title: "O" }], false).includes("buy-seals"));
});

test("blocos antigos, sem os campos novos, continuam válidos e com o visual de antes", () => {
  const old = [{ type: "hero", title: "T", lead: "L", badges: [], price_label: "", cta_label: "", logo: null, eyebrow: "", image: null },
    { type: "presentation", title: "T", items: [{ icon: "doc", title: "a", text: "b" }], eyebrow: "", intro: "", background: "auto" },
    { type: "demo", title: "G", items: [{ image: IMG(1) }], eyebrow: "", intro: "", background: "auto" }];
  const { sections, error } = validateSections(old);
  assert.equal(error, undefined);
  assert.equal(sections[0].visual, "image");
  assert.ok(!("stats" in sections[0]) && !("badges" in sections[0]) && !("logo" in sections[0]));
  assert.equal(sections[1].style, "cards");
  assert.ok(!("eyebrow" in sections[1])); // a Apresentação não tem mais rótulo
  assert.equal(sections[2].items[0].bullets, "");
  assert.ok(!("eyebrow" in sections[2]) && !("intro" in sections[2])); // a Demonstração não tem mais rótulo nem descrição
});

test("abertura: livro 3D, notebook e celular, mosaico", () => {
  const [a, b, c] = [IMG(3), IMG(4), IMG(5)];
  const book = withMedia([{ type: "hero", title: "T", visual: "book", image: a, image_label: "Manual" }], [a]);
  assert.match(book, /<figure class="v-visual v-book"><div class="v-book-3d"><img class="book-img"[^>]*><\/div><\/figure>/);
  const laptop = withMedia([{ type: "hero", title: "T", visual: "devices", image: a }], [a]);
  assert.match(laptop, /<div class="v-laptop"><div class="v-laptop-screen"><img class="laptop-img"/);
  assert.ok(!laptop.includes("v-phone") && !laptop.includes("has-phone"));
  const both = withMedia([{ type: "hero", title: "T", visual: "devices", image: a, extra_images: [{ image: b, label: "App" }] }], [a, b]);
  assert.match(both, /v-devices has-phone/);
  assert.match(both, /<div class="v-phone"><img class="phone-img"[^>]*><\/div>/);
  assert.ok(!both.includes("v-tablet"));
  const three = withMedia([{ type: "hero", title: "T", visual: "devices", image: a, extra_images: [{ image: b }, { image: c, label: "Tablet" }] }], [a, b, c]);
  assert.match(three, /v-devices has-phone has-tablet/);
  assert.match(three, /<div class="v-tablet"><img class="tablet-img"[^>]*><\/div>\s*<div class="v-phone">/);
  const mosaic = withMedia([{ type: "hero", title: "T", visual: "mosaic", image: a,
    extra_images: [{ image: b }, { image: null }, { image: c, label: "Fluxograma" }] }], [a, b, c]);
  assert.match(mosaic, /<div class="v-mosaic" data-count="3">/);
  assert.equal((mosaic.match(/<figure class="v-tile">/g) || []).length, 3);
  // No editor, as extras ganham "+ Adicionar imagem".
  for (const visual of ["stack", "mosaic", "devices"]) {
    assert.ok(render([{ type: "hero", title: "T", visual, image: null }], "live").includes('data-item-add="extra_images"'), visual);
  }
});

test("abertura em vídeo: YouTube e Vimeo tocam na página; outros sites abrem em nova aba", () => {
  const a = IMG(6);
  const hero = (video_url) => withMedia([{ type: "hero", title: "T", visual: "video", image: a, video_url }], [a]);
  const embedOf = (page) => (/data-embed="([^"]+)"/.exec(page) || [])[1];
  for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ"]) {
    assert.equal(embedOf(hero(url)), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&amp;rel=0", url);
  }
  assert.equal(embedOf(hero("https://vimeo.com/76979871")), "https://player.vimeo.com/video/76979871?autoplay=1");
  const other = hero("https://exemplo.com.br/video");
  assert.match(other, /<a class="v-play" href="https:\/\/exemplo\.com\.br\/video" target="_blank" rel="noopener noreferrer" aria-label/);
  assert.equal(embedOf(other), undefined);
  // Sem link: só a capa na página pública; no editor, o play aparece desativado.
  assert.ok(!hero("").includes("v-play"));
  assert.match(render([{ type: "hero", title: "T", visual: "video" }], "live"), /<span class="v-play is-empty"/);
});

/* ---------- Blocos do modelo de página de vendas (urgência, contagem, bônus, tabela) ---------- */
const NOW = Date.parse("2026-11-10T12:00:00Z");
const withOffer = (sections, { ends = "2026-11-12T02:59:00Z", preview = false } = {}) => renderSalesPage({
  ...product(sections), price_cents: 19700, offer_price_cents: 9700,
  offer_checkout_url: "https://pay.example.com/promo", offer_ends_at: ends,
}, { baseUrl: "http://localhost", preview, now: NOW });

test("faixa de urgência: só com oferta ativa; leva o cronômetro quando a oferta tem prazo", () => {
  const sections = [{ type: "urgency", text: "Só esta semana" }];
  assert.ok(!render(sections, false).includes("v-urgent"), "sem oferta, não aparece");
  const page = withOffer(sections);
  assert.match(page, /<section class="v-urgent"[^>]*>.*?<p class="v-urgent-text">Só esta semana<\/p><p class="offer-timer" data-ends-at="2026-11-12T02:59:00\.000Z"/s);
  assert.ok(!withOffer(sections, { ends: null }).includes("offer-timer"), "oferta sem prazo: só o texto");
  assert.match(withOffer(sections, { ends: null }), /v-urgent-text">Só esta semana/);
  // No editor aparece sempre (para editar o texto), marcada como oculta enquanto não há oferta.
  assert.match(render(sections, "live"), /<section class="v-urgent"[^>]* data-block="0" data-hidden>/);
  assert.match(withOffer(sections, { preview: "live" }), /<section class="v-urgent"[^>]* data-block="0">/);
});

test("contagem regressiva: usa o prazo da oferta; sem prazo não aparece", () => {
  const sections = [{ type: "countdown", title: "Aproveite", text: "Depois volta ao normal.", cta_label: "Quero" }];
  assert.ok(!render(sections, false).includes("v-countdown"));
  assert.ok(!withOffer(sections, { ends: null }).includes("v-countdown"));
  const page = withOffer(sections);
  assert.match(page, /<div class="v-count" data-count-ends="2026-11-12T02:59:00\.000Z" data-now="2026-11-10T12:00:00\.000Z"><p class="v-count-date">Oferta válida até 11\/11 às 23:59<\/p>/);
  assert.equal((page.match(/class="v-count-box"/g) || []).length, 4);
  assert.match(page, /data-count-boxes aria-hidden="true" hidden>/, "as caixas só aparecem com JavaScript");
  assert.match(page, /<a class="btn-cta" href="https:\/\/pay\.example\.com\/promo"/, "o botão leva ao link da oferta");
  const live = render(sections, "live");
  assert.match(live, /<section class="v-countdown"[^>]* data-block="0" data-hidden>/);
  assert.match(live, /data-count-boxes aria-hidden="true">/, "no editor as caixas aparecem zeradas");
});

test("bônus: cartões numerados com imagem, nome, descrição e valor riscado", () => {
  const a = IMG(7);
  const page = withMedia([{ type: "bonus", title: "Você também recebe", items: [
    { image: a, title: "Planilha", text: "Para organizar.", value: "R$ 27" }, { title: "Checklist", text: "Passo a passo." }] }], [a]);
  assert.match(page, /<div class="bonus-grid" data-count="2"><article class="bonus-card"><p class="v-tag">Bônus #1<\/p><img class="bonus-img"[^>]*><h3>Planilha<\/h3><p>Para organizar\.<\/p><p class="bonus-value">Valor: <s>R\$ 27<\/s> <strong>Grátis<\/strong><\/p><\/article>/);
  assert.match(page, /<p class="v-tag">Bônus #2<\/p><h3>Checklist<\/h3><p>Passo a passo\.<\/p><\/article>/, "sem valor e sem imagem: só nome e descrição");
  assert.ok(!render([{ type: "bonus", title: "T", items: [] }], false).includes("bonus-grid"));
});

test("comparativo em tabela: uma linha por critério, com ✗ e ✓", () => {
  const sections = [{ type: "table", title: "Compare", left_title: "Outros", right_title: "Este curso",
    rows: [{ label: "Suporte", left: "Demorado", right: "Em 24 horas" }] }];
  const page = render(sections, false);
  assert.match(page, /<thead><tr><td><\/td><th scope="col" class="no">Outros<\/th><th scope="col" class="yes">Este curso<\/th><\/tr><\/thead>/);
  assert.match(page, /<tr><th scope="row">Suporte<\/th><td class="no"><span class="v-compare-cell"><svg aria-hidden="true"><use href="#i-x"\/><\/svg><span>Demorado<\/span><\/span><\/td><td class="yes"><span class="v-compare-cell"><svg aria-hidden="true"><use href="#i-check"\/><\/svg><span>Em 24 horas<\/span><\/span><\/td><\/tr>/);
  assert.ok(!render([{ type: "table", title: "T", rows: [] }], false).includes("v-compare"));
});

test("abertura: lista de pontos com ícone, aviso abaixo do botão e disposição centralizada", () => {
  const a = IMG(8);
  const block = { type: "hero", title: "T", lead: "L", image: a, bullets: [{ icon: "checkcircle", text: "Ponto" }], note: "Acesso na hora" };
  const split = withMedia([block], [a]);
  assert.match(split, /<ul class="v-bullets"><li><svg class="ico" aria-hidden="true"><use href="#i-checkcircle"\/><\/svg>Ponto<\/li><\/ul>/);
  assert.match(split, /<p class="cta-note">Acesso na hora<\/p>\s*<\/div>\s*<figure class="v-visual">/, "lado a lado: a imagem é a 2ª coluna");
  const center = withMedia([{ ...block, layout: "center" }], [a]);
  assert.match(center, /<div class="container v-hero-grid is-center">/);
  assert.match(center, /<\/h1>\s*<p class="lead">L<\/p>\s*<figure class="v-visual">/, "centralizada: a imagem vem logo abaixo do subtítulo");
  const plain = render([{ type: "hero", title: "T" }], false);
  assert.ok(!/v-bullets|cta-note|is-center/.test(plain));
});

test("público: com descrição o perfil vira cartão; sem descrição, a lista de antes", () => {
  const cards = render([{ type: "audience", title: "T", items: [{ icon: "user", text: "Iniciante", description: "Quer começar do zero." }] }], false);
  assert.match(cards, /<ul class="who is-cards"><li><svg[^>]*><use href="#i-user"\/><\/svg><div class="who-text"><strong>Iniciante<\/strong><span class="who-desc">Quer começar do zero\.<\/span><\/div><\/li><\/ul>/);
  assert.match(render([{ type: "audience", title: "T", items: [{ icon: "user", text: "A" }] }], false), /<ul class="who"><li><svg[^>]*><use href="#i-user"\/><\/svg>A<\/li><\/ul>/);
});

test("autor: botão de compra opcional, com o link do produto", () => {
  const on = render([{ type: "author", name: "Instituto", show_cta: true, cta_label: "Quero conhecer" }], false);
  assert.match(on, /<p class="author-cta"><a class="btn-cta" href="https:\/\/pay\.example\.com\/x"[^>]*>Quero conhecer/);
  assert.ok(!render([{ type: "author", name: "Instituto" }], false).includes("author-cta"));
});

test("garantia: selo à esquerda e texto longo; sem selo, o cartão centralizado de antes", () => {
  const a = IMG(9);
  const page = withMedia([{ type: "guarantee", title: "7 dias", image: a, text: "Peça o reembolso.\n\nSem perguntas." }], [a]);
  assert.match(page, /<div class="v-card center has-seal"><img class="seal-img"[^>]*><div class="guarantee-body"><h2 id="t-1">7 dias<\/h2><p>Peça o reembolso\.<\/p><p>Sem perguntas\.<\/p>/);
  const plain = render([{ type: "guarantee", title: "7 dias" }], false);
  assert.match(plain, /<div class="v-card center"><div class="guarantee-body"><h2/);
  assert.ok(!plain.includes("seal-img"));
});

test("depoimentos: estrelas só quando escolhidas, com a nota em texto para leitores de tela", () => {
  const page = render([{ type: "testimonials", title: "T", items: [{ quote: "Ótimo", name: "Ana", stars: "4" }, { quote: "Bom", name: "Rui" }] }], false);
  assert.equal((page.match(/class="stars"/g) || []).length, 1);
  assert.match(page, /<p class="stars" role="img" aria-label="4 de 5 estrelas">/);
  assert.equal((page.match(/class="star is-on"/g) || []).length, 4);
});

test("blocos de antes do modelo de página de vendas continuam válidos, sem as peças novas", () => {
  const old = [
    { type: "hero", title: "T", lead: "L", badges: [], stats: [], visual: "image", image: null },
    { type: "audience", title: "P", items: [{ icon: "user", text: "A" }], columns: "auto", background: "auto" },
    { type: "author", name: "Ana", role: "", bio: "", photo: null, links: [] },
    { type: "guarantee", title: "G", intro: "", items: [{ icon: "lock", text: "Seguro" }] },
    { type: "testimonials", title: "D", items: [{ quote: "Q", name: "N", role: "", photo: null }] },
  ];
  assert.equal(validateSections(old).error, undefined);
  const page = render(old, false);
  assert.ok(!/v-bullets|cta-note|is-center|is-cards|who-desc|author-cta|has-seal|class="stars"/.test(page));
  assert.equal((page.match(/<section/g) || []).length, 5);
});

test("apresentação em cartões: sem título, só um h2 para leitores de tela; com título, h2 visível", () => {
  const items = [{ icon: "bolt", title: "B", text: "T", callout: "Destaque" }];
  const plain = render([{ type: "presentation", items }], false);
  assert.match(plain, /<h2 id="[^"]+" class="sr-only">Benefícios<\/h2>\s*<div class="two"><article class="v-card">/);
  assert.ok(plain.includes('<p class="callout">Destaque</p>'));
  assert.match(render([{ type: "presentation", title: "Por que", items }], false), /<h2 id="[^"]+">Por que<\/h2>/);
  // No editor o título aparece vazio, para ser preenchido direto na página.
  assert.match(render([{ type: "presentation", items }], "live"), /<h2 id="[^"]+" data-field="title" data-empty/);
});

test("apresentação: a descrição fica no fim da seção, depois dos itens", () => {
  const page = render([{ type: "presentation", style: "grid", title: "T", intro: "Fecho.", items: [{ icon: "doc", title: "a", text: "b" }] }], false);
  assert.match(page, /<\/ul>\s*<p class="v-intro is-last">Fecho\.<\/p>\s*<\/div><\/section>/);
  assert.match(render([{ type: "presentation", items: [] }], "live"), /<p class="v-intro is-last" data-field="intro" data-empty data-placeholder="Descrição no fim da seção">/);
});
