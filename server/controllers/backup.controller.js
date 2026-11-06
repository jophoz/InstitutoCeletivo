// Aba Backup do painel: baixar todo o conteúdo num arquivo e importar esse arquivo em outro site.
// Formato e regras em lib/backup.js. A importação chega em etapas (o navegador lê o arquivo):
//   1. POST /check            -> o banco é da mesma versão? quais imagens já existem?
//   2. POST /media/:id        -> uma imagem por requisição (não esbarra no limite do proxy)
//   3. POST /content          -> empresas, blocos salvos, produtos e páginas, numa transação
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const pool = require("../config/database");
const storage = require("../lib/storage");
const { detectType, makeVariants } = require("../lib/images");
const backup = require("../lib/backup");
const { syncPageMedia } = require("../sales/pages");
const { syncSharedBlockMedia } = require("./shared-block.controller");

const MAX_PIXELS = 40_000_000;

// Espera a conexão esvaziar o que já foi escrito (ou o navegador desistir do download).
function drained(res) {
  return new Promise((resolve) => {
    const done = () => { res.off("drain", done); res.off("close", done); resolve(); };
    res.on("drain", done);
    res.on("close", done);
  });
}

// GET /api/admin/backup: arquivo .json com tudo. As imagens vão uma a uma no fim (base64), sem
// montar o arquivo inteiro na memória. Uma imagem cujo arquivo sumiu do disco vai com file: null.
async function exportBackup(_req, res) {
  const head = { format: backup.FORMAT, version: backup.VERSION, exportedAt: new Date().toISOString(), schema: backup.schemaVersion() };
  for (const t of backup.TABLES) {
    const { rows } = await pool.query(`SELECT id, ${t.columns.join(", ")} FROM ${t.table} ORDER BY created_at, id`);
    head[t.key] = rows;
  }
  const { rows: media } = await pool.query(
    `SELECT id, storage_key, ${backup.MEDIA_COLUMNS.join(", ")} FROM media ORDER BY created_at, id`
  );
  head.counts = Object.fromEntries([...backup.TABLES.map((t) => [t.key, head[t.key].length]), ["media", media.length]]);

  const stamp = head.exportedAt.slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  res.set({ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="backup-site-${stamp}.json"` });
  res.write(`${JSON.stringify(head).slice(0, -1)},"media":[`);
  for (let i = 0; i < media.length; i++) {
    if (res.destroyed) return; // o navegador cancelou o download
    const { storage_key: key, ...meta } = media[i];
    let file = null;
    try {
      file = (await fs.readFile(path.join(storage.UPLOAD_DIR, key))).toString("base64");
    } catch (error) {
      console.error(`Backup: arquivo da imagem ${meta.id} não encontrado (${error.code}).`);
    }
    // Respeita o ritmo da conexão: espera o navegador receber antes de ler a próxima imagem.
    if (!res.write(`${i ? "," : ""}${JSON.stringify({ ...meta, file })}`)) await drained(res);
  }
  res.end("]}");
}

// POST /api/admin/backup/check { schema, mediaIds }
async function checkBackup(req, res) {
  const body = req.body || {};
  const ids = Array.isArray(body.mediaIds) ? body.mediaIds.filter((id) => typeof id === "string" && backup.UUID.test(id)) : [];
  const serverSchema = backup.schemaVersion();
  const { rows } = await pool.query("SELECT id FROM media WHERE id = ANY($1::uuid[])", [ids]);
  return res.json({ data: { schemaOk: body.schema === serverSchema, serverSchema, existing: rows.map((r) => r.id) } });
}

// POST /api/admin/backup/media/:id (corpo = WebP do backup; cabeçalho X-Media-Meta = JSON
// codificado com nome, texto alternativo e data). A imagem já foi tratada quando foi enviada no
// site de origem (WebP, até 1600 px, sem metadados); aqui só se confere que é um WebP legível.
async function importMedia(req, res) {
  const id = String(req.params.id).toLowerCase();
  if (!backup.UUID.test(id)) return res.status(400).json({ error: "ID de imagem inválido." });
  if (!Buffer.isBuffer(req.body) || detectType(req.body) !== "webp") {
    return res.status(415).json({ error: "A imagem do backup não é um WebP válido." });
  }
  let meta;
  try {
    meta = backup.validateMediaMeta(JSON.parse(decodeURIComponent(req.get("x-media-meta") || "")));
  } catch {
    return res.status(400).json({ error: "Dados da imagem inválidos." });
  }

  const exists = await pool.query("SELECT 1 FROM media WHERE id = $1", [id]);
  if (exists.rowCount) return res.json({ data: { id, skipped: true } });

  let info;
  try {
    info = await sharp(req.body, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
    if (info.format !== "webp" || !info.width || !info.height) throw new Error("formato");
  } catch {
    return res.status(400).json({ error: "Não foi possível ler esta imagem do backup." });
  }

  const key = await storage.save(req.body);
  let widths = [];
  try {
    const variants = await makeVariants(req.body, info.width);
    for (const v of variants) await storage.saveVariant(key, v.width, v.data);
    widths = variants.map((v) => v.width);
    const { rowCount } = await pool.query(
      `INSERT INTO media (id, storage_key, mime_type, size_bytes, width, height, original_name, alt_text, variants, created_at)
       VALUES ($1, $2, 'image/webp', $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING`,
      [id, key, req.body.length, info.width, info.height, meta.original_name, meta.alt_text, widths, meta.created_at]
    );
    if (!rowCount) { // outra aba importou a mesma imagem ao mesmo tempo
      await storage.remove(key, widths);
      return res.json({ data: { id, skipped: true } });
    }
    return res.status(201).json({ data: { id, skipped: false } });
  } catch (error) {
    await storage.remove(key, widths); // não deixa arquivo órfão no disco se o banco falhar
    throw error;
  }
}

// POST /api/admin/backup/content: grava empresas, blocos salvos, produtos e páginas numa só
// transação (ou tudo, ou nada) e recalcula quais imagens e blocos cada um usa.
async function importContent(req, res) {
  let data;
  try {
    data = backup.validateContent(req.body);
    if (req.body.schema !== backup.schemaVersion()) {
      throw new backup.BackupError("O arquivo é de outra versão do site. Atualize os dois sites para a mesma versão antes de importar.");
    }
  } catch (error) {
    if (error instanceof backup.BackupError) return res.status(400).json({ error: error.message });
    throw error;
  }

  const client = await pool.connect();
  let broken; // ROLLBACK falhou (conexão caiu): o cliente é descartado em vez de voltar ao pool
  try {
    await client.query("BEGIN");
    // Só pode haver uma empresa padrão: a do arquivo substitui a deste site.
    const def = data.brands.find((b) => b.is_default === true);
    if (def) await client.query("UPDATE brands SET is_default = false WHERE is_default AND id <> $1", [def.id]);

    const counts = {};
    for (const t of backup.TABLES) {
      counts[t.key] = { created: 0, updated: 0 };
      for (const row of data[t.key]) {
        const q = backup.upsertQuery(t, row);
        const { rows } = await client.query(`${q.text} RETURNING (xmax = 0) AS created`, q.values);
        counts[t.key][rows[0].created ? "created" : "updated"]++;
      }
    }
    for (const b of data.sharedBlocks) await syncSharedBlockMedia(client, b.id, b.type, b.data);
    for (const p of data.salesPages) await syncPageMedia(client, p.id);
    await client.query("COMMIT");
    return res.json({ data: { counts } });
  } catch (error) {
    await client.query("ROLLBACK").catch((rollbackError) => { broken = rollbackError; }); // mantém o erro original
    const message = backup.describeDbError(error);
    if (message) return res.status(409).json({ error: message });
    throw error;
  } finally {
    client.release(broken);
  }
}

module.exports = { exportBackup, checkBackup, importMedia, importContent };
