const pool = require("../config/database");
const storage = require("../lib/storage");
const { normalizeCategory } = require("../lib/categories");
const { AREAS, normalizeArea } = require("../lib/areas");
const kiwify = require("../lib/kiwify");
const { fetchCheckout, fetchOffer, joinWarnings, syncProduct, errorText } = require("../lib/kiwify-sync");
const { effectiveOffer } = require("../lib/offer");
const { isUuid } = require("../lib/ids");

// Colunas do produto (alias "p") + dados da capa (alias "m") e da empresa (alias "b", aba Empresas)
// com o logo dela (alias "bl"). brand_name / brand_logo_id / brand_logo mantêm os nomes de quando
// ficavam no próprio produto: o site e a página de vendas leem esses campos.
const COLUMNS = `p.id, p.title, p.slug, p.short_description, p.status, p.category, p.area, p.featured, p.card_badge,
  p.price_cents, p.checkout_url, p.image_id, p.brand_id,
  b.name AS brand_name, b.logo_id AS brand_logo_id,
  p.created_at, p.updated_at,
  CASE WHEN m.id IS NULL THEN NULL ELSE json_build_object(
    'id', m.id, 'storage_key', m.storage_key, 'alt_text', m.alt_text,
    'width', m.width, 'height', m.height, 'variants', m.variants) END AS image,
  CASE WHEN bl.id IS NULL THEN NULL ELSE json_build_object(
    'id', bl.id, 'storage_key', bl.storage_key, 'alt_text', bl.alt_text,
    'width', bl.width, 'height', bl.height) END AS brand_logo`;

// "source" é a tabela products ou um CTE com o resultado de um INSERT/UPDATE.
const selectFrom = (source, extra = "") => `SELECT ${COLUMNS}${extra} FROM ${source} p
  LEFT JOIN media m ON m.id = p.image_id
  LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN media bl ON bl.id = b.logo_id`;

// Só no painel: vínculo com a Kiwify e situação da última atualização automática.
const ADMIN_EXTRA = `,
  p.kiwify_product_id, p.kiwify_link_id, p.kiwify_synced_at, p.kiwify_sync_error,
  p.offer_kiwify_link_id, p.offer_price_cents, p.offer_checkout_url, p.offer_ends_at, p.offer_compare_cents,
  p.special_kiwify_product_id, p.special_kiwify_link_id, p.special_price_cents, p.special_checkout_url,
  p.special_compare_cents`;

// Site público: o produto tem página de vendas PUBLICADA? (o catálogo leva direto para /p/endereco)
// Também traz a oferta, que publicResponse troca pelo preço e link que valem agora.
const HAS_SALES_PAGE = `,
  EXISTS (SELECT 1 FROM sales_pages sp WHERE sp.product_id = p.id AND sp.published_sections IS NOT NULL) AS has_sales_page,
  p.offer_price_cents, p.offer_checkout_url, p.offer_ends_at, p.offer_compare_cents`;

// Troca a chave interna do arquivo pela URL pública (capa e logo da marca). A capa também leva o
// srcset (versões menores, ver lib/images.js) para os cards do catálogo.
function toResponse(row) {
  for (const field of ["image", "brand_logo"]) {
    if (!row[field]) continue;
    const { storage_key: key, variants, ...image } = row[field];
    row[field] = { ...image, url: storage.publicUrl(key) };
    if (field === "image") row[field].srcset = storage.srcset(key, image.width, variants);
  }
  return row;
}

// Site público: preço e link que valem agora (oferta ou normal) + compare_price_cents (o "de") e
// offer_ends_at. O link promocional nunca sai daqui depois que a oferta acaba.
function publicResponse(row) {
  const offer = effectiveOffer(row);
  const { offer_price_cents: _p, offer_checkout_url: _u, offer_ends_at: _e, offer_compare_cents: _c, ...rest } = toResponse(row);
  return { ...rest, price_cents: offer.price_cents, checkout_url: offer.checkout_url,
    compare_price_cents: offer.compare_cents, offer_ends_at: offer.ends_at };
}

const STATUSES = ["draft", "published", "archived"];
// Selo do cartão no catálogo: "Acesso imediato", "Última chance" (vermelho), "Novidade" (dourado) ou nenhum.
const CARD_BADGES = ["available", "last_chance", "new", "none"];
const MAX_PRICE_CENTS = 100_000_000; // R$ 1.000.000,00

// Textos opcionais: campo -> tamanho máximo. Vazio vira null (o site oculta campos nulos).
const OPTIONAL_TEXT = {
  short_description: 500, // cards do catálogo e descrição no Google / prévia do link
};

// Referências: capa (biblioteca de imagens) e empresa (null = marca do site). A existência é
// conferida pelo banco (chave estrangeira).
const IMAGE_FIELDS = ["image_id", "brand_id"];

// Vínculo com a Kiwify: produto e link de checkout, sempre os dois juntos (ou os dois null).
const KIWIFY_FIELDS = ["kiwify_product_id", "kiwify_link_id"];

// Oferta (preço "de/por" e prazo): com Kiwify, o preço e o link vêm do link promocional
// (offer_kiwify_link_id); sem Kiwify, são digitados.
// Promoção sem link (offer_compare_cents): só o valor "de", maior que o preço normal; o cliente paga
// o preço normal pelo link normal. É um tipo ou outro: com o "de", sem link nem preço promocional.
const OFFER_FIELDS = ["offer_price_cents", "offer_checkout_url", "offer_kiwify_link_id", "offer_ends_at", "offer_compare_cents"];

// Melhor opção (segunda opção de compra; estilo Oferta dupla da Oferta final): com Kiwify, preço e link vêm de um link
// da conta da empresa (do mesmo produto ou de outro); sem Kiwify, são digitados. O valor "de"
// (special_compare_cents) é sempre digitado.
const SPECIAL_FIELDS = ["special_price_cents", "special_checkout_url", "special_compare_cents",
  "special_kiwify_product_id", "special_kiwify_link_id"];

const FIELDS = new Set([
  "title", "slug", "status", "category", "area", "featured", "card_badge", "price_cents", "checkout_url",
  ...IMAGE_FIELDS, ...Object.keys(OPTIONAL_TEXT), ...KIWIFY_FIELDS, ...OFFER_FIELDS, ...SPECIAL_FIELDS,
]);

const PRICE_ERROR = "deve ser um valor inteiro em centavos, entre 0 e 100000000, ou null.";
const isPrice = (value) => value === null || (Number.isInteger(value) && value >= 0 && value <= MAX_PRICE_CENTS);

// Link https:// (vazio -> null). Devolve { value } ou { error }.
function checkoutUrlInput(value, field) {
  if (value !== null && typeof value !== "string") return { error: `${field} deve ser texto ou null.` };
  const raw = value?.trim() || null;
  if (!raw) return { value: null };
  const url = parseHttpsUrl(raw);
  if (!url || url.length > 2048) {
    const name = { checkout_url: "de checkout", offer_checkout_url: "da oferta", special_checkout_url: "da Melhor opção" }[field];
    return { error: `O link ${name} deve ser um endereço https:// válido.` };
  }
  return { value: url };
}

function normalizeProductInput(body, isCreate = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "O corpo da requisição deve ser um objeto JSON." };
  }

  const keys = Object.keys(body);
  const unknown = keys.filter((key) => !FIELDS.has(key));
  if (unknown.length) return { error: `Campo(s) não suportado(s): ${unknown.join(", ")}` };
  if (!isCreate && !keys.length) return { error: "Informe ao menos um campo para atualizar." };
  if (isCreate && (!("title" in body) || !("slug" in body))) {
    return { error: "Título e endereço (slug) são obrigatórios." };
  }

  const values = {};

  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 180) return { error: "O título deve ter entre 1 e 180 caracteres." };
    values.title = title;
  }

  if ("slug" in body) {
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) {
      return { error: "O endereço (slug) deve usar letras minúsculas, números e hifens simples." };
    }
    values.slug = slug;
  }

  if ("status" in body) {
    if (!STATUSES.includes(body.status)) return { error: "Situação inválida." };
    values.status = body.status;
  }

  for (const [field, max] of Object.entries(OPTIONAL_TEXT)) {
    if (!(field in body)) continue;
    if (body[field] !== null && typeof body[field] !== "string") {
      return { error: `${field} deve ser texto ou null.` };
    }
    const text = body[field]?.trim() || null;
    if (text && text.length > max) return { error: `${field} deve ter no máximo ${max} caracteres.` };
    values[field] = text;
  }

  // Categoria: uma da lista fixa (lib/categories.js) ou null.
  if ("category" in body) {
    const { value, error } = normalizeCategory(body.category);
    if (error) return { error };
    values.category = value;
  }

  // Área de conhecimento: uma da lista fixa (lib/areas.js) ou null.
  if ("area" in body) {
    const { value, error } = normalizeArea(body.area);
    if (error) return { error };
    values.area = value;
  }

  if ("featured" in body) {
    if (typeof body.featured !== "boolean") return { error: "featured deve ser true ou false." };
    values.featured = body.featured;
  }

  if ("card_badge" in body) {
    if (!CARD_BADGES.includes(body.card_badge)) return { error: `card_badge deve ser ${CARD_BADGES.join(", ")}.` };
    values.card_badge = body.card_badge;
  }

  if ("price_cents" in body) {
    if (!isPrice(body.price_cents)) return { error: `O preço ${PRICE_ERROR}` };
    values.price_cents = body.price_cents;
  }
  if ("offer_price_cents" in body) {
    if (!isPrice(body.offer_price_cents)) return { error: `O preço da oferta ${PRICE_ERROR}` };
    values.offer_price_cents = body.offer_price_cents;
  }
  if ("offer_compare_cents" in body) {
    if (!isPrice(body.offer_compare_cents)) return { error: `O valor "de" da promoção ${PRICE_ERROR}` };
    values.offer_compare_cents = body.offer_compare_cents;
  }
  if (values.offer_compare_cents != null && (values.offer_price_cents != null || body.offer_checkout_url || body.offer_kiwify_link_id)) {
    return { error: "A promoção é com link promocional ou só com o valor \"de\": escolha um dos dois." };
  }
  for (const [field, name] of [["special_price_cents", "O preço da Melhor opção"], ["special_compare_cents", "O valor \"de\" da Melhor opção"]]) {
    if (!(field in body)) continue;
    if (!isPrice(body[field])) return { error: `${name} ${PRICE_ERROR}` };
    values[field] = body[field];
  }

  for (const field of ["checkout_url", "offer_checkout_url", "special_checkout_url"]) {
    if (!(field in body)) continue;
    const { value, error } = checkoutUrlInput(body[field], field);
    if (error) return { error };
    values[field] = value;
  }
  if (("offer_price_cents" in values || "offer_checkout_url" in values)
    && ((values.offer_price_cents ?? null) === null) !== ((values.offer_checkout_url ?? null) === null)) {
    return { error: "Informe o preço e o link da oferta juntos (ou deixe os dois vazios)." };
  }
  if (("special_price_cents" in values || "special_checkout_url" in values)
    && ((values.special_price_cents ?? null) === null) !== ((values.special_checkout_url ?? null) === null)) {
    return { error: "Informe o preço e o link da Melhor opção juntos (ou deixe os dois vazios)." };
  }

  // Link da Melhor opção na Kiwify: produto e link sempre juntos (ou os dois null).
  if ("special_kiwify_product_id" in body || "special_kiwify_link_id" in body) {
    const productId = body.special_kiwify_product_id ?? null, linkId = body.special_kiwify_link_id ?? null;
    if ((productId !== null || linkId !== null) && !(kiwify.isId(productId) && kiwify.isId(linkId))) {
      return { error: "Escolha o produto e o link da Melhor opção na Kiwify (ou nenhum dos dois)." };
    }
    values.special_kiwify_product_id = productId;
    values.special_kiwify_link_id = linkId;
  }

  if ("offer_kiwify_link_id" in body) {
    if (body.offer_kiwify_link_id !== null && !kiwify.isId(body.offer_kiwify_link_id)) {
      return { error: "Link promocional da Kiwify inválido." };
    }
    values.offer_kiwify_link_id = body.offer_kiwify_link_id;
  }

  // Fim da oferta: data e hora em ISO 8601 (com fuso), ou null para oferta sem prazo.
  if ("offer_ends_at" in body) {
    const raw = body.offer_ends_at;
    const date = typeof raw === "string" && raw.length <= 40 ? new Date(raw) : null;
    const valid = date && Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100;
    if (raw !== null && !valid) return { error: "Data de fim da oferta inválida." };
    values.offer_ends_at = raw === null ? null : date;
  }

  // A existência da imagem é conferida pelo banco (chave estrangeira); aqui só o formato.
  for (const field of IMAGE_FIELDS) {
    if (!(field in body)) continue;
    if (body[field] !== null && !isValidId(body[field])) return { error: `${field} inválido.` };
    values[field] = body[field];
  }

  if (KIWIFY_FIELDS.some((field) => field in body)) {
    const [productId, linkId] = KIWIFY_FIELDS.map((field) => body[field] ?? null);
    const linked = productId !== null || linkId !== null;
    if (linked && !(kiwify.isId(productId) && kiwify.isId(linkId))) {
      return { error: "Escolha o produto e o link de checkout da Kiwify (ou desfaça o vínculo)." };
    }
    values.kiwify_product_id = productId;
    values.kiwify_link_id = linkId;
  }

  return { values };
}

// Devolve a URL normalizada (ex.: "HTTPS://" vira "https://") ou null se não for https.
function parseHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

const isValidId = isUuid;

const isDuplicateSlug = (error) => error.code === "23505" && error.constraint === "products_slug_key";
const isMissingImage = (error) => error.code === "23503" && error.constraint === "products_image_id_fkey";
const isOfferKind = (error) => error.code === "23514" && error.constraint === "products_offer_kind";
const OFFER_KIND = { error: "A promoção é com link promocional ou só com o valor \"de\": escolha um dos dois." };
const isMissingBrand = (error) => error.code === "23503" && error.constraint === "products_brand_id_fkey";
const DUPLICATE_SLUG = { error: "Já existe um produto com este endereço (slug)." };
const MISSING_IMAGE = { error: "A imagem escolhida não existe mais. Escolha outra." };
const MISSING_BRAND = { error: "A empresa escolhida não existe mais. Escolha outra." };
const INVALID_ID = { error: "ID de produto inválido." };
const NOT_FOUND = { error: "Produto não encontrado." };

// Vínculo com a Kiwify ao salvar: preço e link vêm da Kiwify (sobrepõem os digitados), e os da
// oferta e da Melhor opção vêm dos links escolhidos para elas (com Kiwify, não são digitados).
//  - vínculo novo ou trocado: a Kiwify precisa responder, senão o produto não é salvo;
//  - vínculo igual ao gravado: se a Kiwify falhar, salva o resto e mantém o último preço/link;
//  - trocar a empresa sem informar o vínculo desfaz o vínculo (a conta Kiwify é da empresa).
// Devolve { error, status } para recusar o pedido.
const LINK_FIELDS = ["kiwify_product_id", "kiwify_link_id", "offer_kiwify_link_id", "special_kiwify_product_id", "special_kiwify_link_id"];
const KIWIFY_PRICES = ["price_cents", "checkout_url", "offer_price_cents", "offer_checkout_url",
  "special_price_cents", "special_checkout_url", "kiwify_synced_at"];

async function applyKiwify(values, productId) {
  const current = productId
    ? (await pool.query(`SELECT brand_id, ${LINK_FIELDS.join(", ")} FROM products WHERE id = $1`, [productId])).rows[0]
    : null;
  if (productId && !current) return {}; // não existe: o UPDATE responde 404

  if (!("kiwify_product_id" in values) && "brand_id" in values && current?.kiwify_product_id && values.brand_id !== current.brand_id) {
    Object.assign(values, { kiwify_product_id: null, kiwify_link_id: null });
  }
  const pick = (field) => (field in values ? values[field] : current?.[field] ?? null);
  const [kiwifyProduct, linkId, offerLink, specialProduct, specialLink] = LINK_FIELDS.map(pick);

  // Sem Kiwify: preço e ofertas digitados. Uma oferta que vinha da Kiwify sai junto com o vínculo.
  if (!kiwifyProduct) {
    if (values.offer_kiwify_link_id) return { status: 400, error: "Para usar um link promocional da Kiwify, vincule o produto à Kiwify." };
    if (values.special_kiwify_link_id) return { status: 400, error: "Para usar um link da Kiwify na Melhor opção, vincule o produto à Kiwify." };
    if ("kiwify_product_id" in values) Object.assign(values, { kiwify_synced_at: null, kiwify_sync_error: null });
    if (current?.offer_kiwify_link_id && !("offer_price_cents" in values)) {
      Object.assign(values, { offer_price_cents: null, offer_checkout_url: null });
    }
    if (offerLink || "offer_kiwify_link_id" in values) values.offer_kiwify_link_id = null;
    if (current?.special_kiwify_link_id && !("special_price_cents" in values)) {
      Object.assign(values, { special_price_cents: null, special_checkout_url: null });
    }
    if (specialLink || "special_kiwify_link_id" in values) Object.assign(values, { special_kiwify_product_id: null, special_kiwify_link_id: null });
    return {};
  }
  if (!["kiwify_product_id", "offer_kiwify_link_id", "special_kiwify_link_id"].some((field) => field in values)) return {};
  if (offerLink && offerLink === linkId) return { status: 400, error: "O link promocional deve ser diferente do link de checkout normal." };
  if (specialLink && specialProduct === kiwifyProduct && specialLink === linkId) {
    return { status: 400, error: "O link da Melhor opção deve ser diferente do link de checkout normal." };
  }

  const brandId = "brand_id" in values ? values.brand_id : current?.brand_id ?? null;
  const sameBrand = !!current && current.brand_id === brandId;
  const unchanged = sameBrand && current.kiwify_product_id === kiwifyProduct && current.kiwify_link_id === linkId;
  const cache = new Map(); // uma consulta à Kiwify por produto serve para todos os links dele

  // Link extra (promocional ou da Melhor opção). Novo: precisa estar ativo. O já gravado só gera
  // aviso se foi desativado ou apagado (como na atualização automática).
  async function extra(product, link, kind, known) {
    if (!link) return { price_cents: null, checkout_url: null, warning: null };
    if (known) return fetchOffer(brandId, product, link, cache, kind);
    try {
      return { ...(await fetchCheckout(brandId, product, link, cache)), warning: null };
    } catch (error) {
      if (!(error instanceof kiwify.KiwifyError)) throw error;
      return { error: `${kind === "offer" ? "Link promocional" : "Melhor opção"}: ${error.message}`, status: error.status };
    }
  }

  const offerKnown = unchanged && current.offer_kiwify_link_id === offerLink;
  const specialKnown = sameBrand && current.special_kiwify_product_id === specialProduct && current.special_kiwify_link_id === specialLink;
  try {
    const checkout = await fetchCheckout(brandId, kiwifyProduct, linkId, cache);
    const offer = await extra(kiwifyProduct, offerLink, "offer", offerKnown);
    if (offer.error) return offer;
    const special = await extra(specialProduct, specialLink, "special", specialKnown);
    if (special.error) return special;
    Object.assign(values, checkout, {
      kiwify_synced_at: new Date(), kiwify_sync_error: joinWarnings(offer.warning, special.warning),
      offer_kiwify_link_id: offerLink, offer_price_cents: offer.price_cents, offer_checkout_url: offer.checkout_url,
      special_kiwify_product_id: specialProduct, special_kiwify_link_id: specialLink,
      special_price_cents: special.price_cents, special_checkout_url: special.checkout_url,
    });
  } catch (error) {
    if (!(error instanceof kiwify.KiwifyError)) throw error;
    if (!(unchanged && offerKnown && specialKnown)) return { status: error.status, error: error.message };
    // Mantém o último preço e link (normais e das ofertas) da Kiwify.
    for (const field of KIWIFY_PRICES) delete values[field];
    values.kiwify_sync_error = errorText(error);
  }
  return {};
}

// A oferta precisa ser mais barata que o preço normal. Numa alteração que traz só um dos dois
// preços, o outro vem do produto gravado (senão uma oferta mais cara passaria e o site a
// ignoraria sem avisar).
async function checkOfferPrice(values, productId = null) {
  let { price_cents: price, offer_price_cents: offer, offer_compare_cents: compare } = values;
  const touched = [price, offer, compare].some((v) => v !== undefined);
  if (productId && touched && [price, offer, compare].some((v) => v === undefined)) {
    const { rows } = await pool.query("SELECT price_cents, offer_price_cents, offer_compare_cents FROM products WHERE id = $1", [productId]);
    if (rows[0]) {
      if (price === undefined) price = rows[0].price_cents;
      if (offer === undefined) offer = rows[0].offer_price_cents;
      if (compare === undefined) compare = rows[0].offer_compare_cents;
    }
  }
  if (price === null || price === undefined) return null;
  if (offer !== null && offer !== undefined && offer >= price) {
    return `O preço da promoção (${brl(offer)}) deve ser menor que o preço normal (${brl(price)}).`;
  }
  if (compare !== null && compare !== undefined && compare <= price) {
    return `O valor "de" da promoção (${brl(compare)}) deve ser maior que o preço normal (${brl(price)}).`;
  }
  return null;
}

// O valor "de" da Melhor opção precisa ser maior que o preço dela. Como em checkOfferPrice, o
// que não veio no pedido vem do produto gravado.
async function checkSpecialCompare(values, productId = null) {
  let { special_price_cents: price, special_compare_cents: compare } = values;
  if (price === undefined && compare === undefined) return null;
  if (productId && (price === undefined || compare === undefined)) {
    const { rows } = await pool.query("SELECT special_price_cents, special_compare_cents FROM products WHERE id = $1", [productId]);
    if (rows[0]) {
      if (price === undefined) price = rows[0].special_price_cents;
      if (compare === undefined) compare = rows[0].special_compare_cents;
    }
  }
  if (price === null || price === undefined || compare === null || compare === undefined || compare > price) return null;
  return `O valor "de" da Melhor opção (${brl(compare)}) deve ser maior que o preço dela (${brl(price)}).`;
}
const brl = (cents) => (cents / 100).toFixed(2).replace(".", ",");

async function listPublicProducts(_req, res) {
  const result = await pool.query(
    `${selectFrom("products", HAS_SALES_PAGE)} WHERE p.status = 'published' ORDER BY p.created_at DESC`
  );
  return res.json({ data: result.rows.map(publicResponse) });
}

async function getPublicProduct(req, res) {
  const result = await pool.query(
    `${selectFrom("products", HAS_SALES_PAGE)} WHERE p.slug = $1 AND p.status = 'published'`,
    [req.params.slug]
  );
  if (!result.rowCount) return res.status(404).json(NOT_FOUND);
  return res.json({ data: publicResponse(result.rows[0]) });
}

async function listAdminProducts(_req, res) {
  const result = await pool.query(`${selectFrom("products", ADMIN_EXTRA)} ORDER BY p.created_at DESC`);
  return res.json({ data: result.rows.map(toResponse) });
}

async function getAdminProduct(req, res) {
  if (!isValidId(req.params.id)) return res.status(400).json(INVALID_ID);

  const result = await pool.query(`${selectFrom("products", ADMIN_EXTRA)} WHERE p.id = $1`, [req.params.id]);
  if (!result.rowCount) return res.status(404).json(NOT_FOUND);
  return res.json({ data: toResponse(result.rows[0]) });
}

async function createProduct(req, res) {
  const { values, error } = normalizeProductInput(req.body, true);
  if (error) return res.status(400).json({ error });
  const linked = await applyKiwify(values, null);
  if (linked.error) return res.status(linked.status).json({ error: linked.error });
  const offerError = await checkOfferPrice(values, null) || await checkSpecialCompare(values, null);
  if (offerError) return res.status(400).json({ error: offerError });

  // Os nomes de coluna vêm da lista FIELDS (nunca do usuário); os valores vão como parâmetros.
  const fields = Object.keys(values);
  const placeholders = fields.map((_, index) => `$${index + 1}`);

  try {
    // CTE (WITH): grava e, na mesma consulta, devolve o produto já com os dados da imagem.
    const result = await pool.query(
      `WITH saved AS (
         INSERT INTO products (${fields.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *)
       ${selectFrom("saved", ADMIN_EXTRA)}`,
      fields.map((field) => values[field])
    );
    return res.status(201).json({ data: toResponse(result.rows[0]) });
  } catch (error) {
    if (isDuplicateSlug(error)) return res.status(409).json(DUPLICATE_SLUG);
    if (isMissingImage(error)) return res.status(400).json(MISSING_IMAGE);
    if (isMissingBrand(error)) return res.status(400).json(MISSING_BRAND);
    if (isOfferKind(error)) return res.status(400).json(OFFER_KIND);
    throw error;
  }
}

async function updateProduct(req, res) {
  if (!isValidId(req.params.id)) return res.status(400).json(INVALID_ID);

  const { values, error } = normalizeProductInput(req.body);
  if (error) return res.status(400).json({ error });
  const linked = await applyKiwify(values, req.params.id);
  if (linked.error) return res.status(linked.status).json({ error: linked.error });
  const offerError = await checkOfferPrice(values, req.params.id) || await checkSpecialCompare(values, req.params.id);
  if (offerError) return res.status(400).json({ error: offerError });

  const fields = Object.keys(values);
  const assignments = fields.map((field, index) => `${field} = $${index + 2}`);
  assignments.push("updated_at = CURRENT_TIMESTAMP");

  try {
    const result = await pool.query(
      `WITH saved AS (
         UPDATE products SET ${assignments.join(", ")} WHERE id = $1 RETURNING *)
       ${selectFrom("saved", ADMIN_EXTRA)}`,
      [req.params.id, ...fields.map((field) => values[field])]
    );
    if (!result.rowCount) return res.status(404).json(NOT_FOUND);
    return res.json({ data: toResponse(result.rows[0]) });
  } catch (error) {
    if (isDuplicateSlug(error)) return res.status(409).json(DUPLICATE_SLUG);
    if (isMissingImage(error)) return res.status(400).json(MISSING_IMAGE);
    if (isMissingBrand(error)) return res.status(400).json(MISSING_BRAND);
    if (isOfferKind(error)) return res.status(400).json(OFFER_KIND);
    throw error;
  }
}

// Botão "Atualizar agora": busca de novo preço e link na Kiwify.
async function syncKiwifyProduct(req, res) {
  if (!isValidId(req.params.id)) return res.status(400).json(INVALID_ID);
  try {
    const { found } = await syncProduct(req.params.id);
    if (!found) return res.status(404).json(NOT_FOUND);
  } catch (error) {
    if (!(error instanceof kiwify.KiwifyError)) throw error;
    return res.status(error.status).json({ error: error.message });
  }
  const result = await pool.query(`${selectFrom("products", ADMIN_EXTRA)} WHERE p.id = $1`, [req.params.id]);
  return res.json({ data: toResponse(result.rows[0]) });
}

// Exclusão definitiva só para rascunhos e arquivados; publicados devem ser arquivados antes
// (evita apagar sem querer um produto com links já divulgados). Para arquivar ou restaurar,
// use PATCH com { "status": "archived" } ou { "status": "draft" }.
async function deleteProduct(req, res) {
  if (!isValidId(req.params.id)) return res.status(400).json(INVALID_ID);

  const deleted = await pool.query(
    "DELETE FROM products WHERE id = $1 AND status IN ('draft', 'archived')",
    [req.params.id]
  );
  if (deleted.rowCount) return res.status(204).end();

  const exists = await pool.query("SELECT 1 FROM products WHERE id = $1", [req.params.id]);
  if (!exists.rowCount) return res.status(404).json(NOT_FOUND);
  return res.status(409).json({ error: "Produtos publicados não podem ser excluídos. Arquive-o primeiro." });
}

// Lista de áreas de conhecimento para o seletor do painel.
const listAreas = (_req, res) => res.json({ data: AREAS });

module.exports = {
  listAreas,
  listPublicProducts,
  getPublicProduct,
  listAdminProducts,
  getAdminProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  syncKiwifyProduct,
};
