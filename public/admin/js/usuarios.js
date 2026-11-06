/* Usuários do painel: listar, adicionar e remover administradores e trocar a própria senha.
   As regras (tamanho da senha, não remover a si mesmo nem o último) são do servidor;
   aqui só se confere "repita a senha" para avisar rápido. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var msg = $("msg"), table = $("users"), tbody = table.querySelector("tbody");

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { node.append(c); });
    return node;
  }

  function formatDate(iso) {
    return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Nunca entrou";
  }

  function row(u) {
    var email = el("td", { "data-label": "E-mail" }, [u.email]);
    if (u.is_me) email.append(" ", el("span", { "class": "muted" }, ["(você)"]));
    var remove = el("button", { type: "button", "class": "btn btn-sm btn-danger" }, ["Remover"]);
    if (u.is_me) {
      remove.disabled = true;
      remove.title = "Você não pode remover o próprio acesso";
    }
    remove.setAttribute("aria-label", "Remover " + u.email);
    remove.addEventListener("click", async function () {
      var ok = await Admin.confirm({
        title: "Remover " + u.email + "?",
        text: "Essa pessoa perde o acesso ao painel na hora. Para voltar, será preciso adicioná-la de novo.",
        action: "Remover", danger: true
      });
      if (!ok) return;
      remove.disabled = true;
      try {
        await Admin.api("/users/" + u.id, { method: "DELETE" });
        await load();
        Admin.showMessage(msg, u.email + " foi removido.", "success");
      } catch (err) {
        remove.disabled = false;
        Admin.showMessage(msg, err.message, "error");
      }
    });
    return el("tr", {}, [
      email,
      el("td", { "data-label": "Criado em" }, [formatDate(u.created_at)]),
      el("td", { "data-label": "Último acesso" }, [formatDate(u.last_login_at)]),
      el("td", { "data-label": "Ações" }, [remove])
    ]);
  }

  async function load() {
    var users = await Admin.api("/users");
    tbody.replaceChildren.apply(tbody, users.map(row));
    table.hidden = false;
  }

  // Envia um formulário: confere "repita a senha", chama a API e limpa os campos se der certo.
  function handle(form, out, opts) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if ($(opts.password).value !== $(opts.repeat).value) {
        Admin.showMessage(out, "As senhas digitadas não são iguais.", "error");
        $(opts.repeat).focus();
        return;
      }
      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      Admin.showMessage(out, "");
      try {
        await opts.send();
        form.reset();
        Admin.showMessage(out, opts.done, "success");
        if (opts.after) await opts.after();
      } catch (err) {
        Admin.showMessage(out, err.message, "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  handle($("add-form"), $("add-msg"), {
    password: "add-password", repeat: "add-password2",
    send: function () {
      return Admin.api("/users", { method: "POST", body: {
        email: $("add-email").value, password: $("add-password").value, currentPassword: $("add-current").value
      } });
    },
    done: "Administrador adicionado. Passe o e-mail e a senha inicial para a pessoa.",
    after: load
  });

  handle($("password-form"), $("pw-msg"), {
    password: "pw-new", repeat: "pw-new2",
    send: function () {
      return Admin.api("/users/me/password", { method: "POST", body: {
        currentPassword: $("pw-current").value, newPassword: $("pw-new").value
      } });
    },
    done: "Senha trocada. Use a nova senha no próximo acesso."
  });

  (async function () {
    try {
      await Admin.requireSession();
      await load();
      Admin.showMessage(msg, "");
    } catch (err) {
      Admin.showMessage(msg, err.message, "error");
    }
  })();
})();
