/* Accounts: sign up, sign in, account settings and password reset. */
(function () {
  "use strict";
  const { esc, html } = App;

  const go = hash => { location.hash = hash; };
  const after = () => { const h = App.after || "#/"; App.after = null; go(h); };

  function form(body, { title, intro, fields, button, footer }) {
    App.render(body, html`
      <div class="stack">
        <h3>${esc(title)}</h3>
        ${intro ? `<p class="muted">${esc(intro)}</p>` : ""}
        <div class="stack-sm">
          ${fields.map(f => html`
            <label class="fld">
              <span class="label">${esc(f.label)}</span>
              <input class="input" type="${f.type || "text"}" name="${f.name}" ${f.attrs || ""}
                     placeholder="${esc(f.placeholder || "")}" value="${esc(f.value || "")}">
            </label>`).join("")}
        </div>
        <p class="form-error hidden" data-err role="alert"></p>
        <button class="btn block" data-submit>${esc(button)}</button>
        ${footer || ""}
      </div>`);
    const inputs = [...body.querySelectorAll("input")];
    const errBox = body.querySelector("[data-err]");
    const btn = body.querySelector("[data-submit]");
    const values = () => Object.fromEntries(inputs.map(i => [i.name, i.value.trim()]));
    const show = msg => { errBox.textContent = msg; errBox.classList.remove("hidden"); };
    const submit = async handler => {
      errBox.classList.add("hidden");
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = "One sec…";
      try { await handler(values()); } catch (e) { show(e.message); btn.disabled = false; btn.textContent = label; }
    };
    inputs.forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); }));
    setTimeout(() => inputs[0]?.focus(), 60);
    return { submit, show, values };
  }

  function signin() {
    const { body } = App.screen("Sign in");
    const f = form(body, {
      title: "Welcome back",
      fields: [
        { label: "Email", name: "email", type: "email", attrs: 'autocomplete="email" inputmode="email"', placeholder: "you@example.com" },
        { label: "Password", name: "password", type: "password", attrs: 'autocomplete="current-password"' }
      ],
      button: "Sign in",
      footer: `<div class="row" style="justify-content:space-between">
          <a class="link" href="#/signup">Create an account</a>
          <a class="link" href="#/forgot">Forgotten password</a>
        </div>`
    });
    body.querySelector("[data-submit]").onclick = () => f.submit(async v => {
      App.me = (await App.api("/api/auth/login", v)).user;
      App.toast(`Hi ${App.me.name.split(" ")[0]}`);
      after();
    });
  }

  function signup() {
    const { body } = App.screen("Create account");
    const f = form(body, {
      title: "Join the leaderboard",
      intro: "Your name is what everyone else sees on the leaderboard.",
      fields: [
        { label: "Name", name: "name", attrs: 'autocomplete="nickname" maxlength="40"', placeholder: "Tom" },
        { label: "Email", name: "email", type: "email", attrs: 'autocomplete="email" inputmode="email"', placeholder: "you@example.com" },
        { label: "Password", name: "password", type: "password", attrs: 'autocomplete="new-password"', placeholder: "At least 8 characters" }
      ],
      button: "Create account",
      footer: `<p class="muted small">You'll get one email a day, the moment that day's player drops. You can turn them off any time.</p>
        <a class="link" href="#/signin">I've already got an account</a>`
    });
    body.querySelector("[data-submit]").onclick = () => f.submit(async v => {
      App.me = (await App.api("/api/auth/signup", v)).user;
      App.toast(`You're in, ${App.me.name.split(" ")[0]}`);
      after();
    });
  }

  function forgot() {
    const { body } = App.screen("Password");
    const f = form(body, {
      title: "Forgotten password",
      intro: "We'll email you a link to set a new one.",
      fields: [{ label: "Email", name: "email", type: "email", attrs: 'autocomplete="email" inputmode="email"' }],
      button: "Send the link",
      footer: `<a class="link" href="#/signin">Back to sign in</a>`
    });
    body.querySelector("[data-submit]").onclick = () => f.submit(async v => {
      await App.api("/api/auth/forgot", v);
      App.render(body, `<div class="panel stack-sm"><h3>Check your email</h3>
        <p class="muted">If there's an account for that address, a reset link is on its way. It works for two hours.</p></div>
        <a class="btn block" href="#/signin">Back to sign in</a>`);
    });
  }

  function reset(token) {
    const { body } = App.screen("New password");
    const f = form(body, {
      title: "Choose a new password",
      fields: [{ label: "New password", name: "password", type: "password", attrs: 'autocomplete="new-password"', placeholder: "At least 8 characters" }],
      button: "Save password"
    });
    if (!token) f.show("That link is missing its code. Ask for a new one.");
    body.querySelector("[data-submit]").onclick = () => f.submit(async v => {
      App.me = (await App.api("/api/auth/reset", { token, password: v.password })).user;
      App.toast("Password changed");
      go("#/");
    });
  }

  async function account() {
    const { body } = App.screen("Account");
    await App.refreshMe();
    if (!App.me) { App.after = "#/account"; return go("#/signin"); }
    const me = App.me;
    App.render(body, html`
      <div class="panel stack">
        <div>
          <span class="label">Leaderboard name</span>
          <div class="row">
            <input class="input grow" data-name maxlength="40" value="${esc(me.name)}">
            <button class="btn sm" data-save>Save</button>
          </div>
        </div>
        <div class="kv"><span class="muted">Email</span><span>${esc(me.email)}</span></div>
        <label class="switch">
          <input type="checkbox" data-emails ${me.notify_email ? "checked" : ""}>
          <span><b>Daily email</b><br><span class="muted small">Sent the moment each day's player drops, between 9:30am and 4:30pm.</span></span>
        </label>
      </div>
      <a class="btn ghost block" href="#/leaderboard">Leaderboard</a>
      <button class="btn ghost block" data-out>Sign out</button>`);

    body.querySelector("[data-save]").onclick = async () => {
      const name = body.querySelector("[data-name]").value.trim();
      try { App.me = (await App.api("/api/me/settings", { name })).user; App.toast("Name saved"); }
      catch (e) { App.toast(e.message, "miss"); }
    };
    body.querySelector("[data-emails]").onchange = async e => {
      try { App.me = (await App.api("/api/me/settings", { notify_email: e.target.checked })).user; App.toast(e.target.checked ? "Emails on" : "Emails off"); }
      catch (err) { App.toast(err.message, "miss"); e.target.checked = !e.target.checked; }
    };
    body.querySelector("[data-out]").onclick = async () => {
      await App.api("/api/auth/logout", {});
      App.me = null;
      App.toast("Signed out");
      go("#/");
    };
  }

  App.auth = { signin, signup, forgot, reset, account };
})();
