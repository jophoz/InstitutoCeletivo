/* Índice das vendas por empresa: todo filtro por empresa da aba Resumo (vendas, receita, origem,
   pagamentos) procura brand_id dentro de um período de created_at. */

exports.up = (pgm) => {
  pgm.sql(`CREATE INDEX kiwify_sales_brand_created_idx ON kiwify_sales (brand_id, created_at);`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX kiwify_sales_brand_created_idx;`);
};
