/* O "Comparativo" (dois lados) e o "Comparativo em tabela" viraram estilos do bloco "Comparação"
   (campo style: columns ou table), e o bloco "Lista ✓ / ✗" saiu. Converte o que já está gravado:
   rascunho e versão publicada das páginas e os blocos salvos (referências a eles na página só
   trocam o tipo).
     comparison { ...campos } -> compare columns (os nomes dos campos não mudam)
     table      { ...campos } -> compare table
     checklist                -> removido das páginas; blocos salvos do tipo são apagados
   Sem volta: as listas apagadas não voltam. */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const STYLES = { comparison: "columns", table: "table" };

// Bloco (ou dados de bloco salvo, com o tipo junto) no formato novo; null se não muda.
function convert(block) {
  if (!isObject(block) || !Object.hasOwn(STYLES, block.type)) return null;
  const { type, ...rest } = block;
  if (Object.hasOwn(block, "shared")) return { type: "compare", ...rest }; // referência: só o tipo muda
  return { type: "compare", style: STYLES[type], ...rest };
}

const isChecklist = (b) => isObject(b) && b.type === "checklist";

// Lista de blocos no formato novo (sem as listas ✓ / ✗); null se nada muda.
function convertList(sections) {
  if (!Array.isArray(sections)) return null;
  let changed = false;
  const out = [];
  for (const b of sections) {
    if (isChecklist(b)) { changed = true; continue; }
    const next = convert(b);
    if (next) changed = true;
    out.push(next || b);
  }
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

  // Listas salvas: as referências já saíram das páginas acima; o registro de uso vai junto.
  await pgm.db.query(`DELETE FROM sales_page_shared_blocks
    WHERE shared_block_id IN (SELECT id FROM shared_blocks WHERE type = 'checklist')`);
  await pgm.db.query("DELETE FROM shared_blocks WHERE type = 'checklist'");

  const shared = await pgm.db.select("SELECT id, type, data FROM shared_blocks WHERE type IN ('comparison', 'table')");
  for (const row of shared) {
    const { type, ...data } = convert({ type: row.type, ...row.data });
    await pgm.db.query("UPDATE shared_blocks SET type = $2, data = $3::jsonb WHERE id = $1", [row.id, type, JSON.stringify(data)]);
  }
};

exports.down = false;
exports.convert = convert; // para os testes
exports.convertList = convertList;
