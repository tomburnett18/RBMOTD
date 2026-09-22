/* Pub Quiz – solo and pass the phone. Speed-scored: 1000 for an instant right answer,
   falling to 350 at 20 seconds and staying there. Wrong answers score 0. */
(function () {
  "use strict";
  const { esc, html, norm, shuffle, fmt } = App;
  const LETTERS = ["A", "B", "C", "D"];
  const COUNT = 10;
  let timer = null;

  const points = secs => {
    if (secs <= 1) return 1000;
    if (secs >= 20) return 350;
    return Math.round(1000 - 650 * (secs - 1) / 19);
  };

  function makeQuiz() {
    const qs = App.data.quiz.questions;
    const mc = shuffle(qs.filter(q => q.type === "mc")).slice(0, 6);
    const tx = shuffle(qs.filter(q => q.type === "text")).slice(0, COUNT - mc.length);
    return shuffle([...mc, ...tx]).map(q => {
      if (q.type !== "mc") return q;
      const order = shuffle(q.options.map((o, i) => i));
      return { ...q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) };
    });
  }
  const correctText = q => q.type === "mc" ? q.options[q.answer] : q.answers[0];
  const isRight = (q, given) => q.type === "mc" ? given === q.answer
    : q.answers.some(a => norm(a) === norm(given) || norm(a).replace(/^the /, "") === norm(given).replace(/^the /, ""));
  const givenText = (q, given) => given === null || given === "" ? "No answer" : (q.type === "mc" ? q.options[given] : given);

  // Shows one question; resolves with {given, secs, right, pts}.
  function ask(body, q, i, who) {
    return new Promise(resolve => {
      clearInterval(timer);
      App.render(body, html`
        <div class="qmeta"><span>Question ${i + 1} of ${COUNT}</span><span>${who ? esc(who) : ""}</span></div>
        <div class="timebar"><i data-bar></i></div>
        <p class="question">${esc(q.q)}</p>
        ${q.type === "mc"
          ? `<div class="options">${q.options.map((o, k) => `<button class="opt" data-k="${k}"><span class="let">${LETTERS[k]}</span><span>${esc(o)}</span></button>`).join("")}</div>`
          : `<input class="input" data-in placeholder="Type your answer" aria-label="Your answer" autocomplete="off" autocapitalize="words" spellcheck="false">
             <button class="btn block" data-lock>Lock in</button>`}`);
      const start = performance.now();
      const bar = body.querySelector("[data-bar]");
      timer = setInterval(() => {
        const s = (performance.now() - start) / 1000;
        bar.style.transform = `scaleX(${Math.max(0, 1 - s / 20)})`;
      }, 100);
      let done = false;
      const finish = given => {
        if (done) return; done = true;
        clearInterval(timer);
        const secs = (performance.now() - start) / 1000;
        const right = given !== null && given !== "" && isRight(q, given);
        resolve({ given, secs, right, pts: right ? points(secs) : 0 });
      };
      if (q.type === "mc") body.querySelectorAll(".opt").forEach(b => b.onclick = () => finish(+b.dataset.k));
      else {
        const inp = body.querySelector("[data-in]");
        inp.addEventListener("keydown", e => { if (e.key === "Enter") finish(inp.value.trim()); });
        body.querySelector("[data-lock]").onclick = () => finish(inp.value.trim());
        setTimeout(() => inp.focus(), 60);
      }
    });
  }

  function mount() {
    const { body } = App.screen("Pub Quiz");
    App.onLeave(() => clearInterval(timer));
    App.modePicker(body, [
      { title: "Solo", desc: "Ten questions, up to 10,000 points.", run: () => solo(body) },
      { title: "Pass the phone", desc: "Everyone answers every question. Results at the end.", run: () => App.nameSetup(body, { title: "Who's playing?", min: 2, max: 8, start: 2, button: "Start quiz", onStart: n => party(body, n) }) },
      { title: "Host a game", desc: "Open a lobby so friends join on their own phones.", soon: "Coming soon", run: () => { } }
    ]);
  }

  // ---------------- Solo ----------------
  async function solo(body) {
    const quiz = makeQuiz();
    let total = 0, right = 0;
    for (let i = 0; i < quiz.length; i++) {
      const q = quiz[i];
      const a = await ask(body, q, i);
      total += a.pts; right += a.right ? 1 : 0;
      App.render(body, html`
        <div class="qmeta"><span>Question ${i + 1} of ${COUNT}</span><span>${fmt(total)} pts</span></div>
        <p class="question">${esc(q.q)}</p>
        ${q.type === "mc" ? `<div class="options">${q.options.map((o, k) => `<div class="opt ${k === q.answer ? "right" : k === a.given ? "wrong" : ""}"><span class="let">${LETTERS[k]}</span><span>${esc(o)}</span></div>`).join("")}</div>` : ""}
        <div class="panel stack-sm">
          <div class="verdict ${a.right ? "hit" : "miss"}">${a.right ? `+${fmt(a.pts)}` : "Wrong"}</div>
          <p class="muted small">${a.right ? `Answered in ${a.secs.toFixed(1)}s` : `The answer was <b style="color:var(--chalk)">${esc(correctText(q))}</b>`}</p>
        </div>
        <button class="btn block flag" data-next>${i === quiz.length - 1 ? "See score" : "Next question"}</button>`);
      await new Promise(r => body.querySelector("[data-next]").onclick = r);
    }
    App.render(body, html`
      <div class="panel chalk center stack-sm">
        <p>You scored</p>
        <div class="big">${fmt(total)}</div>
        <p>${right} out of ${COUNT} right</p>
      </div>
      <div class="row"><button class="btn grow flag" data-again>New quiz</button><button class="btn ghost" data-menu>Menu</button></div>`);
    body.querySelector("[data-again]").onclick = () => solo(body);
    body.querySelector("[data-menu]").onclick = mount;
  }

  // ---------------- Pass the phone ----------------
  async function party(body, names) {
    const quiz = makeQuiz();
    const answers = names.map(() => []);
    for (let i = 0; i < quiz.length; i++) {
      for (let p = 0; p < names.length; p++) {
        await App.passTo(names[p], `Question ${i + 1} of ${COUNT}. The clock starts when you tap.`);
        answers[p][i] = await ask(body, quiz[i], i, names[p]);
      }
    }
    const totals = names.map((n, p) => answers[p].reduce((s, a) => s + a.pts, 0));
    const best = Math.max(...totals);
    let tied = names.map((n, p) => p).filter(p => totals[p] === best);
    let tbNote = "";
    const usedTB = new Set();
    while (tied.length > 1) {
      const res = await tiebreak(body, names, tied, usedTB);
      tbNote += res.note;
      tied = res.winners;
    }
    showResults(body, names, quiz, answers, totals, tied[0], tbNote);
  }

  async function tiebreak(body, names, tied, used) {
    const pool = App.data.quiz.tiebreakers.filter((t, i) => !used.has(i));
    const all = App.data.quiz.tiebreakers;
    const t = pool.length ? App.pick(pool) : App.pick(all);
    used.add(all.indexOf(t));
    App.render(body, html`<div class="panel stack-sm center">
      <h3>It's a tie</h3>
      <p class="muted">${tied.map(p => esc(names[p])).join(" and ")} are level. One number question: closest guess wins, over or under.</p>
    </div><button class="btn block flag" data-go>Start tiebreaker</button>`);
    await new Promise(r => body.querySelector("[data-go]").onclick = r);
    const guesses = {};
    for (const p of tied) {
      await App.passTo(names[p], "Tiebreaker. Answer with a number.");
      guesses[p] = await new Promise(resolve => {
        App.render(body, html`
          <div class="qmeta"><span>Tiebreaker</span><span>${esc(names[p])}</span></div>
          <p class="question">${esc(t.q)}</p>
          <input class="input" data-in type="number" inputmode="numeric" placeholder="Your number" aria-label="Your number">
          <button class="btn block" data-lock>Lock in</button>`);
        const inp = body.querySelector("[data-in]");
        const go = () => { if (inp.value === "") return App.toast("Enter a number", "miss"); resolve(Number(inp.value)); };
        body.querySelector("[data-lock]").onclick = go;
        inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
        setTimeout(() => inp.focus(), 60);
      });
    }
    const diffs = tied.map(p => Math.abs(guesses[p] - t.answer));
    const min = Math.min(...diffs);
    const winners = tied.filter((p, i) => diffs[i] === min);
    const note = html`<div class="panel stack-sm"><h3>Tiebreaker</h3><p class="muted small">${esc(t.q)}</p>
      <p>Answer: <b>${fmt(t.answer)}</b></p>
      ${tied.map(p => `<div class="kv small"><span>${esc(names[p])}</span><span>${fmt(guesses[p])}</span></div>`).join("")}</div>`;
    return { winners, note };
  }

  function showResults(body, names, quiz, answers, totals, winner, tbNote) {
    const order = names.map((n, p) => p).sort((a, b) => (b === winner) - (a === winner) || totals[b] - totals[a]);
    App.render(body, html`
      <div class="panel chalk center stack-sm">
        <div class="verdict">${esc(names[winner])} wins</div>
        <p>${fmt(totals[winner])} points</p>
      </div>
      <div class="podium">${order.map(p => `<div class="p"><span>${esc(names[p])}</span><b>${fmt(totals[p])}</b></div>`).join("")}</div>
      ${tbNote}
      <h3>Question by question</h3>
      ${quiz.map((q, i) => html`
        <div class="panel stack-sm">
          <p class="small muted">Q${i + 1}. ${esc(q.q)}</p>
          <p><b>${esc(correctText(q))}</b></p>
          <div class="table-wrap"><table class="results"><tbody>
            ${names.map((n, p) => { const a = answers[p][i]; return `<tr><td>${esc(n)}</td><td class="${a.right ? "ok" : "no"}">${esc(givenText(q, a.given))}</td><td class="num">${a.right ? fmt(a.pts) : "0"}</td></tr>`; }).join("")}
          </tbody></table></div>
        </div>`).join("")}
      <div class="row"><button class="btn grow flag" data-again>Play again</button><button class="btn ghost" data-menu>Menu</button></div>`);
    body.querySelector("[data-again]").onclick = () => party(body, names);
    body.querySelector("[data-menu]").onclick = mount;
  }

  App.games.quiz = { mount, points };
})();
