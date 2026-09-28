/* Leaderboard: today, this month, all time. */
(function () {
  "use strict";
  const { esc, html, fmt } = App;

  const PERIODS = [{ value: "today", label: "Today" }, { value: "month", label: "Month" }, { value: "all", label: "All time" }];

  async function leaderboard() {
    const { body } = App.screen("Leaderboard");
    await App.refreshMe();
    if (!App.me) {
      App.after = "#/leaderboard";
      App.render(body, html`
        <div class="panel stack-sm"><h3>Sign in to see the leaderboard</h3>
          <p class="muted">It shows everyone who's signed up, using the name they chose.</p></div>
        <a class="btn block" href="#/signin">Sign in</a>
        <a class="btn ghost block" href="#/signup">Create an account</a>`);
      return;
    }
    let period = "today";
    App.render(body, html`<div data-tabs></div><div data-list class="stack-sm"><p class="muted">Loading…</p></div>`);
    const list = body.querySelector("[data-list]");
    App.seg(body.querySelector("[data-tabs]"), PERIODS, period, v => { period = v; load(); });

    async function load() {
      list.innerHTML = `<p class="muted">Loading…</p>`;
      let d;
      try { d = await App.api("/api/leaderboard?period=" + period); }
      catch (e) { list.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
      if (!d.rows.length) {
        list.innerHTML = `<div class="panel center stack-sm"><h3>Nothing yet</h3>
          <p class="muted">${period === "today" ? "Nobody has played today's player yet. Be first." : "Scores show up here once people start playing."}</p></div>`;
        return;
      }
      const medal = r => r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : r;
      list.innerHTML = html`
        <p class="muted small">${period === "today" ? "Today's player" : period === "month" ? esc(d.month) : "Every day so far"}</p>
        <ol class="lb">
          ${d.rows.map(r => html`
            <li class="${r.user_id === d.me ? "me" : ""}">
              <span class="pos">${medal(r.rank)}</span>
              <span class="who">${esc(r.name)}</span>
              <span class="sub">${period === "today"
          ? (r.gave_up ? "Gave up" : `${r.seconds}s, ${r.guesses} guess${r.guesses === 1 ? "" : "es"}`)
          : `${r.days} day${r.days === 1 ? "" : "s"}`}</span>
              <span class="pts">${fmt(r.points)}</span>
            </li>`).join("")}
        </ol>`;
    }
    load();
  }

  App.leaderboard = leaderboard;
})();
