/* RBMOTD – Random Barclays Man of the Day.
   Phase 1: practice mode (unlimited players, not on the leaderboard).
   The timed daily game arrives with accounts in Phase 2. */
(function () {
  "use strict";
  const { esc, html, norm, shuffle, fmt, surname } = App;

  // 1000 points within a minute, falling steadily to 100 at one hour.
  const points = secs => {
    if (secs <= 60) return 1000;
    if (secs >= 3600) return 100;
    return Math.round((1000 - 900 * (secs - 60) / 3540) / 10) * 10;
  };
  const clock = secs => {
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return m >= 60 ? "60:00+" : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Hints come out one per wrong guess, from vague to specific.
  function buildHints(p) {
    const first = p.name.split(/\s+/)[0];
    const sur = surname(p.name);
    const oneName = !p.name.includes(" ");
    const h = [
      { k: "Position", v: p.position },
      { k: "Nationality", v: p.nationality },
      { k: "Played for", v: p.clubs[p.clubs.length - 1] },
      { k: "Fact", v: p.fact },
      { k: "Also played for", v: p.clubs.length > 1 ? p.clubs.slice(0, -1).join(", ") : p.clubs[0] },
      oneName ? { k: "Name", v: `One name, starts with ${p.name[0]}` } : { k: "Surname starts with", v: sur[0] },
      oneName ? { k: "Name length", v: `${p.name.length} letters` } : { k: "First name starts with", v: first[0] },
      { k: "Letters in the name", v: `${norm(p.name).replace(/ /g, "").length}` }
    ];
    return h;
  }

  function mount() {
    const { body } = App.screen("RBMOTD");
    App.modePicker(body, [
      { title: "Today's player", desc: "One official player a day, at a surprise time. Scores go on the leaderboard.", soon: "Coming soon", run: () => { } },
      { title: "Practice", desc: "Keep going through players. Scores aren't saved.", run: () => practice(body) }
    ]);
  }

  function practice(body) {
    let queue = shuffle(App.data.rbmotd.players);
    let session = 0, played = 0, timer = null;
    App.onLeave(() => clearInterval(timer));

    const next = () => {
      if (!queue.length) queue = shuffle(App.data.rbmotd.players);
      round(queue.pop());
    };

    function round(p) {
      clearInterval(timer);
      const hints = buildHints(p);
      let shown = 0, guesses = 0;
      const start = Date.now();

      App.render(body, html`
        <div class="panel mystery">
          <div class="frame">${p.image ? `<img src="${esc(p.image)}" alt="Mystery player">` : App.icon.silhouette}</div>
          <div class="stack-sm">
            <div class="muted small">Premier League, 2000s onwards</div>
            <div class="clock" data-clock>00:00</div>
            <div class="small"><span class="muted">Worth</span> <b data-worth>1,000</b> <span class="muted">points</span></div>
          </div>
        </div>
        ${p.image && p.credit ? `<p class="credit">${esc(p.credit)}</p>` : ""}
        <div class="field">
          <input class="input" data-in placeholder="Start typing a player…" aria-label="Your guess">
        </div>
        <div class="row">
          <button class="btn grow" data-guess>Guess</button>
          <button class="btn ghost" data-give>Give up</button>
        </div>
        <ul class="hints" data-hints></ul>
        <p class="muted small center">${played ? `Practice total: ${fmt(session)} from ${played} player${played > 1 ? "s" : ""}` : "Wrong guesses unlock hints."}</p>`);

      const input = body.querySelector("[data-in]");
      const hintList = body.querySelector("[data-hints]");
      const tick = () => {
        const s = (Date.now() - start) / 1000;
        body.querySelector("[data-clock]").textContent = clock(s);
        body.querySelector("[data-worth]").textContent = fmt(points(s));
      };
      timer = setInterval(tick, 500);

      const ac = App.autocomplete(input, {
        list: () => App.directory,
        onSubmit: v => check(v)
      });
      body.querySelector("[data-guess]").onclick = () => ac.submit();
      body.querySelector("[data-give]").onclick = () => finish(false);

      function check(v) {
        guesses++;
        if (App.nameMatches(v, p.name, p.aka)) return finish(true);
        input.value = "";
        App.shake(input);
        if (shown < hints.length) {
          const h = hints[shown++];
          hintList.insertAdjacentHTML("afterbegin", `<li class="pop"><b>${esc(h.k)}:</b> ${esc(h.v)}</li>`);
          App.toast("Not him. Here's a hint.", "miss");
        } else {
          App.toast("Not him. No hints left.", "miss");
        }
        input.focus();
      }

      function finish(won) {
        clearInterval(timer);
        const secs = (Date.now() - start) / 1000;
        const pts = won ? points(secs) : 0;
        played++; session += pts;
        App.render(body, html`
          <div class="panel stack">
            <div class="muted">${won ? `Got him in ${clock(secs)}${guesses > 1 ? `, ${guesses} guesses` : ""}` : "It was"}</div>
            <div class="reveal-name">${esc(p.name)}</div>
            <div class="small muted">${esc(p.nationality)} ${esc(p.position.toLowerCase())}</div>
            <div class="small">${esc(p.clubs.join(", "))}</div>
            <div class="small muted">${esc(p.fact)}</div>
            <div class="kv"><span class="muted">Points</span><span class="big">${fmt(pts)}</span></div>
          </div>
          <button class="btn block flag" data-next>Next player</button>
          <p class="muted small center">Practice total: ${fmt(session)} from ${played} player${played > 1 ? "s" : ""}. Not saved to the leaderboard.</p>`);
        body.querySelector("[data-next]").onclick = next;
      }
      setTimeout(() => input.focus(), 50);
    }
    next();
  }

  App.games.rbmotd = { mount, points };
})();
