/* Imposter – everyone sees the same footballer except the imposter(s),
   who only see the category. Say a word each, then vote. */
(function () {
  "use strict";
  const { esc, html, shuffle } = App;

  const GROUPS = [
    { key: "league", label: "League", items: [["pl", "Premier League"], ["laliga", "La Liga"], ["seriea", "Serie A"], ["bundesliga", "Bundesliga"]] },
    { key: "era", label: "Era", items: [["pre2000", "Pre-2000s"], ["2000s", "2000s"], ["2010s", "2010s"], ["modern", "Modern (2010s on)"]] },
    { key: "nation", label: "Nationality", items: [["english", "English"], ["spanish", "Spanish"], ["french", "French"], ["brazilian", "Brazilian"], ["argentine", "Argentine"], ["german", "German"], ["italian", "Italian"], ["dutch", "Dutch"], ["portuguese", "Portuguese"]] },
    { key: "wc", label: "Special", items: [["wc", "World Cup winners"]] }
  ];
  const LABEL = Object.fromEntries(GROUPS.flatMap(g => g.items));

  const matchTag = (p, key, tag) => {
    if (key === "league") return p.leagues.includes(tag);
    if (key === "nation") return p.nation === tag;
    if (key === "wc") return p.wc;
    if (tag === "pre2000") return p.eras.some(e => e === "1980s" || e === "1990s");
    if (tag === "modern") return p.eras.some(e => e === "2010s" || e === "2020s");
    return p.eras.includes(tag);
  };
  // Within a group any tag can match; every group with a selection must match.
  const filterPool = sel => App.data.imposter.players.filter(p =>
    GROUPS.every(g => !sel[g.key].size || [...sel[g.key]].some(t => matchTag(p, g.key, t))));

  function categoryFor(p, sel) {
    const chosen = GROUPS.flatMap(g => [...sel[g.key]].filter(t => matchTag(p, g.key, t)).map(t => LABEL[t]));
    if (chosen.length) return chosen.join(", ");
    const lg = { pl: "Premier League", laliga: "La Liga", seriea: "Serie A", bundesliga: "Bundesliga" }[p.leagues[0]];
    return `${lg}, ${p.eras[0]}`;
  }

  let settings = null; // remembered between rounds

  function mount() {
    const { body } = App.screen("Imposter");
    setup(body);
  }

  function setup(body) {
    const sel = settings?.sel || { league: new Set(), era: new Set(), nation: new Set(), wc: new Set() };
    let imps = settings?.imps || 1;
    App.nameSetup(body, {
      title: "Who's playing?", min: 3, max: 12, start: 4, button: "Deal cards",
      extraHTML: html`
        <div><span class="label">Imposters</span><div data-imps></div></div>
        <div class="stack-sm"><span class="label">Topic <span class="muted">(leave blank for anyone)</span></span>
          ${GROUPS.map(g => `<div class="chips" data-group="${g.key}">${g.items.map(([t, l]) => `<button type="button" class="chip" data-t="${t}" aria-pressed="${sel[g.key].has(t)}">${esc(l)}</button>`).join("")}</div>`).join("")}
          <p class="muted small" data-count></p>
        </div>`,
      onStart: names => {
        if (names.length < imps * 2 + 1) return App.toast(`${imps} imposter${imps > 1 ? "s need" : " needs"} at least ${imps * 2 + 1} players`, "miss");
        const pool = filterPool(sel);
        if (!pool.length) return App.toast("No players match that topic. Remove a filter.", "miss");
        settings = { names, imps, sel };
        deal(body);
      }
    });
    App.seg(body.querySelector("[data-imps]"), [1, 2, 3].map(n => ({ value: String(n), label: String(n) })), String(imps), v => imps = +v);
    const count = body.querySelector("[data-count]");
    const upd = () => { const n = filterPool(sel).length; count.textContent = `${n} player${n === 1 ? "" : "s"} in the pot`; };
    body.querySelectorAll("[data-group]").forEach(grp => grp.querySelectorAll(".chip").forEach(c => c.onclick = () => {
      const set = sel[grp.dataset.group];
      set.has(c.dataset.t) ? set.delete(c.dataset.t) : set.add(c.dataset.t);
      c.setAttribute("aria-pressed", set.has(c.dataset.t));
      upd();
    }));
    upd();
  }

  function deal(body) {
    const { names, imps, sel } = settings;
    const player = App.pick(filterPool(sel));
    const category = categoryFor(player, sel);
    const impIdx = new Set(shuffle(names.map((n, i) => i)).slice(0, imps));
    const alive = new Set(names.map((n, i) => i));
    const seen = new Set();
    let round = 0;

    const reveal = () => {
      App.render(body, html`
        <div class="stack-sm"><h3>Look at your card</h3><p class="muted">Tap your name, check your card, then pass the phone on.</p></div>
        <div class="name-grid">${names.map((n, i) => `<button class="name-btn ${seen.has(i) ? "done" : ""}" data-i="${i}" ${seen.has(i) ? "disabled" : ""}>${esc(n)}</button>`).join("")}</div>
        ${seen.size === names.length ? `<button class="btn block flag" data-start>Everyone's looked. Start</button>` : `<p class="muted small center">${names.length - seen.size} still to look</p>`}`);
      body.querySelectorAll(".name-btn[data-i]").forEach(b => b.onclick = () => showCard(+b.dataset.i));
      body.querySelector("[data-start]")?.addEventListener("click", playRound);
    };

    async function showCard(i) {
      await App.passTo(names[i], "Make sure nobody else can see the screen.");
      const imp = impIdx.has(i);
      App.render(body, html`
        <div class="card-reveal ${imp ? "imp" : ""} pop">
          <p>${imp ? "You're the" : "Your player is"}</p>
          <div class="who">${imp ? "Imposter" : esc(player.name)}</div>
          <p>${imp ? `Category: <b>${esc(category)}</b>` : `Category: ${esc(category)}`}</p>
          ${imp && imps > 1 ? `<p class="small" style="margin-top:8px">There are ${imps} imposters.</p>` : ""}
        </div>
        <button class="btn block" data-hide>Hide and pass on</button>`);
      body.querySelector("[data-hide]").onclick = () => { seen.add(i); reveal(); };
    }

    function playRound() {
      round++;
      const order = [...alive];
      const startAt = Math.floor(Math.random() * order.length);
      const seq = order.slice(startAt).concat(order.slice(0, startAt));
      App.render(body, html`
        <div class="stack-sm"><h3>Round ${round}</h3><p class="muted">Go round in this order. Each player says one word about the player.</p></div>
        <ol class="order">${seq.map(i => `<li>${esc(names[i])}</li>`).join("")}</ol>
        <button class="btn block flag" data-vote>Time to vote</button>`);
      body.querySelector("[data-vote]").onclick = vote;
    }

    function vote() {
      let chosen = null;
      const draw = () => {
        App.render(body, html`
          <div class="stack-sm"><h3>Who's the imposter?</h3><p class="muted">Agree as a group, then pick one player or skip.</p></div>
          <div class="name-grid">${[...alive].map(i => `<button class="name-btn" data-i="${i}" aria-pressed="${chosen === i}">${esc(names[i])}</button>`).join("")}</div>
          <button class="btn block flag" data-out ${chosen === null ? "disabled" : ""}>${chosen === null ? "Pick a player" : `Vote out ${esc(names[chosen])}`}</button>
          <button class="btn block ghost" data-skip>No one this round</button>`);
        body.querySelectorAll(".name-btn").forEach(b => b.onclick = () => { chosen = +b.dataset.i; draw(); });
        body.querySelector("[data-out]").onclick = () => chosen !== null && eliminate(chosen);
        body.querySelector("[data-skip]").onclick = () => afterVote(null);
      };
      draw();
    }

    function eliminate(i) { alive.delete(i); afterVote(i); }

    function afterVote(i) {
      const impsLeft = [...alive].filter(x => impIdx.has(x)).length;
      const crewLeft = alive.size - impsLeft;
      const ended = impsLeft === 0 ? "crew" : impsLeft >= crewLeft ? "imps" : null;
      const msg = i === null ? "No one was voted out." : `${names[i]} ${impIdx.has(i) ? "was an imposter" : "was not the imposter"}.`;
      if (ended) return finish(ended, msg);
      App.render(body, html`
        <div class="panel center stack-sm pop">
          <div class="verdict ${i !== null && impIdx.has(i) ? "hit" : "miss"}">${i === null ? "Skipped" : impIdx.has(i) ? "Caught one" : "Wrong call"}</div>
          <p>${esc(msg)}</p>
          ${i !== null && impIdx.has(i) ? `<p class="muted small">${impsLeft} imposter${impsLeft > 1 ? "s" : ""} still in the game.</p>` : ""}
        </div>
        <button class="btn block flag" data-next>Next round</button>`);
      body.querySelector("[data-next]").onclick = playRound;
    }

    function finish(who, msg) {
      App.render(body, html`
        <div class="panel chalk center stack-sm pop">
          <div class="verdict">${who === "crew" ? "Imposters caught" : "Imposters win"}</div>
          <p>${esc(msg)}</p>
        </div>
        <div class="panel stack-sm">
          <div class="kv"><span class="muted">The player</span><b>${esc(player.name)}</b></div>
          <div class="kv"><span class="muted">Imposter${imps > 1 ? "s" : ""}</span><b>${[...impIdx].map(i => esc(names[i])).join(", ")}</b></div>
        </div>
        <div class="row"><button class="btn grow flag" data-again>Play again</button><button class="btn ghost" data-setup>Change setup</button></div>`);
      body.querySelector("[data-again]").onclick = () => deal(body);
      body.querySelector("[data-setup]").onclick = () => setup(body);
    }

    reveal();
  }

  App.games.imposter = { mount };
})();
