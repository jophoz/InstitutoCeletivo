/* Os blocos "Galeria (carrossel)" e "Texto e imagem" viraram estilos do bloco "Demonstração"
   (campo style: carousel, tabs ou rows). Converte o que já está gravado: rascunho e versão
   publicada das páginas e os blocos salvos (referências a eles na página só trocam o tipo).
     gallery { images: [{ image, title, topics }] }        -> demo carousel { items: [{ image, title, bullets }] }
     demo    { items: [{ label, image, caption }] }        -> demo tabs     { items: [{ label, image, text }] }
     feature { items: [{ eyebrow, title, text, bullets, image }] } -> demo rows (mesmos itens)
   Sem volta: depois de editar no estilo novo, não há como separar de novo os tipos. */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const renameIn = (items, from, to) => (Array.isArray(items)
  ? items.map((x) => {
    if (!isObject(x) || !Object.hasOwn(x, from)) return x;
    const { [from]: value, ...rest } = x;
    return { ...rest, [to]: value };
  })
  : items);

// Bloco (ou dados de bloco salvo, com o tipo junto) no formato novo; null se não muda.
function convert(block) {
  if (!isObject(block)) return null;
  const { type, ...rest } = block;
  const ref = Object.hasOwn(block, "shared"); // referência a bloco salvo: só o tipo muda
  if (type === "gallery") {
    if (ref) return { type: "demo", ...rest };
    const { images, ...fields } = rest;
    return { type: "demo", style: "carousel", ...fields, items: renameIn(images, "topics", "bullets") };
  }
  if (type === "feature") return ref ? { type: "demo", ...rest } : { type: "demo", style: "rows", ...rest };
  if (type === "demo" && !ref && !Object.hasOwn(block, "style")) {
    return { type: "demo", style: "tabs", ...rest, items: renameIn(rest.items, "caption", "text") };
  }
  return null;
}

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

  const shared = await pgm.db.select("SELECT id, type, data FROM shared_blocks WHERE type IN ('gallery', 'feature', 'demo')");
  for (const row of shared) {
    const next = convert({ type: row.type, ...row.data });
    if (!next) continue;
    const { type, ...data } = next;
    await pgm.db.query("UPDATE shared_blocks SET type = $2, data = $3::jsonb WHERE id = $1", [row.id, type, JSON.stringify(data)]);
  }
};

exports.down = false;
exports.convert = convert; // para os testes
