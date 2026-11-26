// GET /comprar/:slug: o botão "comprar" do site aponta para cá, e daqui segue para a Kiwify.
// O link de checkout não aparece no HTML da página: quem copia a página e procura o link da Kiwify
// para trocar pelo seu não encontra nada. Na cópia, o endereço /comprar/... aponta para o site
// dela, que não tem essa rota (e o venda.js ainda devolve os botões para cá, ver public/js/venda.js).
// Também decide o link na hora do clique: oferta que acabou nunca leva ao link promocional.
const pool = require("../config/database");
const { checkoutLink } = require("../lib/offer");
const { findSession } = require("../middleware/admin-auth");

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function goToCheckout(req, res) {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  const slug = req.params.slug;
  if (!SLUG.test(slug) || slug.length > 200) return res.redirect(302, "/catalogo");
  const { rows } = await pool.query(
    `SELECT slug, status, price_cents, checkout_url, offer_price_cents, offer_checkout_url, offer_ends_at,
            offer_compare_cents, special_price_cents, special_checkout_url, special_compare_cents
       FROM products WHERE slug = $1`, [slug]);
  const product = rows[0];
  // Produto ainda não publicado: só quem está logado no painel (pré-visualização) passa.
  const allowed = product && (product.status === "published" || (await findSession(req)));
  const option = req.query.opcao === "melhor" ? "melhor" : null;
  const target = allowed ? checkoutLink(product, { option, query: req.query }) : null;
  // Sem link de compra agora: volta à página do produto (que leva à de vendas, se houver).
  if (!target) return res.redirect(302, allowed ? `/produto?id=${slug}` : "/catalogo");
  return res.redirect(302, target);
}

module.exports = { goToCheckout };
