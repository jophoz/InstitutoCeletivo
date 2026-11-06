/* Backup: baixar o conteúdo do site num arquivo e importar esse arquivo aqui.
   A importação vai em etapas (ver server/controllers/backup.controller.js): confere a versão,
   envia as imagens que faltam uma a uma e por fim grava o conteúdo de uma vez. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var msg = $("msg"), importMsg = $("import-msg");
  var backup = null, busy = false;

  var LABELS = [
    ["products", "produto(s)"], ["salesPages", "página(s) de vendas"], ["sharedBlocks", "bloco(s) salvo(s)"],
    ["brands", "empresa(s)"], ["media", "imagem(ns)"]
  ];

  function formatDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "data desconhecida" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function setBusy(on) {
    busy = on;
    $("file").disabled = on;
    $("import").disabled = on;
    $("progress-box").hidden = !on;
  }

  function progress(done, total, text) {
    $("progress").max = Math.max(total, 1);
    $("progress").value = done;
    $("progress-text").textContent = text;
  }

  // Lê e confere o arquivo escolhido; mostra o que tem dentro antes de importar.
  $("file").addEventListener("change", async function () {
    var file = this.files[0];
    backup = null;
    $("summary").hidden = true;
    Admin.showMessage(importMsg, "");
    if (!file) return;
    try {
      var data = JSON.parse(await file.text());
      if (!data || data.format !== "vitrine-backup") throw new Error("Este arquivo não é um backup do painel.");
      if (data.version !== 1) throw new Error("Versão de backup não suportada.");
      backup = data;
    } catch (err) {
      Admin.showMessage(importMsg, err instanceof SyntaxError ? "O arquivo está corrompido ou não é um backup." : err.message, "error");
      return;
    }
    $("summary-text").textContent = "Backup de " + formatDate(backup.exportedAt) + " (" + Admin.formatBytes(file.size) + "):";
    $("summary-list").replaceChildren.apply($("summary-list"), LABELS.map(function (l) {
      var li = document.createElement("li");
      li.textContent = (backup[l[0]] || []).length + " " + l[1];
      return li;
    }));
    var missing = (backup.media || []).filter(function (m) { return !m.file; }).length;
    $("summary-warn").hidden = !missing;
    $("summary-warn").textContent = missing
      ? missing + " imagem(ns) estavam sem arquivo no site de origem e não serão importadas; o que usar essas imagens pode dar erro."
      : "";
    $("summary").hidden = false;
  });

  function base64ToFile(b64, name) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name || "imagem.webp", { type: "image/webp" });
  }

  $("import").addEventListener("click", async function () {
    if (!backup || busy) return;
    var ok = await Admin.confirm({
      title: "Importar neste site?",
      text: "Produtos, páginas, blocos salvos, empresas e imagens do arquivo serão criados ou atualizados neste site (" +
        location.host + "). Itens que só existem aqui não são apagados.",
      action: "Importar"
    });
    if (!ok) return;

    setBusy(true);
    Admin.showMessage(importMsg, "");
    try {
      var media = backup.media || [];
      progress(0, 1, "Conferindo o site…");
      var check = await Admin.api("/backup/check", {
        method: "POST", body: { schema: backup.schema, mediaIds: media.map(function (m) { return m.id; }) }
      });
      if (!check.schemaOk) {
        throw new Error("O arquivo é de outra versão do site. Atualize os dois sites para a mesma versão antes de importar.");
      }

      var existing = new Set(check.existing);
      var pending = media.filter(function (m) { return m.file && !existing.has(m.id); });
      var failed = [];
      for (var i = 0; i < pending.length; i++) {
        var m = pending[i];
        progress(i, pending.length, "Enviando imagens: " + (i + 1) + " de " + pending.length + "…");
        try {
          await Admin.api("/backup/media/" + m.id, {
            method: "POST",
            file: base64ToFile(m.file, m.original_name),
            headers: { "X-Media-Meta": encodeURIComponent(JSON.stringify({
              original_name: m.original_name, alt_text: m.alt_text, created_at: m.created_at
            })) }
          });
        } catch (err) {
          failed.push((m.original_name || m.id) + ": " + err.message);
        }
      }
      if (failed.length) {
        throw new Error(failed.length + " imagem(ns) não foram enviadas (" + failed.slice(0, 3).join("; ") +
          (failed.length > 3 ? "; …" : "") + "). Nada do conteúdo foi gravado; importe de novo para tentar outra vez.");
      }

      progress(pending.length, pending.length, "Gravando produtos e páginas…");
      var result = await Admin.api("/backup/content", {
        method: "POST",
        body: {
          format: backup.format, version: backup.version, schema: backup.schema,
          brands: backup.brands, sharedBlocks: backup.sharedBlocks, products: backup.products, salesPages: backup.salesPages
        }
      });
      var c = result.counts;
      var parts = LABELS.filter(function (l) { return c[l[0]]; }).map(function (l) {
        return l[1] + ": " + c[l[0]].created + " novo(s), " + c[l[0]].updated + " atualizado(s)";
      });
      parts.push("imagens: " + pending.length + " nova(s), " + (media.length - pending.length) + " já existiam ou sem arquivo");
      Admin.showMessage(importMsg, "Importação concluída. " + parts.join(" · ") + ".", "success");
    } catch (err) {
      Admin.showMessage(importMsg, err.message, "error");
    } finally {
      setBusy(false);
    }
  });

  // Sair da página no meio da importação interrompe o envio.
  window.addEventListener("beforeunload", function (e) { if (busy) { e.preventDefault(); e.returnValue = ""; } });

  (async function () {
    try {
      await Admin.requireSession();
      Admin.hasUnsavedChanges = function () { return busy; };
      Admin.showMessage(msg, "");
    } catch (err) {
      Admin.showMessage(msg, err.message, "error");
    }
  })();
})();
