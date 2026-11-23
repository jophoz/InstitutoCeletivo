/* O bloco "Currículo (módulos)" virou o estilo "Módulos" do bloco "Apresentação". Converte o que já
   está gravado: rascunho e versão publicada das páginas e os blocos salvos (referências a eles na
   página só trocam o tipo).
     curriculum { eyebrow, title, intro, items, background } -> presentation modules
   O rótulo (eyebrow) sai, como nos outros estilos da Apresentação; a descrição (intro) passa a
   aparecer no fim da seção. Os módulos usam os campos dos itens da Apresentação:
     { title, meta, topics } -> { title, callout: meta, text: topics }
   Também acerta Apresentações em módulos que ainda tenham meta/topics (formato de transição). */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Item de módulo nos campos da Apresentação; null se já está no formato novo.
function convertItem(item) {
  if (!isObject(item) || !(Object.hasOwn(item, "meta") || Object.hasOwn(item, "topics"))) return null;
  const { meta, topics, ...rest } = item;
  return { ...rest, callout: rest.callout || meta || "", text: rest.text || topics || "" };
}

function convertItems(items) {
  if (!Array.isArray(items)) return null;
  let changed = false;
  const out = items.map((x) => {
    const next = convertItem(x);
    if (next) changed = true;
    return next || x;
  });
  return changed ? out : null;
}

// Bloco (ou dados de bloco salvo, com o tipo junto) no formato novo; null se não muda.
function convert(block) {
  if (!isObject(block)) return null;
  if (block.type === "curriculum") {
    const { type: _old, ...rest } = block;
    if (Object.hasOwn(block, "shared")) return { type: "presentation", ...rest }; // referência: só o tipo muda
    const { eyebrow: _gone, ...fields } = rest;
    return { type: "presentation", style: "modules", ...fields, items: convertItems(fields.items) || fields.items || [] };
  }
  if (block.type === "presentation" && !Object.hasOwn(block, "shared")) {
    const items = convertItems(block.items);
    return items ? { ...block, items } : null;
  }
  return null;
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

  const shared = await pgm.db.select("SELECT id, type, data FROM shared_blocks WHERE type IN ('curriculum', 'presentation')");
  for (const row of shared) {
    const next = convert({ type: row.type, ...row.data });
    if (!next) continue;
    const { type, ...data } = next;
    await pgm.db.query("UPDATE shared_blocks SET type = $2, data = $3::jsonb WHERE id = $1", [row.id, type, JSON.stringify(data)]);
  }
};

exports.down = false;
exports.convert = convert; // para os testes
exports.convertList = convertList;
