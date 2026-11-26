// POST /api/track: página vista ou clique em "comprar" (enviado por public/js/track.js).
// Responde sempre 204 e nunca dá detalhes: quem manda lixo só não é contado.
const { isBot, parseEvent, recordEvent } = require("../lib/analytics");
const { createLimiter, parseCookies } = require("../lib/security");
const { findSession, COOKIE } = require("../middleware/admin-auth");
const { copyHost, parseReport, recordCopy } = require("../lib/page-copies");

// No máximo 120 eventos por minuto por IP (uma pessoa navegando manda poucos).
const limiter = createLimiter({ max: 120, windowMs: 60_000 });

async function track(req, res) {
  res.status(204).end();
  const ua = String(req.get("user-agent") || "").slice(0, 400);
  if (isBot(ua)) return;
  const ip = req.ip || "";
  if (limiter.isBlocked(ip)) return;
  limiter.hit(ip);
  const event = parseEvent(req.body, { ua, ownHost: req.get("host") });
  if (!event) return;
  try {
    // Quem está logado no painel (você testando o site) não entra na contagem.
    if (parseCookies(req.headers.cookie)[COOKIE] && (await findSession(req))) return;
    await recordEvent(event, { ip, ua });
  } catch (error) {
    console.error("Resumo: evento não gravado:", error.message);
  }
}

// POST /api/track/copia: o venda.js está rodando em outro domínio (página copiada). O domínio vem
// do Origin, preenchido pelo navegador; o corpo só diz qual página foi copiada. Responde sempre 204.
const copyLimiter = createLimiter({ max: 20, windowMs: 60_000 });

async function reportCopy(req, res) {
  res.status(204).end();
  const ua = String(req.get("user-agent") || "");
  if (isBot(ua)) return;
  const ip = req.ip || "";
  if (copyLimiter.isBlocked(ip)) return;
  copyLimiter.hit(ip);
  const host = copyHost(req.get("origin") || req.get("referer"), req.get("host"));
  if (!host) return;
  try {
    await recordCopy(host, parseReport(req.body));
  } catch (error) {
    console.error("Cópias: aviso não gravado:", error.message);
  }
}

module.exports = { track, reportCopy };
