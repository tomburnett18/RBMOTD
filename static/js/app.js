/* RBMOTD core: data loading, routing, shared UI pieces and the homepage. */
(function () {
  "use strict";

  const App = { data: {}, games: {}, cleanup: null };
  window.App = App;

  // ---------- Small helpers ----------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s ?? "").toLowerCase()
    .replace(/ø/g, "o").replace(/ł/g, "l").replace(/[ðđ]/g, "d").replace(/ı/g, "i").replace(/æ/g, "ae").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const fmt = n => Number(n).toLocaleString("en-GB");
  // Surname, keeping particles ("van Dijk", "De Bruyne") and Korean family-name-first order ("Park Ji-sung").
  const PARTICLES = new Set(["van", "von", "der", "den", "de", "di", "da", "dos", "du", "le", "la", "mac", "el"]);
  const surname = name => {
    const p = name.trim().split(/\s+/);
    if (p.length === 1) return p[0];
    if (/^[A-Z][a-z]{1,3} [A-Z][a-z]+-[a-z]+$/.test(name.trim())) return p[0];
    let i = p.length - 1;
    while (i > 1 && PARTICLES.has(p[i - 1].toLowerCase())) i--;
    if (i === 1 && PARTICLES.has(p[0].toLowerCase())) i = 0;
    return p.slice(i).join(" ");
  };
  const html = (strings, ...vals) => strings.reduce((s, str, i) => s + str + (i < vals.length ? vals[i] : ""), "");
  const el = (markup) => { const t = document.createElement("template"); t.innerHTML = markup.trim(); return t.content.firstElementChild; };

  Object.assign(App, { esc, norm, shuffle, pick, fmt, surname, html, el });

  // ---------- Icons ----------
  App.icon = {
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    silhouette: '<svg viewBox="0 0 100 110" aria-hidden="true"><path fill="rgba(244,247,241,.9)" d="M50 8c13 0 22 10 22 24 0 9-4 17-10 21l-1 5c14 3 28 9 33 20 3 7 4 18 4 32H2c0-14 1-25 4-32 5-11 19-17 33-20l-1-5c-6-4-10-12-10-21C28 18 37 8 50 8z"/></svg>'
  };

  // ---------- Data ----------
  const FILES = ["rbmotd", "gts11", "quiz", "fwordle", "imposter"];
  App.loadData = async () => {
    const res = await Promise.all(FILES.map(f => fetch(`/static/data/${f}.json`).then(r => r.json())));
    FILES.forEach((f, i) => App.data[f] = res[i]);
    // One shared directory of player names so dropdowns never give away the answer.
    const set = new Set();
    App.data.rbmotd.players.forEach(p => set.add(p.name));
    App.data.gts11.matches.forEach(m => [...m.homeXI, ...m.awayXI].flat().forEach(n => set.add(n)));
    App.data.imposter.players.forEach(p => set.add(p.name));
    App.directory = [...set].sort((a, b) => a.localeCompare(b));
  };

  // ---------- Toast ----------
  let toastTimer;
  App.toast = (msg, kind = "") => {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show " + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.className = "toast " + kind, 1900);
  };

  App.shake = node => { node.classList.remove("shake"); void node.offsetWidth; node.classList.add("shake"); };

  // ---------- Screen scaffold ----------
  App.screen = (title, extra = "") => {
    const view = document.getElementById("view");
    view.innerHTML = html`
      <header class="topbar">
        <button class="back" aria-label="Back to games" data-back>${App.icon.back}</button>
        <h1>${esc(title)}</h1>
        <div class="extra" data-extra>${extra}</div>
      </header>
      <section data-body class="stack"></section>`;
    view.querySelector("[data-back]").onclick = () => { location.hash = "#/"; };
    window.scrollTo(0, 0);
    return { body: view.querySelector("[data-body]"), extra: view.querySelector("[data-extra]") };
  };

  // Replace body content and scroll to top.
  App.render = (body, markup) => { body.innerHTML = markup; window.scrollTo(0, 0); return body; };

  // ---------- Mode picker ----------
  App.modePicker = (body, modes) => {
    App.render(body, `<div class="modes-list">${modes.map((m, i) => `
      <button class="mode" data-i="${i}" ${m.soon ? "disabled" : ""}>
        <strong>${esc(m.title)}${m.soon ? `<span class="soon">${esc(m.soon)}</span>` : ""}</strong>
        <span>${esc(m.desc)}</span>
      </button>`).join("")}</div>`);
    body.querySelectorAll(".mode").forEach(b => b.onclick = () => modes[+b.dataset.i].run());
  };

  // ---------- Segmented control / chips ----------
  App.seg = (container, options, value, onChange) => {
    container.classList.add("seg");
    container.innerHTML = options.map(o => `<button type="button" data-v="${esc(o.value)}" aria-pressed="${o.value === value}">${esc(o.label)}</button>`).join("");
    container.querySelectorAll("button").forEach(b => b.onclick = () => {
      container.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
      onChange(b.dataset.v);
    });
  };

  // ---------- Autocomplete ----------
  // Suggests from a list as you type; Enter or tapping a suggestion submits.
  App.autocomplete = (input, { list, onSubmit, max = 6, min = 2, up = false }) => {
    const box = document.createElement("ul");
    box.className = "ac" + (up ? " up" : "");
    box.setAttribute("role", "listbox");
    input.parentNode.appendChild(box);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "words");
    input.setAttribute("spellcheck", "false");
    let items = [], active = -1;

    const draw = () => {
      box.innerHTML = items.map((n, i) => `<li role="option" data-i="${i}" class="${i === active ? "on" : ""}">${esc(n)}</li>`).join("");
    };
    const close = () => { items = []; active = -1; draw(); };
    const submit = (val) => { const v = (val ?? input.value).trim(); if (!v) return; close(); onSubmit(v); };

    input.addEventListener("input", () => {
      const q = norm(input.value);
      if (q.length < min) return close();
      const src = typeof list === "function" ? list() : list;
      const starts = [], contains = [];
      for (const n of src) {
        const nn = norm(n);
        if (nn.startsWith(q) || nn.split(" ").some(p => p.startsWith(q))) starts.push(n);
        else if (q.length >= 3 && nn.includes(q)) contains.push(n);
        if (starts.length >= max) break;
      }
      items = [...starts, ...contains].slice(0, max);
      active = -1;
      draw();
    });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" && items.length) { active = (active + 1) % items.length; draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp" && items.length) { active = (active - 1 + items.length) % items.length; draw(); e.preventDefault(); }
      else if (e.key === "Enter") { e.preventDefault(); submit(active >= 0 ? items[active] : undefined); }
      else if (e.key === "Escape") close();
    });
    box.addEventListener("pointerdown", e => {
      const li = e.target.closest("li"); if (!li) return;
      e.preventDefault();
      const v = items[+li.dataset.i]; input.value = v; submit(v);
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    return { submit, close };
  };

  // Does a guess match a name? Accepts full name, aliases, or the surname alone.
  App.nameMatches = (guess, name, aliases = []) => {
    const g = norm(guess); if (!g) return false;
    const full = norm(name);
    if (g === full || aliases.some(a => norm(a) === g)) return true;
    const sur = norm(surname(name));
    if (g === sur && sur.length > 2) return true;
    const last = full.split(" ").pop();
    return g === last && last.length > 3;
  };

  // ---------- Player names setup ----------
  App.nameSetup = (body, { title, min = 2, max = 8, start = 2, extraHTML = "", button = "Start", onStart }) => {
    const saved = (() => { try { return JSON.parse(localStorage.getItem("rbmotd.names") || "[]"); } catch { return []; } })();
    let names = saved.length >= start ? saved.slice(0, Math.max(start, Math.min(saved.length, max))) : Array.from({ length: start }, (_, i) => saved[i] || "");

    App.render(body, html`
      <div class="stack">
        <h3>${esc(title)}</h3>
        <div class="names" data-names></div>
        <button class="btn ghost sm" data-add>${App.icon.plus} Add player</button>
        ${extraHTML}
        <button class="btn block" data-go>${esc(button)}</button>
      </div>`);
    const list = body.querySelector("[data-names]");
    const addBtn = body.querySelector("[data-add]");
    const draw = () => {
      list.innerHTML = names.map((n, i) => `
        <div class="row">
          <input class="input grow" maxlength="16" placeholder="Player ${i + 1}" value="${esc(n)}" data-i="${i}" aria-label="Player ${i + 1} name">
          ${names.length > min ? `<button class="icon-btn" data-rm="${i}" aria-label="Remove player ${i + 1}">${App.icon.x}</button>` : ""}
        </div>`).join("");
      list.querySelectorAll("input").forEach(inp => inp.oninput = () => names[+inp.dataset.i] = inp.value);
      list.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { names.splice(+b.dataset.rm, 1); draw(); });
      addBtn.classList.toggle("hidden", names.length >= max);
    };
    addBtn.onclick = () => { names.push(""); draw(); list.querySelector(`[data-i="${names.length - 1}"]`).focus(); };
    body.querySelector("[data-go]").onclick = () => {
      const clean = names.map((n, i) => n.trim() || `Player ${i + 1}`);
      const lower = clean.map(n => n.toLowerCase());
      if (new Set(lower).size !== lower.length) return App.toast("Give each player a different name", "miss");
      try { localStorage.setItem("rbmotd.names", JSON.stringify(clean)); } catch { }
      onStart(clean, body);
    };
    draw();
  };

  // ---------- Pass the phone ----------
  App.passTo = (name, note = "Tap when you've got the phone.") => new Promise(resolve => {
    const o = el(html`
      <div class="pass" role="dialog" aria-modal="true">
        <div>
          <p style="margin-bottom:0">Pass the phone to</p>
          <div class="who">${esc(name)}</div>
          <p>${esc(note)}</p>
          <button class="btn flag">I'm ${esc(name)}</button>
        </div>
      </div>`);
    document.body.appendChild(o);
    o.querySelector("button").focus();
    o.querySelector("button").onclick = () => { o.remove(); resolve(); };
  });

  // ---------- Router ----------
  const routes = {
    "": renderHome,
    rbmotd: b => App.games.rbmotd.mount(b),
    gts11: b => App.games.gts11.mount(b),
    quiz: b => App.games.quiz.mount(b),
    fwordle: b => App.games.fwordle.mount(b),
    imposter: b => App.games.imposter.mount(b)
  };
  App.onLeave = fn => { App.cleanup = fn; };
  function route() {
    if (typeof App.cleanup === "function") { try { App.cleanup(); } catch { } }
    App.cleanup = null;
    document.querySelectorAll(".pass").forEach(n => n.remove());
    const key = location.hash.replace(/^#\/?/, "").split("/")[0];
    (routes[key] || renderHome)();
  }

  // ---------- Homepage ----------
  const GAMES = [
    { hash: "fwordle", name: "FWORDLE", desc: "Football Wordle. Guess the surname in six tries.", modes: "Daily, practice" },
    { hash: "gts11", name: "Guess the XI", desc: "One line-up is on the pitch. Name the other eleven.", modes: "Solo, 2-player pass the phone" },
    { hash: "quiz", name: "Pub Quiz", desc: "Ten questions. Faster right answers score more.", modes: "Solo, pass the phone" },
    { hash: "imposter", name: "Imposter", desc: "Everyone gets the same player except the imposter.", modes: "Pass the phone, 3+ players" }
  ];

  function renderHome() {
    const view = document.getElementById("view");
    view.innerHTML = html`
      <header class="hero">
        <div class="hero-circle" aria-hidden="true"></div>
        <h1 class="wordmark">RBMOTD<span class="dot">.</span></h1>
        <p>Football games for you and your mates at the pub.</p>
      </header>

      <a class="daily" href="#/rbmotd">
        <div class="sil">${App.icon.silhouette}</div>
        <div>
          <h2>Random Barclays Man of the Day</h2>
          <p>Name a forgotten Premier League player. Quicker guesses score more.</p>
          <span class="go">Play</span>
        </div>
      </a>

      <div class="sheet-title">More games</div>
      <ul class="games">
        ${GAMES.map(g => html`
          <li><a href="#/${g.hash}">
            <span class="name">${esc(g.name)}</span>
            <span class="chev">${App.icon.chev}</span>
            <span class="desc">${esc(g.desc)}</span>
            <span class="modes">${esc(g.modes)}</span>
          </a></li>`).join("")}
      </ul>
      <p class="foot">Add RBMOTD to your home screen to play like an app.</p>`;
    window.scrollTo(0, 0);
  }

  App.start = async () => {
    const view = document.getElementById("view");
    view.innerHTML = '<p class="muted" style="padding-top:40vh;text-align:center">Loading…</p>';
    try {
      await App.loadData();
    } catch (e) {
      view.innerHTML = '<p style="padding-top:35vh;text-align:center">Couldn\'t load the game data. Check your connection and reload.</p>';
      return;
    }
    window.addEventListener("hashchange", route);
    route();
  };
})();
