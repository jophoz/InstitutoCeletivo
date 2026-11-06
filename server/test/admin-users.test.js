// Testes das regras de e-mail e senha dos administradores (lib/admin-users.js). Rodar: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeEmail, checkPassword, AdminUserInputError } = require("../lib/admin-users");

test("e-mail: tira espaços e passa para minúsculas", () => {
  assert.equal(normalizeEmail("  Ana@Exemplo.COM "), "ana@exemplo.com");
});

test("e-mail inválido é recusado", () => {
  for (const bad of ["", "ana", "ana@", "ana@exemplo", "a b@exemplo.com", null, 5, `${"a".repeat(250)}@x.com`]) {
    assert.throws(() => normalizeEmail(bad), AdminUserInputError, String(bad));
  }
});

test("senha entre 12 e 128 caracteres", () => {
  assert.equal(checkPassword("a".repeat(12)), "a".repeat(12));
  assert.equal(checkPassword("a".repeat(128)), "a".repeat(128));
  assert.throws(() => checkPassword("a".repeat(11)), /entre 12 e 128/);
  assert.throws(() => checkPassword("a".repeat(129)), AdminUserInputError);
  assert.throws(() => checkPassword(undefined), AdminUserInputError);
});
