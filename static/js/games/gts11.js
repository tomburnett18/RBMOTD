/* GTS11 – Guess the Starting XI. Solo (easy/medium/hard) and 1v1 pass the phone. */
(function () {
  "use strict";
  const { esc, html, norm, shuffle, surname } = App;

  const DIFFS = [{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }];
  const seen = new Set(); // matches already played this session

  const niceDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  function drawMatch(diff, avoid = []) {
    const all = App.data.gts11.matches.filter(m => m.difficulty === diff);
    let pool = all.filter(m => !seen.has(m.id) && !avoid.includes(m.id));
    if (!pool.length) { all.forEach(m => seen.delete(m.id)); pool = all.filter(m => !avoid.includes(m.id)); }
    if (!pool.length) pool = App.data.gts11.matches.filter(m => !avoid.includes(m.id));
    const m = App.pick(pool);
    seen.add(m.id);
    return m;
  }

  // A board = one match with one side hidden.
  function newBoard(match) {
    const hide = Math.random() < .5 ? "home" : "away";
    return { match, hide, got: new Set(), gaveUp: false };
  }
  const hiddenXI = b => (b.hide === "home" ? b.match.homeXI : b.match.awayXI);
  const shownXI = b => (b.hide === "home" ? b.match.awayXI : b.match.homeXI);
  const hiddenTeam = b => (b.hide === "home" ? b.match.home : b.match.away);
  const shownTeam = b => (b.hide === "home" ? b.match.away : b.match.home);
  const score = b => b.got.size;

  // Returns {ok, name, msg}
  function guess(b, text) {
    const players = hiddenXI(b).flat();
    const g = norm(text);
    const exact = players.filter(n => norm(n) === g);
    const cands = exact.length ? exact : players.filter(n => App.nameMatches(text, n));
    if (!cands.length) return { ok: false, msg: `Not in the ${hiddenTeam(b)} XI` };
    const fresh = cands.filter(n => !b.got.has(n));
    if (!fresh.length) return { ok: false, repeat: true, msg: "Already got him" };
    if (fresh.length > 1) return { ok: false, repeat: true, msg: "More than one fits. Use their full name." };
    b.got.add(fresh[0]);
    return { ok: true, name: fresh[0] };
  }

  function headHTML(m) {
    return html`
      <div class="match-head">
        <div class="comp">${esc(m.comp)}, ${esc(niceDate(m.date))}</div>
        <div class="score">${esc(m.home)} ${esc(m.score)} ${esc(m.away)}</div>
        ${m.note ? `<div class="note">${esc(m.note)}</div>` : ""}
      </div>`;
  }

  function pitchHTML(b) {
    const initial = n => esc(surname(n).replace(/^(van der |van |de |di |da )/i, "")[0] || "?");
    const row = (r, hidden) => `<div class="line-row">${r.map(n => {
      const got = b.got.has(n);
      const show = !hidden || got || b.gaveUp;
      const cls = hidden ? (got ? "got" : b.gaveUp ? "gaveup" : "") : "";
      return `<div class="pl ${cls}"><div class="shirt">${show ? initial(n) : "?"}</div>${show ? `<div class="nm" title="${esc(n)}">${esc(surname(n))}</div>` : `<div class="blank"></div>`}</div>`;
    }).join("")}</div>`;
    return html`
      <div class="pitch">
        <div class="half top">
          <div class="team-label">${esc(shownTeam(b))}</div>
          ${shownXI(b).map(r => row(r, false)).join("")}
        </div>
        <div class="half bottom hide">
          ${hiddenXI(b).slice().reverse().map(r => row(r, true)).join("")}
          <div class="team-label">${esc(hiddenTeam(b))}, guess this XI</div>
        </div>
      </div>`;
  }

  function mount() {
    const { body } = App.screen("Guess the XI");
    App.modePicker(body, [
      { title: "Solo", desc: "Play as many matches as you like.", run: () => soloSetup(body) },
      { title: "1v1 pass the phone", desc: "Two matches, one guess each per turn. First to a full XI wins.", run: () => duelSetup(body) }
    ]);
  }

  function diffHTML() {
    return `<div><span class="label">Difficulty</span><div data-diff></div>
      <p class="muted small" style="margin-top:8px">Easy is recent, big games. Hard is older and more obscure.</p></div>`;
  }

  // ---------------- Solo ----------------
  function soloSetup(body) {
    let diff = "easy";
    App.render(body, `<div class="stack">${diffHTML()}<button class="btn block" data-go>Start</button></div>`);
    App.seg(body.querySelector("[data-diff]"), DIFFS, diff, v => diff = v);
    body.querySelector("[data-go]").onclick = () => soloRound(body, diff);
  }

  function soloRound(body, diff) {
    const b = newBoard(drawMatch(diff));
    const draw = () => {
      const done = b.gaveUp || score(b) === 11;
      App.render(body, html`
        ${headHTML(b.match)}
        <div class="tally"><span class="muted">${done ? (score(b) === 11 ? "Full house" : "Final score") : "Your score"}</span><span class="big">${score(b)}<span class="muted" style="font-size:.5em">/11</span></span></div>
        ${done ? "" : `<div class="field"><input class="input" data-in placeholder="Name a ${esc(hiddenTeam(b))} starter…" aria-label="Your guess"></div>
        <div class="row"><button class="btn grow" data-guess>Guess</button><button class="btn ghost" data-give>Give up</button></div>`}
        ${pitchHTML(b)}
        ${done ? `<button class="btn block flag" data-next>Next match</button>` : ""}`);
      if (done) { body.querySelector("[data-next]").onclick = () => soloRound(body, diff); return; }
      const input = body.querySelector("[data-in]");
      const ac = App.autocomplete(input, { list: () => App.directory, onSubmit: v => {
        const r = guess(b, v);
        if (r.ok) { App.toast(`${r.name}`); draw(); body.querySelector("[data-in]")?.focus(); }
        else { App.toast(r.msg, "miss"); App.shake(input); input.value = r.repeat ? input.value : ""; input.focus(); }
      } });
      body.querySelector("[data-guess]").onclick = () => ac.submit();
      body.querySelector("[data-give]").onclick = () => { b.gaveUp = true; draw(); };
    };
    draw();
  }

  // ---------------- 1v1 ----------------
  function duelSetup(body) {
    let diff = "easy";
    App.nameSetup(body, {
      title: "Who's playing?", min: 2, max: 2, start: 2, extraHTML: diffHTML(), button: "Start match",
      onStart: names => duel(body, names, diff)
    });
    App.seg(body.querySelector("[data-diff]"), DIFFS, diff, v => diff = v);
  }

  async function duel(body, names, diff) {
    const m1 = drawMatch(diff);
    const m2 = drawMatch(diff, [m1.id]);
    const boards = [newBoard(m1), newBoard(m2)];
    let turn = Math.random() < .5 ? 0 : 1;
    let over = false;

    App.render(body, html`<div class="panel stack-sm center">
      <h3>${esc(names[turn])} goes first</h3>
      <p class="muted">Each of you gets a different match. One guess per turn, right or wrong. First to fill their XI wins.</p>
    </div><button class="btn block flag" data-go>Start</button>`);
    await new Promise(r => body.querySelector("[data-go]").onclick = r);

    const scoreLine = () => `${esc(names[0])} ${score(boards[0])}, ${esc(names[1])} ${score(boards[1])}`;

    async function playTurn() {
      await App.passTo(names[turn], "Only you should see your pitch.");
      const b = boards[turn];
      let guessed = false;
      const draw = (result) => {
        App.render(body, html`
          <div class="row"><h3 class="grow">${esc(names[turn])}'s turn</h3><span class="muted small">${scoreLine()}</span></div>
          ${headHTML(b.match)}
          <div class="tally"><span class="muted">Your XI</span><span class="big">${score(b)}<span class="muted" style="font-size:.5em">/11</span></span></div>
          ${guessed ? `<div class="panel center"><div class="verdict ${result.ok ? "hit" : "miss"}">${result.ok ? esc(result.name) : "Miss"}</div>${result.ok ? "" : `<p class="muted small">${esc(result.msg)}</p>`}</div>
            <button class="btn block flag" data-pass>Pass to ${esc(names[1 - turn])}</button>`
          : `<div class="field"><input class="input" data-in placeholder="Name a ${esc(hiddenTeam(b))} starter…" aria-label="Your guess"></div>
            <button class="btn block" data-guess>Guess</button>`}
          ${pitchHTML(b)}
          <button class="btn ghost block sm" data-end>End game and reveal</button>`);
        body.querySelector("[data-end]").onclick = () => finish(null);
        if (guessed) { body.querySelector("[data-pass]").onclick = () => { turn = 1 - turn; playTurn(); }; return; }
        const input = body.querySelector("[data-in]");
        const ac = App.autocomplete(input, { list: () => App.directory, onSubmit: v => {
          const r = guess(b, v);
          if (r.repeat) { App.toast(r.msg, "miss"); return; } // doesn't use up the turn
          guessed = true;
          if (score(b) === 11) return finish(turn);
          draw(r);
        } });
        body.querySelector("[data-guess]").onclick = () => ac.submit();
        setTimeout(() => input.focus(), 50);
      };
      draw();
    }

    function finish(winner) {
      if (over) return; over = true;
      boards.forEach(b => b.gaveUp = true);
      if (winner === null) {
        const [a, c] = boards.map(score);
        winner = a === c ? -1 : (a > c ? 0 : 1);
      }
      App.render(body, html`
        <div class="panel chalk center stack-sm">
          <div class="verdict">${winner === -1 ? "It's a draw" : `${esc(names[winner])} wins`}</div>
          <p>${scoreLine()}</p>
        </div>
        ${boards.map((b, i) => `<div class="stack-sm"><h3>${esc(names[i])}</h3>${headHTML(b.match)}${pitchHTML(b)}</div>`).join("")}
        <div class="row"><button class="btn grow flag" data-again>Rematch</button><button class="btn ghost" data-menu>Menu</button></div>`);
      body.querySelector("[data-again]").onclick = () => duel(body, names, diff);
      body.querySelector("[data-menu]").onclick = mount;
    }

    playTurn();
  }

  App.games.gts11 = { mount };
})();
