/* O bloco "Público-alvo" saiu: era igual à grade de tópicos. Vira a "Apresentação" no estilo grade.
   Converte o que já está gravado: rascunho e versão publicada das páginas e os blocos salvos
   (referências a eles na página só trocam o tipo).
     audience { eyebrow, title, intro, items, columns, background } -> presentation grid
     item     { icon, text, description }                          -> { icon, title: text, text: description }
   O rótulo (eyebrow) sai, como nos outros estilos da Apresentação; a descrição (intro) passa a
   aparecer no fim da seção. */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const convertItem = (item) => {
  if (!isObject(item)) return item;
  const { text, description, ...rest } = item;
  return { ...rest, title: text || "", text: description || "" };
};

// Bloco (ou dados de bloco salvo, com o tipo junto) no formato novo; null se não muda.
function convert(block) {
  if (!isObject(block) || block.type !== "audience") return null;
  const { type: _old, ...rest } = block;
  if (Object.hasOwn(block, "shared")) return { type: "presentation", ...rest }; // referência: só o tipo muda
  const { eyebrow: _gone, items, ...fields } = rest;
  return { type: "presentation", style: "grid", ...fields, items: Array.isArray(items) ? items.map(convertItem) : [] };
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

  const shared = await pgm.db.select("SELECT id, type, data FROM shared_blocks WHERE type = 'audience'");
  for (const row of shared) {
    const { type, ...data } = convert({ type: row.type, ...row.data });
    await pgm.db.query("UPDATE shared_blocks SET type = $2, data = $3::jsonb WHERE id = $1", [row.id, type, JSON.stringify(data)]);
  }
};

exports.down = false;
exports.convert = convert; // para os testes
exports.convertList = convertList;
