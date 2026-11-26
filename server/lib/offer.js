// Preço e link que o site mostra agora: o da promoção (se vale neste momento) ou o normal.
// Fonte única para a página de vendas e o catálogo. Dois tipos de promoção:
//  - com link promocional: vale quando tem preço e link e o preço é menor que o normal;
//  - só o valor "de" (offer_compare_cents): preço e link normais, com o "de" maior que o preço.
// Nos dois, o prazo (se houver) ainda não pode ter acabado.
// Devolve { active, price_cents, checkout_url, compare_cents, ends_at }:
//   compare_cents = o "de" riscado, só com promoção ativa; ends_at = fim em ISO, ou null.
const has = (v) => v !== null && v !== undefined;
function effectiveOffer(p, now = Date.now()) {
  const regular = {
    active: false, price_cents: p.price_cents ?? null, checkout_url: p.checkout_url || null,
    compare_cents: null, ends_at: null,
  };
  const ends = p.offer_ends_at ? new Date(p.offer_ends_at) : null;
  if (ends && !(ends.getTime() > now)) return regular;
  const endsAt = ends ? ends.toISOString() : null;
  const compare = p.offer_compare_cents;
  if (has(compare)) {
    if (!has(p.price_cents) || !p.checkout_url || compare <= p.price_cents) return regular;
    return { ...regular, active: true, compare_cents: compare, ends_at: endsAt };
  }
  const price = p.offer_price_cents;
  if (!has(price) || !p.offer_checkout_url) return regular;
  if (has(p.price_cents) && price >= p.price_cents) return regular;
  return {
    active: true, price_cents: price, checkout_url: p.offer_checkout_url,
    compare_cents: p.price_cents ?? null, ends_at: endsAt,
  };
}

// "R$ 62,00 a menos": diferença entre o "de" e o preço (null se não houver os dois).
const savings = (compare, price) => (has(compare) && has(price) && compare > price ? compare - price : null);

// Melhor opção (segundo cartão da Oferta dupla): preço fixo, sem prazo. Vale quando tem
// preço e link. Devolve { price_cents, checkout_url, compare_cents } ou null; compare_cents (o "de"
// riscado) só quando é maior que o preço (a Kiwify pode ter mudado o preço depois do cadastro).
function specialOffer(p) {
  const price = p.special_price_cents;
  if (price === null || price === undefined || !p.special_checkout_url) return null;
  const compare = p.special_compare_cents;
  return { price_cents: price, checkout_url: p.special_checkout_url, compare_cents: compare > price ? compare : null };
}

// Parâmetros do endereço que seguem até a Kiwify (origem da venda no relatório de lá).
const FORWARDED = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src", "sck"];

// Para onde vai o botão "comprar" (rota /comprar/:slug): o link que vale AGORA, decidido na hora do
// clique. option "melhor" = a Melhor opção; senão, a oferta ativa ou o link normal. query: os
// parâmetros do endereço (utm_*...), repassados ao checkout sem sobrescrever os que o link já tem.
// Devolve o endereço completo, ou null se não houver link de compra.
function checkoutLink(p, { option = null, query = {}, now = Date.now() } = {}) {
  const raw = option === "melhor" ? specialOffer(p)?.checkout_url : effectiveOffer(p, now).checkout_url;
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  for (const key of FORWARDED) {
    const value = query[key];
    if (typeof value !== "string" || !value || url.searchParams.has(key)) continue;
    url.searchParams.set(key, value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100));
  }
  return url.toString();
}

// Data de fim por extenso no horário de Brasília ("25/10 às 23:59").
function formatEnd(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

module.exports = { effectiveOffer, specialOffer, checkoutLink, savings, formatEnd };
