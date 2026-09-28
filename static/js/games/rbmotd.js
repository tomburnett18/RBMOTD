/* RBMOTD – Random Barclays Man of the Day.
   Daily: one official player, scored and timed on the server, on the leaderboard.
   Practice: unlimited players, nothing saved.
   Scoring both ways: start on 1,000 and lose 10 points a second. */
(function () {
  "use strict";
  const { esc, html, norm, shuffle, fmt, surname } = App;

  // Start on 1,000, lose 10 for every second taken. Nothing after 100 seconds.
  const points = secs => Math.max(0, 1000 - 10 * Math.floor(secs));
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

  let dailyDesc = "One official player a day, at a surprise time. Scores go on the leaderboard.";

  async function mount() {
    const { body } = App.screen("RBMOTD");
    App.render(body, `<p class="muted">Loading…</p>`);
    let d = null;
    try { d = await App.api("/api/daily"); } catch { }
    if (d && !d.live) dailyDesc = "Hasn't dropped yet today. You'll get an email the moment he does.";
    else if (d && !App.me) dailyDesc = "Live now. Sign in to play and get on the leaderboard.";
    else if (d && d.attempt && d.attempt.finished) dailyDesc = d.attempt.solved
      ? `Done: ${fmt(d.attempt.points)} points in ${Math.round(d.attempt.seconds)}s.` : "Done for today.";
    else if (d && d.attempt) dailyDesc = "Your clock is running. Carry on.";
    else if (d) dailyDesc = "Live now. 1,000 points, minus 10 a second.";
    App.modePicker(body, [
      { title: "Today's player", desc: dailyDesc, run: () => daily(body) },
      { title: "Practice", desc: "Keep going through players. Scores aren't saved.", run: () => practice(body) }
    ]);
  }

  function practice(body) {
    // Only players with a photo are used; before photos are downloaded, fall back to everyone.
    const withPhotos = App.data.rbmotd.players.filter(p => p.image);
    const pool = withPhotos.length ? withPhotos : App.data.rbmotd.players;
    let queue = shuffle(pool);
    let session = 0, played = 0, timer = null;
    App.onLeave(() => clearInterval(timer));

    const next = () => {
      if (!queue.length) queue = shuffle(pool);
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
        ${p.image && p.credit ? `<p class="credit">${esc(p.credit)}${p.source ? ` <a href="${esc(p.source)}" target="_blank" rel="noopener">Source</a>` : ""}</p>` : ""}
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
            ${p.image ? `<img class="reveal-photo" src="${esc(p.image)}" alt="${esc(p.name)}">` : ""}
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

  // ---------------- Today's player (server-scored) ----------------
  async function daily(body) {
    let timer = null;
    App.onLeave(() => clearInterval(timer));
    App.render(body, `<p class="muted">Loading…</p>`);

    let d;
    try { d = await App.api("/api/daily"); }
    catch (e) { return App.render(body, `<div class="panel"><p>${esc(e.message)}</p></div>`); }

    if (!d.live) return waiting(body);
    if (!App.me) {
      App.after = "#/rbmotd";
      App.render(body, html`
        <div class="panel stack-sm"><h3>Today's player is live</h3>
          <p class="muted">Sign in so your score counts on the leaderboard. The clock only starts when you choose to start.</p></div>
        <a class="btn block" href="#/signin">Sign in</a>
        <a class="btn ghost block" href="#/signup">Create an account</a>
        <button class="btn ghost block" data-prac>Practice instead</button>`);
      body.querySelector("[data-prac]").onclick = () => practice(body);
      return;
    }
    if (d.attempt && d.attempt.finished) return result(body, d.attempt);
    if (d.attempt) return playing(body, d.attempt);

    App.render(body, html`
      <div class="panel stack-sm center">
        <h3>Today's player is live</h3>
        <p class="muted">You start on 1,000 points and lose 10 for every second you take, so don't tap until you're ready.</p>
      </div>
      <button class="btn block flag" data-start>Start the clock</button>
      <button class="btn ghost block" data-prac>Practice instead</button>`);
    body.querySelector("[data-prac]").onclick = () => practice(body);
    body.querySelector("[data-start]").onclick = async e => {
      e.target.disabled = true;
      try { playing(body, (await App.api("/api/daily/start", {})).attempt); }
      catch (err) { App.toast(err.message, "miss"); e.target.disabled = false; }
    };

    function waiting(target) {
      App.render(target, html`
        <div class="panel stack-sm center">
          <div class="sil-big">${App.icon.silhouette}</div>
          <h3>Not yet</h3>
          <p class="muted">Today's player drops at a surprise time between 9:30am and 4:30pm, never over lunch. Everyone gets him at the same moment, and you'll get an email.</p>
        </div>
        <button class="btn block flag" data-prac2>Play a practice round</button>
        <a class="btn ghost block" href="#/leaderboard">Leaderboard</a>`);
      target.querySelector("[data-prac2]").onclick = () => practice(target);
    }

    function playing(target, attempt) {
      clearInterval(timer);
      const startedAgo = attempt.seconds;          // seconds already on the clock, from the server
      const t0 = performance.now();
      const elapsed = () => startedAgo + (performance.now() - t0) / 1000;
      let confirming = false;

      App.render(target, html`
        <div class="panel mystery">
          <div class="frame">${attempt.image ? `<img src="${esc(attempt.image)}" alt="Today's mystery player">` : App.icon.silhouette}</div>
          <div class="stack-sm">
            <div class="muted small">Today's player</div>
            <div class="clock" data-clock>00:00</div>
            <div class="small"><span class="muted">Worth</span> <b data-worth>1,000</b> <span class="muted">points</span></div>
          </div>
        </div>
        ${attempt.credit ? `<p class="credit">${esc(attempt.credit)}</p>` : ""}
        <div class="field"><input class="input" data-in placeholder="Start typing a player…" aria-label="Your guess"></div>
        <div class="row"><button class="btn grow" data-guess>Guess</button><button class="btn ghost" data-give>Give up</button></div>
        <ul class="hints" data-hints>${attempt.hints.map(h => `<li><b>${esc(h.k)}:</b> ${esc(h.v)}</li>`).reverse().join("")}</ul>
        <p class="muted small center">Wrong guesses unlock hints and cost you nothing but time.</p>`);

      const input = target.querySelector("[data-in]");
      const hintList = target.querySelector("[data-hints]");
      const give = target.querySelector("[data-give]");
      timer = setInterval(() => {
        const s = elapsed();
        target.querySelector("[data-clock]").textContent = clock(s);
        target.querySelector("[data-worth]").textContent = fmt(points(s));
      }, 500);

      const ac = App.autocomplete(input, { list: () => App.directory, onSubmit: send });
      target.querySelector("[data-guess]").onclick = () => ac.submit();
      give.onclick = () => {
        if (!confirming) {
          confirming = true;
          give.textContent = "Sure? 0 points";
          setTimeout(() => { confirming = false; give.textContent = "Give up"; }, 4000);
          return;
        }
        App.api("/api/daily/giveup", {}).then(r => { clearInterval(timer); result(target, r.attempt); },
          e => App.toast(e.message, "miss"));
      };

      async function send(v) {
        let r;
        try { r = await App.api("/api/daily/guess", { guess: v }); }
        catch (e) { return App.toast(e.message, "miss"); }
        if (r.correct) { clearInterval(timer); return result(target, r.attempt); }
        input.value = "";
        App.shake(input);
        if (r.hint) {
          hintList.insertAdjacentHTML("afterbegin", `<li class="pop"><b>${esc(r.hint.k)}:</b> ${esc(r.hint.v)}</li>`);
          App.toast("Not him. Here's a hint.", "miss");
        } else App.toast("Not him. No hints left.", "miss");
        input.focus();
      }
      setTimeout(() => input.focus(), 50);
    }

    function result(target, a) {
      clearInterval(timer);
      const p = a.player;
      App.render(target, html`
        <div class="panel stack-sm">
          <div class="muted">${a.solved ? `You got today's player in ${Math.round(a.seconds)}s${a.guesses > 1 ? `, ${a.guesses} guesses` : ""}` : "Today's player was"}</div>
          ${p.image ? `<img class="reveal-photo" src="${esc(p.image)}" alt="${esc(p.name)}">` : ""}
          <div class="reveal-name">${esc(p.name)}</div>
          <div class="small muted">${esc(p.nationality)} ${esc(p.position.toLowerCase())}</div>
          <div class="small">${esc(p.clubs.join(", "))}</div>
          <div class="small muted">${esc(p.fact)}</div>
          <div class="kv"><span class="muted">Points</span><span class="big">${fmt(a.points)}</span></div>
          ${a.rank ? `<p class="muted small">${App.ordinal(a.rank)} of ${a.of} so far today.</p>` : ""}
        </div>
        <a class="btn block flag" href="#/leaderboard">Leaderboard</a>
        <button class="btn ghost block" data-prac3>Practice rounds</button>`);
      target.querySelector("[data-prac3]").onclick = () => practice(target);
    }
  }

  App.games.rbmotd = { mount, points };
})();
