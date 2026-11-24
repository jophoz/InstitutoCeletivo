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

// Data de fim por extenso no horário de Brasília ("25/10 às 23:59").
function formatEnd(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

module.exports = { effectiveOffer, specialOffer, savings, formatEnd };
