/* Promoção sem link: em vez de um link promocional (preço menor na Kiwify), só um valor "de"
   digitado, maior que o preço normal. O cliente paga o preço normal pelo link normal; a página e o
   catálogo mostram "de R$ X por R$ Y" e quanto custa a menos. Vale o mesmo prazo (offer_ends_at).
   - offer_compare_cents: o valor "de". Não convive com o link promocional (é um ou outro). */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE products
      ADD COLUMN offer_compare_cents INTEGER,
      ADD CONSTRAINT products_offer_compare CHECK (offer_compare_cents IS NULL OR offer_compare_cents BETWEEN 0 AND 100000000),
      ADD CONSTRAINT products_offer_kind CHECK (offer_compare_cents IS NULL OR (offer_price_cents IS NULL AND offer_kiwify_link_id IS NULL));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE products
      DROP CONSTRAINT products_offer_kind,
      DROP CONSTRAINT products_offer_compare,
      DROP COLUMN offer_compare_cents;
  `);
};
