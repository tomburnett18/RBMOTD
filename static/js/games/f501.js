/* Football 501 – darts rules.
   Name a player; their number comes off your score.
   Finish anywhere from 0 to -10 to check out. Below -10 is bust (score stays).
   Answers over 180, or equal to a number you can't check out on in darts, are invalid.
   Answers are a shared pool: once anyone has used a player, nobody can use him again.
   Two-player games only use topics big enough for both players to reach 501.
   If both players pass in the same round, the game ends and the lower score wins. */
(function () {
  "use strict";
  const { esc, html, norm, fmt } = App;
  const START = 501;
  const NO_CHECKOUT = new Set([159, 162, 163, 165, 166, 168, 169]);
  let lastTopic = null;

  const MIN_POOL_2P = 1200; // valid points needed in a topic for a fair two-player game
  const validTotal = t => t.entries.reduce((s, e) => s + (e.value <= 180 && !NO_CHECKOUT.has(e.value) ? e.value : 0), 0);

  function drawTopic(players) {
    const all = App.data.f501.topics;
    const big = all.filter(t => validTotal(t) >= MIN_POOL_2P);
    const topics = players > 1 && big.length ? big : all;
    let t; do { t = App.pick(topics); } while (topics.length > 1 && t === lastTopic);
    lastTopic = t;
    return t;
  }

  function lookup(topic, text) {
    const g = norm(text);
    const exact = topic.entries.filter(e => norm(e.name) === g);
    if (exact.length) return exact;
    return topic.entries.filter(e => App.nameMatches(text, e.name));
  }

  function mount() {
    const { body } = App.screen("Football 501");
    App.modePicker(body, [
      { title: "Solo", desc: "Check out in as few turns as you can.", run: () => game(body, ["You"]) },
      { title: "Pass the phone", desc: "Take turns. Closest to zero when someone checks out wins.", run: () => App.nameSetup(body, { title: "Who's playing?", min: 2, max: 2, start: 2, button: "Start game", onStart: n => game(body, n) }) },
      { title: "Host a game", desc: "Invite a friend to play on their own phone.", soon: "Coming soon", run: () => { } }
    ]);
  }

  function game(body, names) {
    const topic = drawTopic(names.length);
    const players = names.map(n => ({ name: n, score: START, turns: 0, out: false, log: [] }));
    const used = new Set();
    let passesThisRound = 0;
    const solo = players.length === 1;
    let turn = 0, over = false;
    let roundStarter = 0;

    const draw = (flash) => {
      const p = players[turn];
      App.render(body, html`
        <div class="stack-sm">
          <div class="muted small">Topic</div>
          <div class="topic">${esc(topic.title)}</div>
        </div>
        <div class="boards">
          ${players.map((q, i) => `<div class="board ${i === turn && !over ? "turn" : ""}">
            <div class="who">${esc(q.name)}</div>
            <div class="pts ${q.out ? "out" : ""}">${q.score}</div>
            <div class="darts">${q.out ? "Checked out" : `${q.turns} turn${q.turns === 1 ? "" : "s"}`}</div>
          </div>`).join("")}
        </div>
        ${flash ? `<div class="panel center pop"><div class="verdict ${flash.good ? "hit" : "miss"}">${esc(flash.big)}</div><p class="muted small">${esc(flash.small)}</p></div>` : ""}
        ${over ? "" : html`
          <p class="small"><b>${esc(p.name)}</b> <span class="muted">to play${p.score <= 180 ? `, needs ${p.score} (or up to ${p.score + 10})` : ""}</span></p>
          <div class="field"><input class="input" data-in placeholder="Name a player…" aria-label="Your answer"></div>
          <div class="row"><button class="btn grow" data-go>Throw</button><button class="btn ghost" data-pass>Pass</button></div>`}
        ${players.map(q => q.log.length ? `<div class="stack-sm"><div class="muted small">${esc(q.name)}</div><ul class="log">${q.log.slice().reverse().map(l => `<li class="${l.bad ? "bad" : ""}"><span>${esc(l.text)}</span><span class="v">${esc(l.v)}</span></li>`).join("")}</ul></div>` : "").join("")}
        ${over ? "" : `<button class="btn ghost block sm" data-quit>End game</button>`}`);
      if (over) return;
      const input = body.querySelector("[data-in]");
      const ac = App.autocomplete(input, { list: () => App.directory, onSubmit: throwDart });
      body.querySelector("[data-go]").onclick = () => ac.submit();
      body.querySelector("[data-pass]").onclick = () => { passesThisRound++; endTurn({ good: false, big: "Pass", small: `${p.name} stays on ${p.score}` }, { text: "Passed", v: "0", bad: true }); };
      body.querySelector("[data-quit]").onclick = () => finish(true);
    };

    function throwDart(text) {
      const p = players[turn];
      const hits = lookup(topic, text);
      if (hits.length > 1) { App.toast("More than one fits. Use their full name.", "miss"); return; }
      if (!hits.length) return endTurn({ good: false, big: "Not on the list", small: `${text} doesn't count here. Turn over.` }, { text, v: "✕", bad: true });
      const e = hits[0];
      if (used.has(e.name)) return endTurn({ good: false, big: "Already used", small: `${e.name} has already gone. Turn over.` }, { text: e.name, v: "used", bad: true });
      used.add(e.name);
      if (e.value > 180) return endTurn({ good: false, big: `${e.value} is invalid`, small: `Over 180. Turn over.` }, { text: e.name, v: `${e.value} ✕`, bad: true });
      if (NO_CHECKOUT.has(e.value)) return endTurn({ good: false, big: `${e.value} is invalid`, small: `You can't check out on ${e.value} in darts. Turn over.` }, { text: e.name, v: `${e.value} ✕`, bad: true });
      const next = p.score - e.value;
      if (next < -10) return endTurn({ good: false, big: "Bust", small: `${e.name} is ${e.value}. ${p.name} stays on ${p.score}.` }, { text: e.name, v: `${e.value} bust`, bad: true });
      p.score = next;
      if (next <= 0) { p.out = true; return endTurn({ good: true, big: "Checked out", small: `${e.name} is ${e.value}. Finished on ${next}.` }, { text: e.name, v: `−${e.value}` }); }
      endTurn({ good: true, big: `−${e.value}`, small: `${e.name}. ${p.name} on ${next}.` }, { text: e.name, v: `−${e.value}` });
    }

    function endTurn(flash, logLine) {
      const p = players[turn];
      p.turns++;
      p.log.push(logLine);
      if (solo) { if (p.out) return finish(); return draw(flash); }
      // Round-based: after both have thrown, check whether anyone has checked out.
      turn = 1 - turn;
      const roundDone = turn === roundStarter;
      if (roundDone && players.some(q => q.out)) return finish(false, flash);
      if (roundDone && passesThisRound === players.length) return finish(true, { good: false, big: "Both passed", small: "No one can finish, so the lower score wins." });
      if (roundDone) passesThisRound = 0;
      draw(flash);
    }

    function finish(quit = false, flash) {
      over = true;
      let title, sub;
      if (solo) {
        const p = players[0];
        title = p.out ? `Checked out in ${p.turns}` : "Game over";
        sub = p.out ? `Finished on ${p.score}` : `Left on ${p.score}`;
      } else {
        const dist = players.map(q => q.out ? Math.abs(q.score) : Infinity);
        let w;
        if (quit && !players.some(q => q.out)) {
          w = players[0].score === players[1].score ? -1 : (players[0].score < players[1].score ? 0 : 1);
        } else {
          w = dist[0] === dist[1] ? -1 : (dist[0] < dist[1] ? 0 : 1);
        }
        title = w === -1 ? "It's a draw" : `${players[w].name} wins`;
        sub = players.map(q => `${q.name} ${q.score}`).join(", ");
      }
      draw(flash);
      body.insertAdjacentHTML("afterbegin", html`
        <div class="panel chalk center stack-sm pop">
          <div class="verdict">${esc(title)}</div>
          <p>${esc(sub)}</p>
          <div class="row" style="justify-content:center"><button class="btn sm" data-again>New topic</button><button class="btn sm" data-menu>Menu</button></div>
        </div>`);
      body.querySelector("[data-again]").onclick = () => game(body, names);
      body.querySelector("[data-menu]").onclick = mount;
      window.scrollTo(0, 0);
    }

    draw();
  }

  App.games.f501 = { mount };
})();
