/* A "Faixa de urgência" e a "Contagem regressiva" viraram estilos do bloco "Cronômetro" (campo
   style: bar ou countdown). Converte o que já está gravado: rascunho e versão publicada das páginas
   e os blocos salvos (referências a eles na página só trocam o tipo).
     urgency   { text }                   -> timer bar (os nomes dos campos não mudam)
     countdown { title, text, cta_label } -> timer countdown */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const STYLES = { urgency: "bar", countdown: "countdown" };

// Bloco (ou dados de bloco salvo, com o tipo junto) no formato novo; null se não muda.
function convert(block) {
  if (!isObject(block) || !Object.hasOwn(STYLES, block.type)) return null;
  const { type, ...rest } = block;
  if (Object.hasOwn(block, "shared")) return { type: "timer", ...rest }; // referência: só o tipo muda
  return { type: "timer", style: STYLES[type], ...rest };
}

// Lista de blocos no formato novo; null se nada muda.
function convertList(sections) {
  if (!Array.isArray(sections)) return null;
  let changed = false;
  const out = sections.map((b) => {
    const next = convert(b);
    if (next) changed = true;
    return next || b;
  });
  return changed ? out : null;
}

exports.up = async (pgm) => {
  const pages = await pgm.db.select("SELECT id, sections, published_sections FROM sales_pages");
  for (const page of pages) {
    const sections = convertList(page.sections);
    const published = convertList(page.published_sections);
    if (!sections && !published) continue;
    const pub = published || page.published_sections; // null: página nunca publicada
    await pgm.db.query(
      "UPDATE sales_pages SET sections = $2::jsonb, published_sections = $3::jsonb WHERE id = $1",
      [page.id, JSON.stringify(sections || page.sections), pub === null ? null : JSON.stringify(pub)]);
  }

  const shared = await pgm.db.select("SELECT id, type, data FROM shared_blocks WHERE type IN ('urgency', 'countdown')");
  for (const row of shared) {
    const { type, ...data } = convert({ type: row.type, ...row.data });
    await pgm.db.query("UPDATE shared_blocks SET type = $2, data = $3::jsonb WHERE id = $1", [row.id, type, JSON.stringify(data)]);
  }
};

exports.down = false;
exports.convert = convert; // para os testes
exports.convertList = convertList;
