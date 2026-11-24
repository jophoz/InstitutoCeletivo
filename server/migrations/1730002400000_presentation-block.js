/* Os blocos "Cartões de benefícios" e "Grade de tópicos" viraram estilos do bloco "Apresentação"
   (campo style: cards, grid ou timeline). Converte o que já está gravado: rascunho e versão
   publicada das páginas e os blocos salvos (referências a eles na página só trocam o tipo).
     benefits { title, items }          -> presentation cards (o título era só para leitores de tela: sai)
     topics   { layout, ...campos }     -> presentation grid ou timeline (o layout vira o estilo)
   O "Comparativo" (comparison) não é mais apagado aqui: virou um estilo do bloco "Comparação"
   (ver 1730002500000_compare-block). */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Bloco (ou dados de bloco salvo, com o tipo junto) no formato novo; null se não muda.
function convert(block) {
  if (!isObject(block)) return null;
  const { type, ...rest } = block;
  const ref = Object.hasOwn(block, "shared"); // referência a bloco salvo: só o tipo muda
  if (type === "benefits") {
    if (ref) return { type: "presentation", ...rest };
    const { title: _srOnly, ...fields } = rest;
    return { type: "presentation", style: "cards", ...fields };
  }
  if (type === "topics") {
    if (ref) return { type: "presentation", ...rest };
    const { layout, ...fields } = rest;
    return { type: "presentation", style: layout === "timeline" ? "timeline" : "grid", ...fields };
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

  const shared = await pgm.db.select("SELECT id, type, data FROM shared_blocks WHERE type IN ('benefits', 'topics')");
  for (const row of shared) {
    const { type, ...data } = convert({ type: row.type, ...row.data });
    await pgm.db.query("UPDATE shared_blocks SET type = $2, data = $3::jsonb WHERE id = $1", [row.id, type, JSON.stringify(data)]);
  }
};

exports.down = false;
exports.convert = convert; // para os testes
exports.convertList = convertList;
