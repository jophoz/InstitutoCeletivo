/* O "Comparativo" (dois lados) e o "Comparativo em tabela" viraram estilos do bloco "Comparação"
   (campo style: columns ou table), e o bloco "Lista ✓ / ✗" saiu: o conteúdo dele vira uma
   Comparação em dois lados. Converte o que já está gravado: rascunho e versão publicada das páginas
   e os blocos salvos (referências a eles na página só trocam o tipo; o registro de uso fica).
     comparison { ...campos } -> compare columns (os nomes dos campos não mudam)
     table      { ...campos } -> compare table
     checklist  { icon, eyebrow, title, intro, items: [{ text, positive }], background }
                -> compare columns { title, intro, background,
                     left_title: "O que não é",  left_items:  itens ✗ (na ordem em que estavam),
                     right_title: "O que é",     right_items: itens ✓ }
   O ícone e o rótulo (eyebrow) da lista saem: a Comparação não tem esses campos. */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const STYLES = { comparison: "columns", table: "table" };

// Lista ✓ / ✗ -> Comparação em dois lados (sem o tipo: serve para bloco na página e para bloco salvo).
function checklistFields({ icon: _icon, eyebrow: _eyebrow, items, ...rest }) {
  const list = (Array.isArray(items) ? items : []).filter(isObject);
  const side = (positive) => list.filter((x) => Boolean(x.positive) === positive).map((x) => ({ text: typeof x.text === "string" ? x.text : "" }));
  return {
    style: "columns", ...rest,
    left_title: "O que não é", left_items: side(false),
    right_title: "O que é", right_items: side(true),
  };
}

// Bloco (ou dados de bloco salvo, com o tipo junto) no formato novo; null se não muda.
function convert(block) {
  if (!isObject(block)) return null;
  const { type, ...rest } = block;
  const ref = Object.hasOwn(block, "shared"); // referência a bloco salvo: só o tipo muda
  if (type === "checklist") return ref ? { type: "compare", ...rest } : { type: "compare", ...checklistFields(rest) };
  if (!Object.hasOwn(STYLES, type)) return null;
  if (ref) return { type: "compare", ...rest };
  return { type: "compare", style: STYLES[type], ...rest };
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

  // Blocos salvos: mesmo ID, então as referências nas páginas e o registro de uso continuam valendo.
  const shared = await pgm.db.select("SELECT id, type, data FROM shared_blocks WHERE type IN ('comparison', 'table', 'checklist')");
  for (const row of shared) {
    const { type, ...data } = convert({ type: row.type, ...row.data });
    await pgm.db.query("UPDATE shared_blocks SET type = $2, data = $3::jsonb WHERE id = $1", [row.id, type, JSON.stringify(data)]);
  }
};

exports.down = false;
exports.convert = convert; // para os testes
exports.convertList = convertList;
