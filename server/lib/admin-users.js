// Regras de e-mail e senha dos administradores do painel (aba Usuários e scripts/admin-user.js).
class AdminUserInputError extends Error {}

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 128;

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AdminUserInputError("E-mail inválido.");
  return email;
}

function checkPassword(value) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD || value.length > MAX_PASSWORD) {
    throw new AdminUserInputError(`A senha deve ter entre ${MIN_PASSWORD} e ${MAX_PASSWORD} caracteres.`);
  }
  return value;
}

module.exports = { AdminUserInputError, MIN_PASSWORD, MAX_PASSWORD, normalizeEmail, checkPassword };
