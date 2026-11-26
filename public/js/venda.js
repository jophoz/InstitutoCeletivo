(function () {
  "use strict";
  // Carrossel: setas e pontos são opcionais, a rolagem já funciona sozinha.
  // Vale para todos os .carousel da página (uma página de vendas pode ter mais de um carrossel).
  var reduce =
    window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Dentro do editor do painel (<html data-editor>) a página é só uma prévia editável.
  var editing = document.documentElement.hasAttribute("data-editor");

  function setup(root) {
    var track = root.querySelector(".track"),
      dots = root.querySelector(".dots");
    if (!track || !dots) return;
    var slides = [].slice.call(track.children);
    var prev = root.querySelector(".prev"),
      next = root.querySelector(".next");
    // Painel do módulo ao lado (carrossel com títulos/listas): mostra só o do slide atual.
    var split = root.parentElement && root.parentElement.classList.contains("gallery-split") ? root.parentElement : null;
    var panels = split ? [].slice.call(split.querySelectorAll(".module-panel")) : [];
    function showPanel(i) {
      if (!panels[i]) return; // slide "Adicionar imagem" do editor: mantém o painel anterior
      panels.forEach(function (p, n) { p.hidden = n !== i; });
    }
    if (slides.length < 2) return; // um slide só: sem setas nem pontos
    if (panels.length) {
      split.querySelector(".module-panels").classList.add("is-ready");
      showPanel(0);
    }
    prev.hidden = next.hidden = dots.hidden = false;

    // Giro contínuo: uma cópia das imagens antes e outra depois das reais. Quando a rolagem para
    // numa cópia, a página pula (sem animação) para a imagem real equivalente, então sempre há
    // imagens dos dois lados. No editor não há cópias (o slide "Adicionar imagem" e os × não
    // podem se repetir): as setas só voltam ao começo.
    var count = slides.length; // imagens reais
    var loop = !editing;
    if (loop) {
      var copy = function (s) {
        var c = s.cloneNode(true);
        c.setAttribute("aria-hidden", "true"); // leitores de tela contam só as reais
        c.removeAttribute("aria-label");
        return c;
      };
      var before = slides.map(copy), after = slides.map(copy);
      track.prepend.apply(track, before);
      track.append.apply(track, after);
      slides = before.concat(slides, after);
    }
    var base = loop ? count : 0; // posição da 1ª imagem real

    function go(i, instant) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({
        left:
          slides[i].offsetLeft - (track.clientWidth - slides[i].clientWidth) / 2,
        behavior: reduce || instant ? "auto" : "smooth",
      });
    }
    // Parou numa cópia: pula para a real equivalente (mesma distância, só muda o trecho).
    function recenter() {
      var c = current();
      var t = c < base ? c + count : c >= base + count ? c - count : c;
      if (t !== c) track.scrollLeft += slides[t].offsetLeft - slides[c].offsetLeft;
    }
    function current() {
      var mid = track.scrollLeft + track.clientWidth / 2,
        best = 0,
        d = Infinity;
      slides.forEach(function (s, i) {
        var diff = Math.abs(s.offsetLeft + s.clientWidth / 2 - mid);
        if (diff < d) {
          d = diff;
          best = i;
        }
      });
      return best;
    }
    var buttons = slides.slice(base, base + count).map(function (_, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Ir para o slide " + (i + 1));
      b.addEventListener("click", function () {
        go(base + i);
      });
      dots.append(b);
      return b;
    });
    // Escala das vizinhas e das mais distantes, quanto da vizinha fica escondido atrás da imagem
    // atual e quanto da mais distante aparece além da vizinha.
    var NEAR = 0.8, FAR = 0.62, HIDDEN = 0.35, PEEK = 0.3;
    // Largura em que a imagem aparece no slide (inteira, sem cortes), calculada pelas dimensões
    // do <img>: não depende de a imagem já ter carregado.
    function imageWidth(slide) {
      var img = slide.querySelector("img"), box = slide.clientWidth, h = slide.clientHeight;
      var w = img && +img.getAttribute("width"), ih = img && +img.getAttribute("height");
      if (!w || !ih) return box;
      return Math.min(box, h * w / ih, w);
    }
    // Profundidade: as vizinhas ficam menores, mais apagadas e encostadas na imagem atual,
    // parcialmente atrás dela. O efeito acompanha a rolagem quadro a quadro: a posição na rolagem
    // vira um índice fracionário (ex.: 1.4) e cada imagem fica entre o arranjo "atual = 1" e o
    // arranjo "atual = 2", na proporção do caminho já percorrido. Assim nada anda por conta
    // própria (sem transição) e as imagens não passam do ponto nem voltam no fim da rolagem.
    // O deslocamento vai na imagem (filho do <li>), não no <li>: mexer no <li> mudaria o snap.
    var LOOK = [
      { scale: 1, bright: 1, sat: 1, op: 1 },
      { scale: NEAR, bright: 0.62, sat: 0.8, op: 1 },
      { scale: FAR, bright: 0.45, sat: 0.6, op: 0.55 },
    ];
    var widths = [], step = 0;
    function measure() {
      widths = slides.map(imageWidth);
      step = slides[1].offsetLeft - slides[0].offsetLeft; // há sempre 2 ou mais slides aqui
    }
    // Distância visual (do centro da atual c ao centro do slide i) no arranjo com c no meio.
    function offset(i, c) {
      var d = i - c, dir = d < 0 ? -1 : 1, n = Math.abs(d);
      if (n === 0) return 0;
      var near = widths[c + dir] * NEAR;
      var dist = widths[c] / 2 + near / 2 - near * HIDDEN;
      if (n === 1) return dir * dist;
      var far = widths[c + 2 * dir] !== undefined ? widths[c + 2 * dir] * FAR : near;
      dist += near / 2 - far / 2 + far * PEEK; // aparece um pouco além da vizinha
      if (n === 2) return dir * dist;
      return dir * (dist + (n - 2) * step); // mais longe: segue a rolagem, fora de vista
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    var shown = -1;
    function render() {
      if (!step) return;
      var mid = track.scrollLeft + track.clientWidth / 2;
      var x = (mid - (slides[0].offsetLeft + slides[0].offsetWidth / 2)) / step;
      x = Math.max(0, Math.min(slides.length - 1, x));
      var k = Math.min(slides.length - 2, Math.floor(x)), t = x - k;
      slides.forEach(function (s, i) {
        var visual = lerp(offset(i, k), offset(i, k + 1), t);
        var natural = (i - x) * step;
        var n = Math.min(2, Math.abs(i - x)), lo = Math.floor(n), f = n - lo;
        var A = LOOK[lo], B = LOOK[Math.min(2, lo + 1)];
        var transform = "translateX(" + (visual - natural).toFixed(1) + "px) scale(" + lerp(A.scale, B.scale, f).toFixed(3) + ")";
        var filter = "brightness(" + lerp(A.bright, B.bright, f).toFixed(3) + ") saturate(" + lerp(A.sat, B.sat, f).toFixed(3) + ")";
        var opacity = lerp(A.op, B.op, f).toFixed(3);
        s.style.zIndex = String(3 - Math.min(3, Math.round(Math.abs(i - x))));
        // A imagem e, no editor, o botão × do slide andam juntos.
        [].forEach.call(s.children, function (child) {
          child.style.transform = transform;
          child.style.filter = filter;
          child.style.opacity = opacity;
        });
      });
      // Ponto atual e data-pos (cursor de clique nas vizinhas): só quando o atual muda.
      var c = Math.round(x);
      if (c === shown) return;
      shown = c;
      showPanel(c % count);
      buttons.forEach(function (b, i) {
        b.setAttribute("aria-current", String(i === c % count));
      });
      slides.forEach(function (s, i) {
        var d = i - c;
        if (d === 0) s.removeAttribute("data-pos");
        else s.setAttribute("data-pos", (Math.abs(d) > 1 ? "far-" : "") + (d < 0 ? "prev" : "next"));
      });
    }
    var pending = false;
    function sync(force) {
      if (force === true) measure();
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () { pending = false; render(); });
    }
    window.addEventListener("resize", function () { sync(true); });
    // Clicar na imagem vizinha (parcialmente atrás da atual) leva até ela. No editor, clicar numa
    // imagem serve para trocá-la, então fica de fora.
    if (!editing) {
      slides.forEach(function (s, i) {
        s.addEventListener("click", function () { if (i !== current()) go(i); });
      });
    }
    // Com as cópias, a seta sempre tem para onde ir; sem elas (editor), volta ao começo.
    function move(d) {
      var i = current() + d;
      go(loop ? i : (i + count) % count);
    }
    prev.addEventListener("click", function () { move(-1); });
    next.addEventListener("click", function () { move(1); });
    // Fim da rolagem: "scrollend" onde existe; nos outros navegadores, uma pausa sem rolar.
    var settle = 0;
    track.addEventListener(
      "scroll",
      function () {
        sync();
        if (loop && !("onscrollend" in window)) {
          clearTimeout(settle);
          settle = setTimeout(recenter, 150);
        }
      },
      { passive: true },
    );
    if (loop && "onscrollend" in window) track.addEventListener("scrollend", recenter);
    track.tabIndex = 0; // permite usar as setas do teclado para rolar
    sync(true);
    if (loop) go(base, true); // começa na 1ª imagem real, com a última à esquerda
    root.classList.add("is-ready");
  }

  [].forEach.call(document.querySelectorAll(".carousel"), setup);

  // Demonstração: abas (Manual, Aula, Fluxograma…). Sem JavaScript e no editor os painéis ficam um
  // embaixo do outro. Teclado: setas, Home e End trocam de aba (padrão de abas da WAI-ARIA).
  function tabs(root) {
    var list = root.querySelector(".demo-tabs");
    var buttons = list ? [].slice.call(list.querySelectorAll('[role="tab"]')) : [];
    var panels = [].slice.call(root.querySelectorAll(".demo-panel"));
    if (buttons.length < 2) return;
    function select(i, focus) {
      buttons.forEach(function (b, n) {
        b.setAttribute("aria-selected", String(n === i));
        b.tabIndex = n === i ? 0 : -1;
        panels[n].hidden = n !== i;
      });
      if (focus) buttons[i].focus();
    }
    buttons.forEach(function (b, i) {
      b.addEventListener("click", function () { select(i, false); });
      b.addEventListener("keydown", function (e) {
        var n = buttons.length, to = null;
        if (e.key === "ArrowRight") to = (i + 1) % n;
        else if (e.key === "ArrowLeft") to = (i - 1 + n) % n;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = n - 1;
        if (to === null) return;
        e.preventDefault();
        select(to, true);
      });
    });
    list.hidden = false;
    root.classList.add("is-ready");
    select(0, false);
  }
  if (!editing) [].forEach.call(document.querySelectorAll("[data-demo]"), tabs);

  // Vídeo da abertura: o player (YouTube/Vimeo) só carrega no clique, no lugar da capa. Sem
  // JavaScript, ou com link de outro site (sem data-embed), o botão abre o vídeo numa nova aba.
  if (!editing) {
    [].forEach.call(document.querySelectorAll(".v-play[data-embed]"), function (play) {
      play.addEventListener("click", function (event) {
        var figure = play.closest(".v-video");
        if (!figure) return;
        event.preventDefault();
        var frame = document.createElement("iframe");
        frame.src = play.getAttribute("data-embed");
        frame.title = "Vídeo de apresentação";
        frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        figure.replaceChildren(frame);
        figure.classList.add("is-playing");
        frame.focus();
      });
    });
  }

  // Perguntas frequentes: abrir e fechar deslizando, em vez de saltar. Sem JavaScript, com
  // "menos movimento" ou dentro do editor (onde ficam sempre abertas), o <details> funciona sozinho.
  function accordion(details) {
    var summary = details.querySelector("summary"), running = null;
    if (!summary || !details.animate) return;
    function finish(open) {
      details.open = open;
      details.classList.remove("is-closing");
      details.style.height = details.style.overflow = "";
      running = null;
    }
    function slide(from, to, open) {
      details.style.overflow = "hidden";
      if (running) running.cancel();
      running = details.animate({ height: [from + "px", to + "px"] }, { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)" });
      running.onfinish = function () { finish(open); };
    }
    summary.addEventListener("click", function (event) {
      event.preventDefault();
      var start = details.offsetHeight;
      if (details.open && !details.classList.contains("is-closing")) {
        details.classList.add("is-closing"); // o "+" volta a girar já no início
        slide(start, summary.offsetHeight + 2, false);
      } else {
        details.classList.remove("is-closing");
        details.open = true;
        slide(start, details.scrollHeight + 2, true);
      }
    });
  }
  if (!reduce && !editing) [].forEach.call(document.querySelectorAll("details.faq"), accordion);
})();

// Cronômetro da oferta (<p class="offer-timer" data-ends-at> e o cronômetro grande do bloco
// Contagem regressiva, <div class="v-count" data-count-ends>; ver server/sales/render.js).
// O servidor decide se a oferta vale; aqui só a contagem. data-now (horário do servidor) corrige o
// relógio do aparelho. No fim do prazo a página recarrega uma vez e já vem com o preço normal.
(function () {
  "use strict";
  var timers = [].slice.call(document.querySelectorAll(".offer-timer[data-ends-at]"));
  // Cronômetro grande (bloco Contagem regressiva): caixas de dias, horas, minutos e segundos.
  var big = [].slice.call(document.querySelectorAll(".v-count[data-count-ends]"));
  if (!timers.length && !big.length) return;
  var editing = document.documentElement.hasAttribute("data-editor");
  var first = timers[0] || big[0];
  var ends = Date.parse(first.getAttribute(timers[0] ? "data-ends-at" : "data-count-ends"));
  var serverNow = Date.parse(first.getAttribute("data-now"));
  var skew = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
  if (!Number.isFinite(ends)) return;
  var counts = timers.map(function (t) {
    var c = t.querySelector("[data-countdown]");
    c.hidden = false;
    c.setAttribute("aria-hidden", "true"); // a data por extenso, ao lado, já informa o leitor de tela
    return c;
  });
  var pad = function (n) { return String(n).padStart(2, "0"); };
  // Com JavaScript, as caixas aparecem e a data por extenso fica só para leitores de tela.
  var boxes = big.map(function (root) {
    var date = root.querySelector(".v-count-date"), wrap = root.querySelector("[data-count-boxes]");
    if (date) date.classList.add("sr-only");
    wrap.hidden = false;
    var unit = function (u) { return wrap.querySelector('[data-unit="' + u + '"]'); };
    return { d: unit("d"), h: unit("h"), m: unit("m"), s: unit("s") };
  });
  var interval;

  function tick() {
    var left = Math.max(0, Math.floor((ends - (Date.now() + skew)) / 1000));
    var days = Math.floor(left / 86400), rest = left % 86400;
    var text = (days ? days + (days === 1 ? " dia " : " dias ") : "") +
      pad(Math.floor(rest / 3600)) + ":" + pad(Math.floor(rest % 3600 / 60)) + ":" + pad(rest % 60);
    counts.forEach(function (c) { c.textContent = "Termina em " + text; });
    boxes.forEach(function (b) {
      b.d.textContent = pad(days);
      b.h.textContent = pad(Math.floor(rest / 3600));
      b.m.textContent = pad(Math.floor(rest % 3600 / 60));
      b.s.textContent = pad(rest % 60);
    });
    if (left > 0) return;
    clearInterval(interval);
    counts.forEach(function (c) { c.textContent = "Oferta encerrada"; });
    // Recarrega uma única vez (1,5 s de folga para o servidor também ver o prazo vencido).
    if (!editing) setTimeout(function () { location.reload(); }, 1500);
  }
  tick();
  interval = setInterval(tick, 1000);
})();

// Página copiada em outro site. Quem clona a página costuma salvar o HTML e trocar o link de
// compra pelo seu. Aqui, se a página está aberta fora do endereço original (data-ref, posto pelo
// servidor), os botões de compra voltam a levar para o checkout deste site e o servidor recebe um
// aviso com o domínio da cópia (aba Resumo do painel). Fica neste arquivo de propósito: é o mesmo
// que faz o carrossel, as abas, as perguntas e o cronômetro funcionarem.
(function () {
  "use strict";
  if (document.documentElement.hasAttribute("data-editor")) return;
  var main = document.getElementById("conteudo");
  var ref = main && main.getAttribute("data-ref");
  if (!ref) return;
  var home;
  try { home = new URL(atob(ref.split("").reverse().join(""))); } catch (e) { return; }
  var bare = function (h) { return String(h).toLowerCase().replace(/^www\./, ""); };
  // No próprio site, ou no computador de quem mantém o site (localhost), nada muda.
  if (bare(location.hostname) === bare(home.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  var slug = home.pathname.split("/")[2] || "";
  var buy = home.origin + "/comprar/" + slug;

  // Botão que já leva a /comprar/... (de qualquer domínio) mantém a opção (?opcao=melhor);
  // qualquer outro link de compra (o que a cópia colocou) vira o checkout normal deste site.
  function fix(a) {
    var href = a.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#") return;
    var url;
    try { url = new URL(href, location.href); } catch (e) { url = null; }
    var target = url && /^\/comprar\/[^/]+$/.test(url.pathname) ? home.origin + url.pathname + url.search : buy;
    if (a.href !== target) a.href = target;
  }
  function fixAll() { [].forEach.call(document.querySelectorAll("a.btn-cta"), fix); }
  fixAll();
  // No clique também (botões criados ou trocados depois de a página carregar).
  document.addEventListener("click", function (event) {
    var a = event.target.closest && event.target.closest("a.btn-cta");
    if (a) fix(a);
  }, true);

  try {
    var body = JSON.stringify({ product: slug, path: location.pathname });
    if (!(navigator.sendBeacon && navigator.sendBeacon(home.origin + "/api/track/copia", body))) {
      fetch(home.origin + "/api/track/copia", { method: "POST", mode: "no-cors", keepalive: true, body: body,
        headers: { "Content-Type": "text/plain" } }).catch(function () {});
    }
  } catch (e) { /* o aviso nunca atrapalha a página */ }
})();
