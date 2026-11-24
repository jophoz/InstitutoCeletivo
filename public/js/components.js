/* ==========================================================
   COMPONENTES COMPARTILHADOS — cabeçalho/menu e rodapé.
   Edite aqui UMA vez e todas as páginas são atualizadas.
   Cada página só tem <div id="site-header"></div> e
   <div id="site-footer"></div> no lugar.
   Os textos com data-site (nome da marca) vêm de data/site.js.
   ========================================================== */
(function () {
  "use strict";

  var HEADER = `<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header">
  <div class="container header-row">
    <a class="brand" href="/index.html"><img class="brand-mark" src="/assets/favicon/favicon.png" alt="" width="32" height="32"><span data-site="nome">Instituto Celetivo</span></a>
    <div class="header-actions">
      <nav id="nav" class="nav" aria-label="Principal">
        <ul>
          <li><a href="/index.html">Início</a></li>
          <li><a href="/catalogo.html">Catálogo</a></li>
          <li><a href="/sobre.html">Sobre</a></li>
          <li><a href="/contato.html">Contato</a></li>
        </ul>
      </nav>
      <button id="tema-btn" class="theme-btn" type="button" aria-label="Modo noturno" title="Modo noturno" aria-pressed="false"></button>
      <button id="menu-btn" class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav"><span></span></button>
    </div>
  </div>
</header>`;

  var FOOTER = `<footer class="site-footer">
  <div class="container foot3 foot4">
    <div><p><strong data-site="nome">Instituto Celetivo</strong> © <span data-year></span></p><p data-site="slogan"></p></div>
    <nav aria-label="Rodapé: navegação"><p><strong>Navegação</strong></p><p><a href="/catalogo.html">Catálogo</a></p><p><a href="/sobre.html">Sobre</a></p><p><a href="/contato.html">Contato</a></p></nav>
    <nav aria-label="Rodapé: ajuda"><p><strong>Ajuda</strong></p><p><a href="/duvidas.html">Dúvidas frequentes</a></p><p><a href="/termos.html">Termos de uso</a></p><p><a href="/privacidade.html">Política de privacidade</a></p></nav>
    <div><p><strong>Compra segura</strong></p><p>Pagamentos e acesso aos cursos processados pela Kiwify.</p></div>
  </div>
</footer>`;

  function mount(id, html) {
    var ph = document.getElementById(id);
    if (ph) ph.outerHTML = html;
  }

  // Marca do professor: a página de vendas manda nome e logo em data-brand-* no
  // placeholder do cabeçalho (ver server/sales/render.js). Sem eles, fica a marca do site.
  // Os textos entram por textContent/setAttribute, nunca como HTML.
  var placeholder = document.getElementById("site-header");
  var brand = placeholder && placeholder.hasAttribute("data-brand-name") ? {
    name: placeholder.dataset.brandName,
    logo: placeholder.dataset.brandLogo,
    width: placeholder.dataset.brandLogoW,
    height: placeholder.dataset.brandLogoH,
    alt: placeholder.dataset.brandLogoAlt
  } : null;

  mount("site-header", HEADER);

  // Página de vendas: a barra leva só a marca e o botão de compra, para manter a pessoa na oferta.
  // Saem os links, o botão de modo noturno (a página segue a preferência do aparelho) e o link da
  // marca para a página inicial. Os links do site continuam no rodapé.
  var sales = document.body.dataset.page === "venda";
  if (sales) {
    var bar = document.querySelector(".site-header");
    bar.classList.add("is-sales");
    var actions = bar.querySelector(".header-actions");
    actions.textContent = "";
    var oldBrand = bar.querySelector(".brand"), plain = document.createElement("span");
    plain.className = "brand";
    while (oldBrand.firstChild) plain.appendChild(oldBrand.firstChild);
    oldBrand.replaceWith(plain);
    // Com seção de compra (#oferta, a Oferta final), o botão SEMPRE rola até ela, como os botões
    // dos blocos. Em páginas antigas, sem essa seção, vai ao checkout (o servidor já põe o da oferta,
    // se houver). Só aparece se a página tem um botão de compra ativo (sem checkout: "Em breve").
    // Leva a classe btn-cta: o clique no checkout é contado e a origem (UTM) vai junto para a
    // Kiwify (track.js).
    var checkout = document.querySelector("main a.btn-cta[href]");
    if (checkout) {
      var buy = document.createElement("a"), note = document.createElement("span");
      var href = document.getElementById("oferta") ? "#oferta" : checkout.getAttribute("href");
      var local = href.charAt(0) === "#";
      buy.className = "btn-cta header-buy";
      buy.href = href;
      if (!local) {
        buy.target = "_blank";
        buy.rel = "noopener noreferrer";
      }
      buy.textContent = "Comprar agora";
      note.className = "sr-only";
      note.textContent = local ? " (vai para a oferta)" : " (abre o pagamento em nova aba)";
      buy.appendChild(note);
      actions.appendChild(buy);
    }
  }
  mount("site-footer", FOOTER);

  if (brand) {
    var link = document.querySelector(".site-header .brand");
    var mark = link.querySelector(".brand-mark"), label = link.querySelector("[data-site]");
    if (brand.logo) {
      mark.src = brand.logo;
      mark.className = "brand-logo";
      if (brand.width && brand.height) { mark.width = brand.width; mark.height = brand.height; }
      // Só logo, sem nome: o logo é o nome da marca (e do link, fora da página de vendas).
      mark.alt = brand.name ? "" : brand.alt || (sales ? "" : "Início");
    }
    if (brand.name) {
      label.removeAttribute("data-site"); // main.js não troca pelo nome do site
      label.textContent = brand.name;
    } else if (brand.logo) {
      label.remove();
    }
  }

  // Marca no menu a página atual (acessibilidade + destaque visual)
  var current = { home: "/index.html", catalogo: "/catalogo.html", produto: "/catalogo.html", sobre: "/sobre.html", contato: "/contato.html" }[document.body.dataset.page];
  document.querySelectorAll("#nav a").forEach(function (a) {
    if (a.getAttribute("href") === current) a.setAttribute("aria-current", "page");
  });
})();
