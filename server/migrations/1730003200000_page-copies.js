/* Cópias da página de vendas em outros sites (aba Resumo do painel).
   Quem clona a página costuma copiar o HTML e trocar o link de compra. O venda.js percebe quando
   está rodando fora deste site e avisa o servidor (lib/page-copies.js): uma linha por domínio.
   - host: domínio onde a cópia está (vem do cabeçalho Origin, que o navegador preenche).
   - product_slug: qual página foi copiada; path: endereço da cópia no outro site.
   - hits: quantas vezes a cópia foi aberta (aproximado, com limite por IP). */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE page_copies (
      host VARCHAR(100) PRIMARY KEY,
      product_slug VARCHAR(200),
      path VARCHAR(300),
      hits INTEGER NOT NULL DEFAULT 1,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE page_copies;");
};
