// Cópias da página de vendas em outros sites (aba Resumo do painel).
// O venda.js, quando roda num domínio que não é este, manda um aviso para /api/track/copia
// (ver controllers/track.controller.js). O domínio vem do cabeçalho Origin, que o navegador
// preenche sozinho: a página copiada não consegue escolher outro.
const pool = require("../config/database");

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const MAX_HOSTS = 500; // a lista não cresce sem limite se alguém mandar avisos falsos

// Serviços que mostram a página "por dentro" de outro endereço sem ser cópia: tradutor do Google
// e do Bing, cache do Google e o Arquivo da Internet. Também nunca contam o próprio computador.
const IGNORED = [/(^|\.)translate\.goog$/, /(^|\.)googleusercontent\.com$/, /(^|\.)archive\.org$/,
  /(^|\.)translatoruser\.net$/, /(^|\.)bing\.net$/, /^localhost$/, /^127\./, /^\d+\.\d+\.\d+\.\d+$/];

const bare = (host) => String(host || "").toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");

// Domínio da cópia a partir do Origin (ou do Referer, em navegadores que não mandam Origin).
// null: inválido, deste próprio site ou de um serviço da lista acima.
function copyHost(originHeader, ownHost) {
  if (typeof originHeader !== "string" || !originHeader || originHeader === "null") return null;
  let url;
  try { url = new URL(originHeader); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = bare(url.hostname);
  if (!HOST.test(host) || host.length > 100) return null;
  if (host === bare(ownHost)) return null;
  if (IGNORED.some((re) => re.test(host))) return null;
  return host;
}

// Corpo do aviso: { product: "<endereço da página copiada>", path: "<endereço na cópia>" }.
function parseReport(body) {
  const b = body && typeof body === "object" ? body : {};
  const slug = typeof b.product === "string" && SLUG.test(b.product) && b.product.length <= 200 ? b.product : null;
  const path = typeof b.path === "string" ? b.path.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300) || null : null;
  return { slug, path };
}

// Grava (ou soma mais uma visita). Domínio novo só entra enquanto a lista tem menos de MAX_HOSTS.
async function recordCopy(host, { slug, path }) {
  await pool.query(
    `INSERT INTO page_copies (host, product_slug, path)
       SELECT $1, $2, $3 WHERE (SELECT COUNT(*) FROM page_copies) < $4
     ON CONFLICT (host) DO UPDATE SET hits = page_copies.hits + 1, last_seen = CURRENT_TIMESTAMP,
       product_slug = COALESCE(EXCLUDED.product_slug, page_copies.product_slug),
       path = COALESCE(EXCLUDED.path, page_copies.path)`,
    [host, slug, path, MAX_HOSTS]);
}

// Lista do painel: as vistas mais recentemente primeiro, com o nome do produto quando existe.
async function listCopies() {
  const { rows } = await pool.query(
    `SELECT c.host, c.product_slug, p.title AS product_title, p.id AS product_id, c.path, c.hits,
            c.first_seen, c.last_seen
       FROM page_copies c LEFT JOIN products p ON p.slug = c.product_slug
      ORDER BY c.last_seen DESC LIMIT 100`);
  return rows;
}

async function removeCopy(host) {
  const { rowCount } = await pool.query("DELETE FROM page_copies WHERE host = $1", [host]);
  return rowCount > 0;
}

module.exports = { copyHost, parseReport, recordCopy, listCopies, removeCopy, HOST };
