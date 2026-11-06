// Testes do arquivo de backup do painel (lib/backup.js). Rodar: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const backup = require("../lib/backup");

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const table = (key) => backup.TABLES.find((t) => t.key === key);
const row = (key, extra = {}) => ({ id: ID, ...Object.fromEntries(table(key).columns.map((c) => [c, null])), ...extra });
const file = (extra = {}) => ({ format: "vitrine-backup", version: 1, ...extra });

test("versão do banco = última migration do código", () => {
  assert.match(backup.schemaVersion(), /^\d+_[a-z0-9-]+$/);
});

test("arquivo válido devolve as listas por tabela; listas ausentes viram vazias", () => {
  const out = backup.validateContent(file({ products: [row("products", { title: "X", slug: "x" })] }));
  assert.equal(out.products.length, 1);
  assert.equal(out.products[0].slug, "x");
  assert.deepEqual(out.brands, []);
  assert.deepEqual(out.salesPages, []);
});

test("recusa arquivo de outro formato ou versão", () => {
  assert.throws(() => backup.validateContent(null), backup.BackupError);
  assert.throws(() => backup.validateContent({ format: "outro", version: 1 }), /não é um backup/);
  assert.throws(() => backup.validateContent(file({ version: 2 })), /Versão/);
  assert.throws(() => backup.validateContent(file({ products: {} })), /lista/);
});

test("recusa registro com ID inválido, repetido ou com campo faltando", () => {
  assert.throws(() => backup.validateContent(file({ brands: [row("brands", { id: "1" })] })), /ID inválido/);
  assert.throws(() => backup.validateContent(file({ brands: [row("brands"), row("brands")] })), /ID repetido/);
  const { slug: _slug, ...noSlug } = row("products");
  assert.throws(() => backup.validateContent(file({ products: [noSlug] })), /slug/);
});

test("campos desconhecidos são descartados (nunca viram coluna no SQL)", () => {
  const out = backup.validateContent(file({ brands: [row("brands", { "x; DROP TABLE": 1 })] }));
  assert.deepEqual(Object.keys(out.brands[0]), ["id", ...table("brands").columns]);
});

test("no máximo uma empresa padrão no arquivo", () => {
  const brands = [row("brands", { is_default: true }), row("brands", { id: ID2, is_default: true })];
  assert.throws(() => backup.validateContent(file({ brands })), /mais de uma empresa padrão/);
});

test("upsert grava pelo ID e converte JSONB para texto", () => {
  const sections = [{ type: "hero" }];
  const q = backup.upsertQuery(table("salesPages"), row("salesPages", { sections, theme: {} }));
  assert.match(q.text, /^INSERT INTO sales_pages \(id, product_id, sections/);
  assert.match(q.text, /ON CONFLICT \(id\) DO UPDATE SET product_id = EXCLUDED\.product_id/);
  assert.equal(q.values[0], ID);
  assert.equal(q.values[2], JSON.stringify(sections));
  assert.equal(q.values[4], null); // published_sections nulo continua nulo
});

test("dados da imagem: textos cortados no limite, data inválida vira nula", () => {
  const meta = backup.validateMediaMeta({ original_name: "a".repeat(300), alt_text: null, created_at: "ontem" });
  assert.equal(meta.original_name.length, 255);
  assert.equal(meta.alt_text, null);
  assert.equal(meta.created_at, null);
  assert.throws(() => backup.validateMediaMeta({ original_name: 5 }), backup.BackupError);
});

test("erros conhecidos do banco viram mensagem do painel", () => {
  assert.match(backup.describeDbError({ code: "23505", constraint: "products_slug_key" }), /mesmo endereço/);
  assert.match(backup.describeDbError({ code: "23503", constraint: "products_image_id_fkey" }), /não chegou a ser importad/);
  assert.equal(backup.describeDbError({ code: "08006" }), null);
});
