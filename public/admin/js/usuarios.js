/* Usuários do painel: listar e adicionar administradores e trocar a própria senha (pop-up
   aberto pela linha "você" da lista). Cada pessoa só remove o próprio acesso, nunca o de outra.
   As regras (tamanho da senha, senha atual) são do servidor; aqui só se confere
   "repita a senha" para avisar rápido. */
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
    // Só a própria linha tem ações: cada pessoa troca a própria senha e remove o próprio acesso.
    var actions = el("td", { "data-label": "Ações" });
    if (u.is_me) {
      var change = el("button", { type: "button", "class": "btn btn-sm btn-outline" }, ["Trocar senha"]);
      change.addEventListener("click", openPasswordDialog);
      var remove = el("button", { type: "button", "class": "btn btn-sm btn-danger" }, ["Remover meu acesso"]);
      remove.addEventListener("click", openRemoveDialog);
      actions.append(change, " ", remove);
    }
    return el("tr", {}, [
      email,
      el("td", { "data-label": "Criado em" }, [formatDate(u.created_at)]),
      el("td", { "data-label": "Último acesso" }, [formatDate(u.last_login_at)]),
      actions
    ]);
  }

  // Pop-up de troca de senha: abre sempre limpo; Esc e "Cancelar" fecham sem alterar nada.
  var pwDialog = $("password-dialog");
  function openPasswordDialog() {
    $("password-form").reset();
    Admin.showMessage($("pw-msg"), "");
    pwDialog.showModal();
    $("pw-current").focus();
  }
  $("pw-cancel").addEventListener("click", function () { pwDialog.close(); });

  // Pop-up para remover o próprio acesso: pede a senha atual; ao dar certo, volta ao login.
  var rmDialog = $("remove-dialog");
  function openRemoveDialog() {
    $("remove-form").reset();
    Admin.showMessage($("rm-msg"), "");
    rmDialog.showModal();
    $("rm-cancel").focus(); // ação destrutiva nunca é o padrão
  }
  $("rm-cancel").addEventListener("click", function () { rmDialog.close(); });
  rmDialog.addEventListener("close", function () { $("remove-form").reset(); });
  $("remove-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var button = this.querySelector("button[type=submit]");
    button.disabled = true;
    Admin.showMessage($("rm-msg"), "");
    try {
      await Admin.api("/users/me/remove", { method: "POST", body: { currentPassword: $("rm-current").value } });
      Admin.leaving = true;
      location.replace("login.html");
    } catch (err) {
      button.disabled = false;
      Admin.showMessage($("rm-msg"), err.message, "error");
    }
  });
  pwDialog.addEventListener("close", function () { $("password-form").reset(); });

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
        if (opts.after) await opts.after();
        Admin.showMessage(opts.doneOut || out, opts.done, "success");
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
    done: "Senha trocada. Use a nova senha no próximo acesso.",
    doneOut: msg, // o pop-up fecha; o aviso aparece acima da lista
    after: function () { pwDialog.close(); }
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
