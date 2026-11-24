/* Oferta especial do produto: a coluna "Melhor opção" do bloco Oferta final no estilo Oferta dupla
   (ex.: o curso com bônus, ou a formação completa). Preço fixo, sem prazo.
   - special_price_cents / special_checkout_url: preço e link. Com Kiwify, vêm de um link da conta da
     empresa (special_kiwify_product_id + special_kiwify_link_id): outro link do mesmo produto ou um
     link de outro produto. A sincronização os preenche; sem Kiwify, são digitados.
   - special_compare_cents: o valor "de" (riscado), digitado. Só aparece se for maior que o preço. */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE products
      ADD COLUMN special_kiwify_product_id VARCHAR(64),
      ADD COLUMN special_kiwify_link_id VARCHAR(64),
      ADD COLUMN special_price_cents INTEGER,
      ADD COLUMN special_checkout_url TEXT,
      ADD COLUMN special_compare_cents INTEGER,
      ADD CONSTRAINT products_special_pair CHECK ((special_price_cents IS NULL) = (special_checkout_url IS NULL)),
      ADD CONSTRAINT products_special_price CHECK (special_price_cents IS NULL OR special_price_cents BETWEEN 0 AND 100000000),
      ADD CONSTRAINT products_special_compare CHECK (special_compare_cents IS NULL OR special_compare_cents BETWEEN 0 AND 100000000),
      ADD CONSTRAINT products_special_link CHECK ((special_kiwify_product_id IS NULL) = (special_kiwify_link_id IS NULL)),
      ADD CONSTRAINT products_special_kiwify CHECK (special_kiwify_link_id IS NULL OR kiwify_product_id IS NOT NULL);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE products
      DROP CONSTRAINT products_special_kiwify,
      DROP CONSTRAINT products_special_link,
      DROP CONSTRAINT products_special_compare,
      DROP CONSTRAINT products_special_price,
      DROP CONSTRAINT products_special_pair,
      DROP COLUMN special_compare_cents,
      DROP COLUMN special_checkout_url,
      DROP COLUMN special_price_cents,
      DROP COLUMN special_kiwify_link_id,
      DROP COLUMN special_kiwify_product_id;
  `);
};
