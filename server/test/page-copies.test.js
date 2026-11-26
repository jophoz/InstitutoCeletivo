// Cópias da página em outros sites: qual domínio entra na lista (lib/page-copies.js).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { copyHost, parseReport } = require("../lib/page-copies");

test("cópias: o domínio vem do Origin, sem www e sem porta", () => {
  assert.equal(copyHost("https://www.copia-golpe.com.br", "meusite.com.br"), "copia-golpe.com.br");
  assert.equal(copyHost("http://loja.exemplo.com:8080", "meusite.com.br"), "loja.exemplo.com");
  assert.equal(copyHost("https://copia.com/p/x?a=1", "meusite.com.br"), "copia.com", "Referer completo também serve");
});

test("cópias: o próprio site, tradutores, arquivo, localhost e lixo não entram", () => {
  const own = "www.meusite.com.br";
  assert.equal(copyHost("https://meusite.com.br", own), null);
  assert.equal(copyHost("https://www.meusite.com.br", "meusite.com.br:443"), null);
  assert.equal(copyHost("https://meusite-com-br.translate.goog", own), null);
  assert.equal(copyHost("https://web.archive.org", own), null);
  assert.equal(copyHost("http://localhost:3000", own), null);
  assert.equal(copyHost("http://192.168.0.10", own), null);
  assert.equal(copyHost("null", own), null, "página salva aberta do computador (file://)");
  assert.equal(copyHost("", own), null);
  assert.equal(copyHost(undefined, own), null);
  assert.equal(copyHost("ftp://copia.com", own), null);
  assert.equal(copyHost("não é endereço", own), null);
});

test("cópias: o aviso só leva um endereço de produto válido e um caminho curto e limpo", () => {
  assert.deepEqual(parseReport({ product: "manual-reforma", path: "/oferta" }), { slug: "manual-reforma", path: "/oferta" });
  assert.deepEqual(parseReport({ product: "<script>", path: 5 }), { slug: null, path: null });
  assert.equal(parseReport({ path: "/a\u0000b" + "x".repeat(400) }).path.length, 300);
  assert.deepEqual(parseReport(null), { slug: null, path: null });
});
