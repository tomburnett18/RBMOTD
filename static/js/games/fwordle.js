/* FWORDLE – Wordle with footballers' surnames.
   Five letters, six guesses. Green = right letter, right spot. Yellow = in the name, wrong spot.
   One daily puzzle (the same for everyone, UK date) plus unlimited practice. */
(function () {
  "use strict";
  const { esc, html, shuffle } = App;
  const LEN = 5, TRIES = 6;
  const LAUNCH = "2026-09-22"; // FWORDLE #1
  const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

  // ---------- Dates & the daily word ----------
  const ukDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const dayNumber = day => Math.round((Date.parse(day + "T12:00:00Z") - Date.parse(LAUNCH + "T12:00:00Z")) / 86400000) + 1;

  // Fixed-seed shuffle so every phone gets the same order.
  function seeded(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function dailyOrder() {
    const a = App.data.fwordle.answers.slice().sort((x, y) => x.word.localeCompare(y.word));
    const rnd = seeded(20260923);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function dailyAnswer(day) {
    const order = dailyOrder();
    const n = Math.max(1, dayNumber(day));
    return order[(n - 1) % order.length];
  }

  // ---------- Scoring a guess (handles repeated letters like Wordle) ----------
  function score(guess, answer) {
    const res = Array(LEN).fill("absent");
    const left = {};
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === answer[i]) res[i] = "correct";
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
      if (res[i] !== "correct" && left[guess[i]]) { res[i] = "present"; left[guess[i]]--; }
    }
    return res;
  }

  // ---------- Storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fwordle." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fwordle." + k, JSON.stringify(v)); } catch { } }
  };
  const emptyStats = () => ({ played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], lastDay: null, lastWinDay: null });

  function recordDaily(day, won, tries) {
    const s = store.get("stats", emptyStats());
    if (s.lastDay === day) return s;
    const n = dayNumber(day);
    s.played++;
    s.lastDay = day;
    if (won) {
      s.wins++;
      s.dist[tries - 1]++;
      s.streak = s.lastWinDay && dayNumber(s.lastWinDay) === n - 1 ? s.streak + 1 : 1;
      s.best = Math.max(s.best, s.streak);
      s.lastWinDay = day;
    } else {
      s.streak = 0;
    }
    store.set("stats", s);
    return s;
  }

  // ---------- Screens ----------
  let cleanupKeys = null;
  function mount() {
    const { body } = App.screen("FWORDLE");
    App.onLeave(() => cleanupKeys && cleanupKeys());
    const day = ukDate();
    const saved = store.get("day." + day, null);
    const status = saved?.done ? (saved.won ? `Solved in ${saved.guesses.length}. Come back tomorrow.` : "Missed today's. Come back tomorrow.") : "Same name for everyone. New one at midnight.";
    App.modePicker(body, [
      { title: `Today's FWORDLE #${dayNumber(day)}`, desc: status, run: () => play(body, "daily") },
      { title: "Practice", desc: "Play as many as you like. Doesn't affect your streak.", run: () => play(body, "practice") },
      { title: "How to play", desc: "Guess the surname in six tries.", run: () => rules(body) }
    ]);
  }

  function rules(body) {
    const tile = (l, st) => `<span class="fw-tile sm ${st}">${l}</span>`;
    App.render(body, html`
      <div class="panel stack">
        <h3>How to play</h3>
        <p>Guess the footballer's surname in six tries. Every guess must be a five-letter footballer's surname.</p>
        <div class="stack-sm">
          <div class="fw-ex">${[..."KEANE"].map((l, i) => tile(l, i === 0 ? "correct" : "")).join("")}</div>
          <p class="small"><b>K</b> is in the name and in the right spot.</p>
          <div class="fw-ex">${[..."SALAH"].map((l, i) => tile(l, i === 1 ? "present" : "")).join("")}</div>
          <p class="small"><b>A</b> is in the name but in the wrong spot.</p>
          <div class="fw-ex">${[..."TERRY"].map((l, i) => tile(l, i === 3 ? "absent" : "")).join("")}</div>
          <p class="small"><b>R</b> isn't in the name at all.</p>
        </div>
        <p class="muted small">Accents are ignored, so Kanté is KANTE. The daily name is the same for everyone and changes at midnight UK time.</p>
      </div>
      <button class="btn block" data-back2>Back</button>`);
    body.querySelector("[data-back2]").onclick = mount;
  }

  function play(body, mode) {
    const day = ukDate();
    const valid = new Set(App.data.fwordle.valid);
    let answer, guesses = [], done = false, won = false;

    if (mode === "daily") {
      answer = dailyAnswer(day);
      const saved = store.get("day." + day, null);
      if (saved && saved.word === answer.word) { guesses = saved.guesses; done = saved.done; won = saved.won; }
    } else {
      const today = dailyAnswer(day).word;
      const recent = store.get("practiceRecent", []);
      let pool = App.data.fwordle.answers.filter(a => a.word !== today && !recent.includes(a.word));
      if (!pool.length) pool = App.data.fwordle.answers.filter(a => a.word !== today);
      answer = App.pick(pool);
      store.set("practiceRecent", [answer.word, ...recent].slice(0, 30));
    }
    const target = answer.word;
    let current = "";

    App.render(body, html`
      <div class="fw-head"><span class="muted small">${mode === "daily" ? `Daily #${dayNumber(day)}` : "Practice"}</span><button class="btn ghost sm" data-stats>Stats</button></div>
      <div class="fw-board" data-board>${Array.from({ length: TRIES }, (_, r) => `<div class="fw-row" data-row="${r}">${Array.from({ length: LEN }, () => `<div class="fw-tile"></div>`).join("")}</div>`).join("")}</div>
      <div data-end></div>
      <div class="fw-keys" data-keys>
        ${ROWS.map((row, i) => `<div class="fw-krow">${i === 2 ? `<button class="fw-key wide" data-k="ENTER">Enter</button>` : ""}${[...row].map(k => `<button class="fw-key" data-k="${k}">${k}</button>`).join("")}${i === 2 ? `<button class="fw-key wide" data-k="BACK" aria-label="Delete">⌫</button>` : ""}</div>`).join("")}
      </div>`);

    const board = body.querySelector("[data-board]");
    const keys = body.querySelector("[data-keys]");
    const endBox = body.querySelector("[data-end]");
    body.querySelector("[data-stats]").onclick = () => showStats(body, mode === "daily" && done ? { won, tries: guesses.length } : null);
    const rowEl = r => board.querySelector(`[data-row="${r}"]`);

    function paintRow(r, word, result, animate) {
      const tiles = rowEl(r).children;
      for (let i = 0; i < LEN; i++) {
        const t = tiles[i];
        t.textContent = word[i] || "";
        t.classList.toggle("filled", !!word[i]);
        if (result) {
          if (animate) {
            t.style.animationDelay = `${i * 250}ms`;
            t.classList.add("flip");
            setTimeout(() => t.classList.add(result[i]), i * 250 + 250);
          } else t.classList.add(result[i]);
        }
      }
    }
    function paintKeys() {
      const rank = { absent: 1, present: 2, correct: 3 };
      const best = {};
      guesses.forEach(g => score(g, target).forEach((st, i) => { if (!best[g[i]] || rank[st] > rank[best[g[i]]]) best[g[i]] = st; }));
      keys.querySelectorAll("[data-k]").forEach(b => {
        b.classList.remove("correct", "present", "absent");
        if (best[b.dataset.k]) b.classList.add(best[b.dataset.k]);
      });
    }
    function save() {
      if (mode === "daily") store.set("day." + day, { word: target, guesses, done, won });
    }

    function submit() {
      if (done) return;
      if (current.length < LEN) { App.toast("Not enough letters", "miss"); App.shake(rowEl(guesses.length)); return; }
      if (!valid.has(current)) { App.toast("Not in the player list", "miss"); App.shake(rowEl(guesses.length)); return; }
      const r = guesses.length;
      guesses.push(current);
      const result = score(current, target);
      paintRow(r, current, result, true);
      current = "";
      won = result.every(x => x === "correct");
      done = won || guesses.length === TRIES;
      save();
      setTimeout(() => {
        paintKeys();
        if (done) finish(true);
      }, LEN * 250 + 300);
    }

    function type(k) {
      if (done) return;
      if (k === "ENTER") return submit();
      if (k === "BACK") current = current.slice(0, -1);
      else if (/^[A-Z]$/.test(k) && current.length < LEN) current += k;
      paintRow(guesses.length, current, null, false);
    }

    function finish(fresh) {
      let stats = null;
      if (mode === "daily" && fresh) stats = recordDaily(day, won, guesses.length);
      const praise = ["Genius", "Magnificent", "Impressive", "Splendid", "Great", "Phew"];
      if (fresh) App.toast(won ? praise[guesses.length - 1] : target);
      endBox.innerHTML = html`
        <div class="panel stack-sm fw-end pop">
          <div class="kv"><span class="verdict ${won ? "hit" : "miss"}">${won ? `${guesses.length}/6` : "X/6"}</span><span class="muted small">${mode === "daily" ? `Daily #${dayNumber(day)}` : "Practice"}</span></div>
          <p>The answer was <b>${esc(target)}</b></p>
          <p class="muted small">${esc(answer.players)}</p>
          <div class="row wrap">
            ${mode === "daily" ? `<button class="btn sm flag" data-share>Share</button><button class="btn sm ghost" data-st>Stats</button><button class="btn sm ghost" data-prac>Practice</button>`
          : `<button class="btn sm flag" data-again>Next name</button><button class="btn sm ghost" data-menu>Menu</button>`}
          </div>
        </div>`;
      keys.classList.add("hidden");
      endBox.querySelector("[data-share]")?.addEventListener("click", share);
      endBox.querySelector("[data-st]")?.addEventListener("click", () => showStats(body, { won, tries: guesses.length }));
      endBox.querySelector("[data-prac]")?.addEventListener("click", () => play(body, "practice"));
      endBox.querySelector("[data-again]")?.addEventListener("click", () => play(body, "practice"));
      endBox.querySelector("[data-menu]")?.addEventListener("click", mount);
      if (stats) setTimeout(() => showStats(body, { won, tries: guesses.length }), 900);
    }

    function share() {
      const grid = guesses.map(g => score(g, target).map(s => s === "correct" ? "🟩" : s === "present" ? "🟨" : "⬛").join("")).join("\n");
      const text = `FWORDLE #${dayNumber(day)} ${won ? guesses.length : "X"}/6\n\n${grid}`;
      if (navigator.share) navigator.share({ text }).catch(() => { });
      else navigator.clipboard?.writeText(text).then(() => App.toast("Copied to clipboard"), () => App.toast("Couldn't copy", "miss"));
    }

    // Restore a daily game already in progress / finished.
    guesses.forEach((g, r) => paintRow(r, g, score(g, target), false));
    paintKeys();
    if (done) finish(false);

    keys.addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) type(b.dataset.k); });
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".fw-modal")) return;
      if (e.key === "Enter") { e.preventDefault(); type("ENTER"); }
      else if (e.key === "Backspace") type("BACK");
      else if (/^[a-z]$/i.test(e.key)) type(e.key.toUpperCase());
    };
    if (cleanupKeys) cleanupKeys();
    document.addEventListener("keydown", onKey);
    cleanupKeys = () => { document.removeEventListener("keydown", onKey); cleanupKeys = null; };
  }

  function showStats(body, today) {
    const s = store.get("stats", emptyStats());
    const max = Math.max(1, ...s.dist);
    const o = App.el(html`
      <div class="pass fw-modal" role="dialog" aria-modal="true">
        <div class="panel stack" style="width:100%;max-width:420px;text-align:left">
          <div class="kv"><h3>Statistics</h3><button class="icon-btn" data-x aria-label="Close">${App.icon.x}</button></div>
          <div class="fw-stats">
            <div><b>${s.played}</b><span>Played</span></div>
            <div><b>${s.played ? Math.round(100 * s.wins / s.played) : 0}</b><span>Win %</span></div>
            <div><b>${s.streak}</b><span>Streak</span></div>
            <div><b>${s.best}</b><span>Best</span></div>
          </div>
          <div class="stack-sm">
            <div class="muted small">Guess distribution (daily only)</div>
            ${s.dist.map((n, i) => `<div class="fw-bar"><span>${i + 1}</span><i class="${today && today.won && today.tries === i + 1 ? "on" : ""}" style="width:${Math.max(8, 100 * n / max)}%">${n}</i></div>`).join("")}
          </div>
          <p class="muted small" data-next></p>
        </div>
      </div>`);
    document.body.appendChild(o);
    const nextEl = o.querySelector("[data-next]");
    const tick = () => {
      // Time until midnight UK.
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const g = t => +parts.find(p => p.type === t).value;
      const left = 86400 - (g("hour") * 3600 + g("minute") * 60 + g("second"));
      const hh = String(Math.floor(left / 3600)).padStart(2, "0"), mm = String(Math.floor(left % 3600 / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
      nextEl.textContent = `Next daily FWORDLE in ${hh}:${mm}:${ss}`;
    };
    tick();
    const t = setInterval(tick, 1000);
    const close = () => { clearInterval(t); o.remove(); };
    o.querySelector("[data-x]").onclick = close;
    o.addEventListener("click", e => { if (e.target === o) close(); });
  }

  App.games.fwordle = { mount, score, dailyAnswer, dayNumber };
})();
