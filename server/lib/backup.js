// Backup do conteúdo pelo painel (aba Backup): um arquivo .json com empresas, blocos salvos,
// produtos, páginas de vendas e imagens, para levar o conteúdo de um site para outro (ex.: do PC
// para o servidor) sem acesso ao terminal do servidor.
//
// O que NÃO entra: usuários do painel, contas da Kiwify (a chave secreta é criptografada com a
// KIWIFY_ENCRYPTION_KEY de cada servidor e não abriria em outro), visitas e vendas do Resumo.
// As tabelas de ligação (sales_page_media etc.) também não: são recalculadas ao importar.
//
// Os IDs são mantidos: as páginas guardam IDs de imagens e de blocos salvos dentro de "sections".
// Importar = inserir ou atualizar pelo ID; nada que exista só no destino é apagado.
const fs = require("node:fs");
const path = require("node:path");

const FORMAT = "vitrine-backup";
const VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Colunas de cada tabela que vão no arquivo (além de "id"), na ordem de gravação: cada tabela só
// aponta para as anteriores (produto -> empresa; página -> produto). As colunas JSONB são
// gravadas com JSON.stringify (o driver transformaria uma lista JS em array do Postgres).
const TABLES = [
  { key: "brands", table: "brands", columns: ["name", "logo_id", "icon_id", "is_default", "created_at", "updated_at"] },
  { key: "sharedBlocks", table: "shared_blocks", columns: ["type", "name", "data", "created_at", "updated_at"], json: ["data"] },
  {
    key: "products", table: "products",
    // format e workload ainda existem na tabela, mas o site não usa mais: ficam fora do arquivo.
    columns: ["title", "slug", "short_description", "status", "category", "featured",
      "price_cents", "checkout_url", "image_id", "brand_id", "area", "card_badge",
      "kiwify_product_id", "kiwify_link_id", "offer_kiwify_link_id", "offer_price_cents", "offer_checkout_url",
      "offer_ends_at", "offer_compare_cents", "special_kiwify_product_id", "special_kiwify_link_id", "special_price_cents",
      "special_checkout_url", "special_compare_cents", "created_at", "updated_at"],
  },
  {
    key: "salesPages", table: "sales_pages",
    columns: ["product_id", "sections", "theme", "published_sections", "published_theme", "published_at", "created_at", "updated_at"],
    json: ["sections", "theme", "published_sections", "published_theme"],
  },
];
const MEDIA_COLUMNS = ["width", "height", "original_name", "alt_text", "created_at"];

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

// Versão do banco = nome da última migration do código (o app não lê a tabela pgmigrations: o
// usuário do banco do app não tem acesso a ela). O deploy roda as migrations antes do app subir.
// As migrations vêm com o código e não mudam com o app rodando: a pasta é lida uma vez só.
let ownSchema;
function schemaVersion(dir = MIGRATIONS_DIR) {
  if (dir === MIGRATIONS_DIR && ownSchema !== undefined) return ownSchema;
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.js$/.test(f)).sort();
  const version = files.length ? files[files.length - 1].replace(/\.js$/, "") : null;
  if (dir === MIGRATIONS_DIR) ownSchema = version;
  return version;
}

class BackupError extends Error {}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Confere o "envelope" do arquivo e cada registro. Devolve as listas por tabela; lança
// BackupError com mensagem para o painel. Tipos e regras finas ficam com o banco (constraints).
function validateContent(body) {
  if (!isPlainObject(body)) throw new BackupError("Envie um objeto JSON.");
  if (body.format !== FORMAT) throw new BackupError("Este arquivo não é um backup do painel.");
  if (body.version !== VERSION) throw new BackupError(`Versão de backup não suportada (${body.version}).`);
  const out = {};
  for (const t of TABLES) {
    const list = body[t.key] ?? [];
    if (!Array.isArray(list)) throw new BackupError(`"${t.key}" deve ser uma lista.`);
    const seen = new Set();
    out[t.key] = list.map((rec, i) => {
      const row = pickRow(rec, t.columns, `${t.key}[${i}]`);
      if (seen.has(row.id)) throw new BackupError(`${t.key}[${i}]: ID repetido.`);
      seen.add(row.id);
      return row;
    });
  }
  if (out.brands.filter((b) => b.is_default === true).length > 1) {
    throw new BackupError("O arquivo tem mais de uma empresa padrão.");
  }
  return out;
}

// Registro com id + exatamente as colunas esperadas (coluna faltando gravaria NULL por engano).
function pickRow(rec, columns, label) {
  if (!isPlainObject(rec)) throw new BackupError(`${label}: registro inválido.`);
  if (typeof rec.id !== "string" || !UUID.test(rec.id)) throw new BackupError(`${label}: ID inválido.`);
  const missing = columns.filter((c) => !Object.hasOwn(rec, c));
  if (missing.length) throw new BackupError(`${label}: faltam os campos ${missing.join(", ")}.`);
  const row = { id: rec.id.toLowerCase() };
  for (const c of columns) row[c] = rec[c];
  return row;
}

// Dados de uma imagem enviada na importação (vêm no cabeçalho X-Media-Meta, em JSON).
function validateMediaMeta(meta) {
  if (!isPlainObject(meta)) throw new BackupError("Dados da imagem inválidos.");
  const str = (v, max) => (v === null || v === undefined ? null : typeof v === "string" ? v.slice(0, max) : undefined);
  const out = { original_name: str(meta.original_name, 255), alt_text: str(meta.alt_text, 300) };
  if (out.original_name === undefined || out.alt_text === undefined) throw new BackupError("Dados da imagem inválidos.");
  out.created_at = typeof meta.created_at === "string" && !Number.isNaN(Date.parse(meta.created_at)) ? meta.created_at : null;
  return out;
}

// INSERT ... ON CONFLICT (id) DO UPDATE para uma tabela de TABLES. Devolve { text, values }.
function upsertQuery(t, row) {
  const cols = ["id", ...t.columns];
  const json = new Set(t.json || []);
  const values = cols.map((c) => (json.has(c) && row[c] !== null ? JSON.stringify(row[c]) : row[c]));
  const params = cols.map((_c, i) => `$${i + 1}`).join(", ");
  const sets = t.columns.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  return {
    text: `INSERT INTO ${t.table} (${cols.join(", ")}) VALUES (${params}) ON CONFLICT (id) DO UPDATE SET ${sets}`,
    values,
  };
}

// Mensagem do painel para erros do banco durante a importação do conteúdo.
function describeDbError(error) {
  const known = {
    products_slug_key: "Já existe neste site outro produto com o mesmo endereço (slug) de um produto do arquivo. Mude o endereço de um deles e importe de novo.",
    sales_pages_product_id_key: "Um produto do arquivo já tem neste site outra página de vendas. Importe de novo depois de conferir o produto.",
    brands_one_default: "O arquivo e este site têm empresas padrão diferentes ao mesmo tempo.",
  };
  if (known[error.constraint]) return known[error.constraint];
  if (error.code === "23503") return "O arquivo usa uma imagem, empresa ou produto que não chegou a ser importado. Importe o arquivo de novo.";
  if (/^2[23]/.test(error.code || "")) return `Dados inválidos no arquivo (${error.constraint || error.message}).`;
  return null;
}

module.exports = {
  FORMAT, VERSION, UUID, TABLES, MEDIA_COLUMNS, BackupError,
  schemaVersion, validateContent, validateMediaMeta, upsertQuery, describeDbError,
};
