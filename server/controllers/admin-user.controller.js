// Aba Usuários do painel: listar, adicionar e remover administradores e trocar a própria senha.
// O primeiro administrador continua sendo criado pelo script (scripts/admin-user.js), que também
// recupera o acesso se todos esquecerem a senha.
const pool = require("../config/database");
const sec = require("../lib/security");
const { AdminUserInputError, normalizeEmail, checkPassword } = require("../lib/admin-users");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Senha atual errada: mesmo limite do login (5 erros em 15 min por usuário).
const WINDOW = 15 * 60 * 1000;
const wrongPassword = sec.createLimiter({ max: 5, windowMs: WINDOW });

// Confere a senha de quem está logado antes de uma ação sensível. Devolve null se estiver certa,
// ou { status, error } para responder. Com a chave de API (sem usuário) não há o que conferir.
async function confirmCurrentPassword(req, password) {
  if (!req.admin.userId) return null;
  const key = req.admin.userId;
  if (wrongPassword.isBlocked(key)) {
    return { status: 429, error: "Muitas tentativas com a senha errada. Aguarde alguns minutos e tente de novo." };
  }
  wrongPassword.hit(key); // conta antes de conferir (ver createLimiter)
  if (typeof password !== "string" || password.length > 256) return { status: 400, error: "Informe sua senha atual." };
  const { rows } = await pool.query("SELECT password_hash FROM admin_users WHERE id = $1", [key]);
  if (!(await sec.verifyPassword(password, rows[0]?.password_hash))) return { status: 403, error: "Sua senha atual está incorreta." };
  wrongPassword.clear(key);
  return null;
}

// GET /api/admin/users
async function listUsers(req, res) {
  const { rows } = await pool.query(
    "SELECT id, email, created_at, last_login_at FROM admin_users ORDER BY lower(email)"
  );
  return res.json({ data: rows.map((u) => ({ ...u, is_me: u.id === req.admin.userId })) });
}

// POST /api/admin/users { email, password, currentPassword }
async function createUser(req, res) {
  const body = req.body || {};
  let email, password;
  try {
    email = normalizeEmail(body.email);
    password = checkPassword(body.password);
  } catch (error) {
    if (error instanceof AdminUserInputError) return res.status(400).json({ error: error.message });
    throw error;
  }
  const denied = await confirmCurrentPassword(req, body.currentPassword);
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT ((lower(email))) DO NOTHING
     RETURNING id, email, created_at, last_login_at`,
    [email, await sec.hashPassword(password)]
  );
  if (!rows.length) return res.status(409).json({ error: "Já existe um administrador com este e-mail." });
  return res.status(201).json({ data: { ...rows[0], is_me: false } });
}

// DELETE /api/admin/users/:id. Apagar o usuário apaga as sessões dele (ON DELETE CASCADE).
async function deleteUser(req, res) {
  const id = String(req.params.id).toLowerCase();
  if (!UUID.test(id)) return res.status(404).json({ error: "Administrador não encontrado." });
  if (id === req.admin.userId) {
    return res.status(400).json({ error: "Você não pode remover o próprio acesso. Peça a outro administrador." });
  }
  // Trava todos os administradores antes de contar: se dois removerem um ao outro ao mesmo tempo,
  // o segundo espera o primeiro terminar e vê a contagem já atualizada (nunca sobram zero).
  const client = await pool.connect();
  let broken; // ROLLBACK falhou (conexão caiu): o cliente é descartado em vez de voltar ao pool
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id FROM admin_users FOR UPDATE");
    let result;
    if (!rows.some((u) => u.id === id)) result = { status: 404, error: "Administrador não encontrado." };
    else if (rows.length < 2) result = { status: 409, error: "Este é o único administrador; o painel ficaria sem acesso." };
    else await client.query("DELETE FROM admin_users WHERE id = $1", [id]);
    await client.query("COMMIT");
    return result ? res.status(result.status).json({ error: result.error }) : res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK").catch((rollbackError) => { broken = rollbackError; });
    throw error;
  } finally {
    client.release(broken);
  }
}

// POST /api/admin/users/me/password { currentPassword, newPassword }
// Encerra as outras sessões da pessoa (ex.: um computador esquecido logado); a atual continua.
async function changeOwnPassword(req, res) {
  if (!req.admin.userId) return res.status(400).json({ error: "Entre no painel com e-mail e senha para trocar a senha." });
  const body = req.body || {};
  let password;
  try {
    password = checkPassword(body.newPassword);
  } catch (error) {
    if (error instanceof AdminUserInputError) return res.status(400).json({ error: error.message });
    throw error;
  }
  const denied = await confirmCurrentPassword(req, body.currentPassword);
  if (denied) return res.status(denied.status).json({ error: denied.error });

  await pool.query("UPDATE admin_users SET password_hash = $2 WHERE id = $1", [req.admin.userId, await sec.hashPassword(password)]);
  await pool.query("DELETE FROM admin_sessions WHERE user_id = $1 AND id <> $2", [req.admin.userId, req.admin.sessionId]);
  return res.status(204).end();
}

module.exports = { listUsers, createUser, deleteUser, changeOwnPassword };
