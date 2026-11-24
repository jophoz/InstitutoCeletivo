// Executa fn(client) numa transação: COMMIT se der certo, ROLLBACK e o erro original se falhar.
// Se o próprio ROLLBACK falhar (conexão caiu), o cliente é descartado em vez de voltar ao pool.
// fn pode devolver { rollback: true, result } para desfazer sem erro (ex.: registro não existe).
const pool = require("../config/database");

const ROLLBACK = Symbol("rollback");

async function withTransaction(fn) {
  const client = await pool.connect();
  let broken;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    if (result && result[ROLLBACK]) {
      await client.query("ROLLBACK");
      return result.value;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch((rollbackError) => { broken = rollbackError; }); // mantém o erro original
    throw error;
  } finally {
    client.release(broken);
  }
}

// Desfaz a transação e faz withTransaction devolver "value".
const rollbackWith = (value) => ({ [ROLLBACK]: true, value });

module.exports = { withTransaction, rollbackWith };
