// Oferta do produto (preço "de/por" e prazo): lib/offer.js e o desenho na página de vendas.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { effectiveOffer, checkoutLink, formatEnd } = require("../lib/offer");
const { renderSalesPage } = require("../sales/render");

const NOW = Date.parse("2026-10-23T12:00:00Z");
const base = {
  price_cents: 19700, checkout_url: "https://pay.kiwify.com.br/Normal1",
  offer_price_cents: 9700, offer_checkout_url: "https://pay.kiwify.com.br/Promo01",
  offer_ends_at: "2026-10-25T23:59:00-03:00",
};

test("oferta: ativa troca preço e link e informa o 'de' e o prazo", () => {
  assert.deepEqual(effectiveOffer(base, NOW), {
    active: true, price_cents: 9700, checkout_url: "https://pay.kiwify.com.br/Promo01",
    compare_cents: 19700, ends_at: "2026-10-26T02:59:00.000Z",
  });
});

test("oferta: prazo vencido (inclusive no segundo exato), preço não menor ou sem link -> preço normal", () => {
  const regular = { active: false, price_cents: 19700, checkout_url: base.checkout_url, compare_cents: null, ends_at: null };
  assert.deepEqual(effectiveOffer({ ...base, offer_ends_at: "2026-10-23T11:59:59Z" }, NOW), regular);
  assert.deepEqual(effectiveOffer({ ...base, offer_ends_at: new Date(NOW) }, NOW), regular);
  assert.deepEqual(effectiveOffer({ ...base, offer_price_cents: 19700 }, NOW), regular);
  assert.deepEqual(effectiveOffer({ ...base, offer_checkout_url: null }, NOW), regular);
  assert.deepEqual(effectiveOffer({ ...base, offer_price_cents: null }, NOW), regular);
});

test("oferta: sem prazo vale sempre (só 'de/por', sem cronômetro)", () => {
  const offer = effectiveOffer({ ...base, offer_ends_at: null }, NOW);
  assert.equal(offer.active, true);
  assert.equal(offer.ends_at, null);
});

test("oferta: data por extenso no horário de Brasília", () => {
  assert.equal(formatEnd("2026-10-26T02:59:00.000Z"), "25/10 às 23:59");
});

/* ---------- Página de vendas ---------- */
const page = (product, now = NOW) => renderSalesPage({
  title: "Manual", slug: "manual", short_description: "", status: "published", image_id: null,
  brand_name: null, brand_logo_id: null, theme: null, published_at: null, media: new Map(),
  sections: [
    { type: "hero", title: "T", cta_label: "" },
    { type: "cta", title: "Pronto?", cta_label: "" },
    { type: "offer", title: "Oferta", price_label: "", cta_label: "" },
  ],
  ...product,
}, { baseUrl: "http://localhost", now });

test("página: oferta ativa usa o link promocional, mostra 'de/por' e o cronômetro na oferta final", () => {
  const html = page(base);
  assert.ok(!html.includes("Normal1"), "o link normal não deve aparecer durante a oferta");
  // A abertura e a chamada intermediária não têm preço: os botões delas rolam até a oferta final,
  // que é o único lugar com o checkout.
  assert.match(html, /<p class="v-hero-cta"><a class="btn-cta" href="#oferta">/);
  assert.match(html, /<div class="v-strip-action"><a class="btn-cta" href="#oferta">/);
  // O botão leva à rota de compra; o link (promocional, agora) é escolhido na hora do clique.
  assert.equal(html.match(/href="\/comprar\/manual"/g).length, 1);
  assert.ok(!html.includes("Promo01"), "o link de checkout não fica no HTML");
  assert.equal(checkoutLink(base, { now: NOW }), "https://pay.kiwify.com.br/Promo01");
  assert.equal(html.match(/<s class="price-was"><span class="sr-only">De <\/span>R\$\s197,00<\/s>/g).length, 1);
  assert.equal(html.match(/class="offer-timer" data-ends-at="2026-10-26T02:59:00\.000Z" data-now="2026-10-23T12:00:00\.000Z"/g).length, 1);
  assert.match(html, /Oferta válida até 25\/10 às 23:59/);
});

test("página: oferta encerrada volta ao link e preço normais e não vaza o link promocional", () => {
  const html = page(base, Date.parse("2026-10-26T03:00:00Z"));
  assert.ok(!html.includes("Promo01"));
  assert.ok(!html.includes("price-was"));
  assert.ok(!html.includes("offer-timer"));
  assert.match(html, /href="\/comprar\/manual"/);
  assert.equal(checkoutLink(base, { now: Date.parse("2026-10-26T03:00:00Z") }), "https://pay.kiwify.com.br/Normal1");
  assert.match(html, /R\$\s197,00/);
});

test("página: oferta sem prazo mostra 'de/por' sem cronômetro", () => {
  const html = page({ ...base, offer_ends_at: null });
  assert.match(html, /price-was/);
  assert.ok(!html.includes("offer-timer"));
});

/* ---------- Oferta especial (Oferta dupla) ---------- */
const { specialOffer } = require("../lib/offer");
const special = { special_price_cents: 29700, special_checkout_url: "https://pay.kiwify.com.br/Combo1", special_compare_cents: 49700 };

test("oferta especial: precisa de preço e link; o 'de' só quando é maior que o preço", () => {
  assert.deepEqual(specialOffer(special), { price_cents: 29700, checkout_url: "https://pay.kiwify.com.br/Combo1", compare_cents: 49700 });
  assert.equal(specialOffer({ ...special, special_checkout_url: null }), null);
  assert.equal(specialOffer({ ...special, special_price_cents: null }), null);
  assert.equal(specialOffer({ ...special, special_compare_cents: 29700 }).compare_cents, null);
  assert.equal(specialOffer({ ...special, special_compare_cents: null }).compare_cents, null);
});

const doubleOffer = (extra = {}) => ({
  type: "offer", style: "double", title: "Escolha a sua", card_title: "Curso", cta_label: "Quero o curso",
  special_title: "Curso + bônus", special_items: [{ icon: "gift", text: "Mentoria" }], special_cta_label: "Quero o combo", ...extra,
});
const renderDouble = (product, preview = false) => renderSalesPage({
  title: "P", slug: "p", short_description: "", status: "published", image_id: null, brand_name: null, brand_logo_id: null,
  theme: null, published_at: null, media: new Map(), sections: [doubleOffer()], ...product,
}, { baseUrl: "http://localhost", preview, now: NOW });

test("oferta dupla: dois cartões, cada um com o seu link; a especial com selo e 'de' riscado", () => {
  const page = renderDouble({ ...base, offer_price_cents: null, offer_checkout_url: null, ...special });
  assert.match(page, /<section class="v-final is-double" id="oferta"/);
  assert.match(page, /<div class="offer-cards">/);
  assert.match(page, /<div class="buy-card is-special">\s*<p class="offer-badge">Melhor opção<\/p>/);
  assert.match(page, /<s class="price-was"><span class="sr-only">De <\/span>R\$\s497,00<\/s> <span class="sr-only">por <\/span>R\$\s297,00/);
  assert.match(page, /href="\/comprar\/p"[^>]*>.*Quero o curso/);
  assert.match(page, /href="\/comprar\/p\?opcao=melhor"[^>]*>.*Quero o combo/);
  const product = { ...base, offer_price_cents: null, offer_checkout_url: null, ...special };
  assert.equal(checkoutLink(product, { now: NOW }), "https://pay.kiwify.com.br/Normal1");
  assert.equal(checkoutLink(product, { option: "melhor", now: NOW }), "https://pay.kiwify.com.br/Combo1");
  assert.match(page, /Mentoria/);
  // os extras do estilo simples não aparecem
  assert.ok(!/offer-proof|buy-guarantee|buy-seals|offer-benefits/.test(page));
});

test("oferta dupla sem oferta especial cadastrada: página pública só com a normal; editor com aviso", () => {
  const page = renderDouble(base);
  assert.match(page, /<div class="offer-cards is-alone">/);
  assert.ok(!page.includes("is-special"));
  const live = renderDouble(base, "live");
  assert.match(live, /buy-card is-special is-missing/);
  assert.match(live, /Ligue a Melhor opção no cadastro do produto/);
  assert.match(live, /<span class="btn-cta is-disabled"/);
});

test("oferta simples continua igual para páginas antigas (sem estilo gravado)", () => {
  const page = renderDouble({ ...base, sections: [{ type: "offer", title: "T", cta_label: "Comprar" }] });
  assert.match(page, /<section class="v-final" id="oferta"/);
  assert.match(page, /<div class="container offer-grid">/);
});

/* ---------- Promoção só com o valor "de" (sem link) e "R$ X a menos" ---------- */
const { savings } = require("../lib/offer");
const deOnly = { price_cents: 25900, checkout_url: "https://pay.kiwify.com.br/Normal1", offer_compare_cents: 49700 };

test("promoção sem link: preço e link normais, o 'de' riscado e o mesmo prazo", () => {
  assert.deepEqual(effectiveOffer(deOnly, NOW), {
    active: true, price_cents: 25900, checkout_url: "https://pay.kiwify.com.br/Normal1", compare_cents: 49700, ends_at: null,
  });
  const regular = { active: false, price_cents: 25900, checkout_url: deOnly.checkout_url, compare_cents: null, ends_at: null };
  assert.deepEqual(effectiveOffer({ ...deOnly, offer_compare_cents: 25900 }, NOW), regular); // "de" não é maior
  assert.deepEqual(effectiveOffer({ ...deOnly, offer_ends_at: "2026-10-23T11:00:00Z" }, NOW), regular); // prazo vencido
  assert.equal(effectiveOffer({ ...deOnly, offer_ends_at: "2026-10-25T23:59:00-03:00" }, NOW).ends_at, "2026-10-26T02:59:00.000Z");
});

test("'R$ X a menos': só com 'de' maior que o preço", () => {
  assert.equal(savings(49700, 25900), 23800);
  assert.equal(savings(25900, 25900), null);
  assert.equal(savings(null, 25900), null);
});

test("página de vendas: 'R$ X a menos' na promoção sem link e na Melhor opção", () => {
  const page = renderDouble({ ...deOnly, ...special });
  assert.match(page, /<s class="price-was"><span class="sr-only">De <\/span>R\$\s497,00<\/s> <span class="sr-only">por <\/span>R\$\s259,00<\/p><p class="price-save">R\$\s238,00 a menos<\/p>/);
  assert.match(page, /R\$\s297,00<\/p><p class="price-save">R\$\s200,00 a menos<\/p>/);
  assert.match(page, /href="\/comprar\/p"/);
  assert.equal(checkoutLink(deOnly, { now: NOW }), "https://pay.kiwify.com.br/Normal1"); // o cliente paga o preço normal
});

test("rota de compra: repassa utm_*, src e sck à Kiwify sem trocar os que o link já tem", () => {
  const query = { utm_source: "instagram", utm_campaign: "lancamento", src: "bio", outro: "x", utm_medium: ["a", "b"] };
  const url = new URL(checkoutLink({ ...base, offer_checkout_url: "https://pay.kiwify.com.br/Promo01?utm_campaign=fixa" }, { query, now: NOW }));
  assert.equal(url.origin + url.pathname, "https://pay.kiwify.com.br/Promo01");
  assert.equal(url.searchParams.get("utm_source"), "instagram");
  assert.equal(url.searchParams.get("utm_campaign"), "fixa", "o do link cadastrado vale");
  assert.equal(url.searchParams.get("src"), "bio");
  assert.ok(!url.searchParams.has("outro"), "só os parâmetros de origem passam");
  assert.ok(!url.searchParams.has("utm_medium"), "valor repetido é ignorado");
});

test("rota de compra: sem link (ou Melhor opção sem cadastro) devolve null", () => {
  assert.equal(checkoutLink({ price_cents: 100, checkout_url: null }), null);
  assert.equal(checkoutLink(base, { option: "melhor", now: NOW }), null);
});
