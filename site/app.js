/* Rádio em dados — front-end sem build. Lê data/stats.json e data/tracks.json. */
(() => {
  "use strict";

  const STATIONS = ["RFM", "Rádio Comercial", "Mega Hits"];
  const VAR = { "RFM": "--c-rfm", "Rádio Comercial": "--c-rc", "Mega Hits": "--c-mh" };
  const SHORT = { "RFM": "RFM", "Rádio Comercial": "Comercial", "Mega Hits": "Mega Hits" };

  const state = { tab: "Todas", excl: "RFM" };
  let stats, index, haystack;
  const charts = [];

  // ---------- utilitários ----------
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => Number(n).toLocaleString("pt-PT");
  const dec = (n, d = 1) => Number(n).toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 0) => dec(x * 100, d) + "%";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const dayLabel = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const longDate = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
  const plain = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tabVar = (tab) => (tab === "Todas" ? "--ink" : VAR[tab]);
  const tabLabel = (tab) => (tab === "Todas" ? "Todas as rádios" : tab);

  // ---------- listas ----------
  function row(i, title, sub, by, plays, max) {
    const segs = STATIONS.filter((st) => by[st])
      .map((st) => `<i style="width:${((by[st] / max) * 100).toFixed(2)}%;background:var(${VAR[st]})"></i>`)
      .join("");
    return `<li>
      <span class="pos">${i + 1}</span>
      <div class="lbl"><strong title="${esc(title)}">${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
      <span class="n">${fmt(plays)}</span>
      <div class="bar" aria-hidden="true">${segs}</div>
    </li>`;
  }

  function fillList(el, items, kind, limit = 10) {
    const list = items.slice(0, limit);
    if (!list.length) {
      el.innerHTML = `<li><span></span><div class="lbl"><small>Ainda sem dados.</small></div></li>`;
      return;
    }
    const max = list[0].plays || 1;
    el.innerHTML = list
      .map((x, i) => (kind === "song" ? row(i, x.track, x.artist, x.by, x.plays, max) : row(i, x.name, "", x.by, x.plays, max)))
      .join("");
  }

  // ---------- secções ----------
  function renderHero() {
    const { totals, period } = stats;
    $("#lede").textContent =
      `${fmt(totals.plays)} passagens na RFM, Rádio Comercial e Mega Hits, de ${longDate(period.start)} a ${longDate(period.end)}. ` +
      `${fmt(totals.unique_songs)} músicas diferentes, de ${fmt(totals.unique_artists)} artistas.`;

    const box = $("#presets");
    box.innerHTML = ["Todas", ...STATIONS]
      .map((tab) => {
        const top = stats.top_songs[tab][0];
        return `<button type="button" class="preset" data-tab="${esc(tab)}" style="--c:var(${tabVar(tab)})" aria-pressed="${tab === state.tab}">
          <span class="name">${esc(tabLabel(tab))}</span>
          <span class="song"><b>${esc(top ? top.track : "—")}</b><br>${top ? fmt(top.plays) + " passagens" : ""}</span>
        </button>`;
      })
      .join("");
    box.addEventListener("click", (e) => {
      const btn = e.target.closest(".preset");
      if (!btn) return;
      state.tab = btn.dataset.tab;
      box.querySelectorAll(".preset").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      renderTop();
    });
  }

  function renderTop() {
    const tab = state.tab;
    $("#top-note").textContent =
      tab === "Todas"
        ? "Soma das três rádios. Cada barra mostra quanto vem de cada uma."
        : `Passagens na ${tab} durante o período analisado. Escolhe outra rádio nos botões do topo.`;
    const legend = $("#legend");
    legend.hidden = tab !== "Todas";
    legend.innerHTML = STATIONS.map((st) => `<span style="--c:var(${VAR[st]})">${esc(st)}</span>`).join("");
    fillList($("#list-songs"), stats.top_songs[tab], "song");
    fillList($("#list-artists"), stats.top_artists[tab], "artist");
  }

  function renderRotationText() {
    const ps = stats.per_station;
    const sorted = [...STATIONS].sort((a, b) => ps[b].played_once_share - ps[a].played_once_share);
    const most = sorted[0];
    const least = sorted[sorted.length - 1];
    $("#rot-note").textContent =
      `Na ${most}, ${pct(ps[most].played_once_share)} das músicas diferentes passaram só uma vez no período; na ${least}, ${pct(ps[least].played_once_share)}. ` +
      `Quanto menor o número, mais a rádio vive de um repertório fixo.`;

    const rows = [
      ["Passagens analisadas", (s) => fmt(s.plays)],
      ["Dias com dados", (s) => fmt(s.days)],
      ["Passagens por dia", (s) => dec(s.plays_per_day)],
      ["Músicas diferentes", (s) => fmt(s.unique_songs)],
      ["Artistas diferentes", (s) => fmt(s.unique_artists)],
      ["Passagens por música, em média", (s) => dec(s.avg_plays_per_song)],
      ["Músicas que passaram só uma vez", (s) => pct(s.played_once_share)],
      ["Peso das 10 mais tocadas nas passagens", (s) => pct(s.top10_share, 1)],
    ];
    $("#facts").innerHTML =
      `<thead><tr><td></td>${STATIONS.map((st) => `<th scope="col" class="num" style="--c:var(${VAR[st]})">${esc(st)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map(([label, f]) => `<tr><th scope="row">${label}</th>${STATIONS.map((st) => `<td class="num">${f(ps[st])}</td>`).join("")}</tr>`).join("") +
      "</tbody>";
  }

  function renderOverlapText() {
    const o = stats.overlap;
    let best = { v: -1 };
    STATIONS.forEach((a) =>
      STATIONS.forEach((b) => {
        if (a !== b && o.containment[a][b] > best.v) best = { a, b, v: o.containment[a][b] };
      })
    );
    $("#over-note").textContent =
      `Só ${fmt(o.songs_in_all)} músicas passaram nas três rádios. A maior coincidência: ${pct(best.v)} das músicas da ${best.a} também passam na ${best.b}.`;

    $("#matrix").innerHTML =
      `<thead><tr><th></th>${STATIONS.map((st) => `<th>${esc(SHORT[st])}</th>`).join("")}</tr></thead><tbody>` +
      STATIONS.map(
        (a) =>
          `<tr><th scope="row">${esc(SHORT[a])}</th>${STATIONS.map((b) =>
            a === b ? `<td class="self">—</td>` : `<td>${pct(o.containment[a][b])}</td>`
          ).join("")}</tr>`
      ).join("") +
      "</tbody>";
    $("#matrix").setAttribute("aria-label", "Percentagem das músicas da rádio (linha) que também passam na outra (coluna)");

    fillList($("#list-all"), o.in_all, "song");

    const tabs = $("#excl-tabs");
    tabs.innerHTML = STATIONS.map(
      (st) => `<button type="button" data-st="${esc(st)}" style="--c:var(${VAR[st]})" aria-pressed="${st === state.excl}">${esc(st)}</button>`
    ).join("");
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.excl = b.dataset.st;
      tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      fillList($("#list-excl"), o.exclusive[state.excl], "song", 5);
    });
    fillList($("#list-excl"), o.exclusive[state.excl], "song", 5);
  }

  function renderCalendarText() {
    const p = stats.period;
    const miss = p.missing_days.length;
    $("#cal-note").textContent =
      `Há dados de ${p.days_with_data} dos ${p.days_span} dias do período.` +
      (miss ? ` Os dias sem barras são dias em que a recolha não correu; as médias deste site usam só os dias com dados.` : "");
  }

  function renderFooter() {
    const when = new Date(stats.generated_at).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
    $("#foot-method").textContent =
      `Atualizado a ${when}. Passagens repetidas na recolha foram removidas. Para comparar rádios, as músicas são cruzadas ignorando maiúsculas, acentos e texto entre parênteses. ` +
      `Em colaborações, cada artista creditado conta uma passagem.`;
  }

  // ---------- gráficos ----------
  function renderCharts() {
    charts.splice(0).forEach((c) => c.destroy());
    Chart.defaults.color = cssVar("--muted");
    Chart.defaults.borderColor = cssVar("--rule");
    Chart.defaults.font.family = '"IBM Plex Sans", system-ui, sans-serif';
    Chart.defaults.font.size = 13;
    const color = (st) => cssVar(VAR[st]);
    const make = (id, cfg) => charts.push(new Chart($(id), cfg));

    // 1. músicas por hora
    make("#c-hourly", {
      type: "line",
      data: {
        labels: [...Array(24).keys()].map((h) => String(h).padStart(2, "0") + "h"),
        datasets: STATIONS.map((st) => ({
          label: st, data: stats.hourly[st], borderColor: color(st), backgroundColor: color(st),
          tension: 0.3, pointRadius: 2, borderWidth: 2.5,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: { y: { beginAtZero: true, title: { display: true, text: "Músicas nessa hora" } } },
        plugins: { legend: { position: "bottom" } },
      },
    });

    // 2. rotação
    const ramp = ["#d6dde6", "#a9bdd3", "#6e8fb5", "#3f6a99", "#1b3f66"];
    const stackedPct = (id, key) =>
      make(id, {
        type: "bar",
        data: {
          labels: STATIONS.map((st) => SHORT[st]),
          datasets: stats.rotation.labels.map((lab, i) => ({
            label: lab, data: STATIONS.map((st) => stats.rotation[key][st][i] * 100), backgroundColor: ramp[i],
          })),
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          scales: {
            x: { stacked: true, max: 100, ticks: { callback: (v) => v + "%" } },
            y: { stacked: true, grid: { display: false } },
          },
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12 }, title: { display: true, text: "Passagens por semana, por música" } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${dec(c.parsed.x, 0)}%` } },
          },
        },
      });
    stackedPct("#c-rot-songs", "songs_share");
    stackedPct("#c-rot-plays", "plays_share");

    // 3. sobreposição
    const oRamp = ["#b7c0cc", "#6e8fb5", "#1f4e7a"];
    make("#c-overlap", {
      type: "bar",
      data: {
        labels: STATIONS.map((st) => SHORT[st]),
        datasets: stats.overlap.categories.map((lab, i) => ({
          label: lab, data: STATIONS.map((st) => stats.overlap.plays_share[st][i] * 100), backgroundColor: oRamp[i],
        })),
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, max: 100, ticks: { callback: (v) => v + "%" } },
          y: { stacked: true, grid: { display: false } },
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${dec(c.parsed.x, 0)}%` } },
        },
      },
    });

    // 4. recolha diária
    make("#c-daily", {
      type: "bar",
      data: {
        labels: stats.daily.dates.map(dayLabel),
        datasets: STATIONS.map((st) => ({ label: st, data: stats.daily.by_station[st], backgroundColor: color(st) })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: "Passagens registadas" } } },
        plugins: { legend: { position: "bottom" } },
      },
    });
  }

  // ---------- pesquisa ----------
  function setupSearch() {
    haystack = index.tracks.map((t) => plain(t[0] + " " + t[1]));
    STATIONS.forEach((st, i) => ($("#th-" + i).textContent = SHORT[st]));
    const input = $("#q");
    const table = $("#results");
    const note = $("#q-note");

    input.addEventListener("input", () => {
      const q = plain(input.value.trim());
      if (q.length < 2) {
        table.hidden = true;
        note.textContent = "Escreve pelo menos dois caracteres.";
        return;
      }
      const tokens = q.split(/\s+/);
      const hits = [];
      for (let i = 0; i < haystack.length; i++) {
        if (tokens.every((t) => haystack[i].includes(t))) hits.push(index.tracks[i]);
      }
      if (!hits.length) {
        table.hidden = true;
        note.textContent = "Nenhuma música ou artista encontrado. Tenta outra grafia.";
        return;
      }
      const shown = hits.slice(0, 30);
      note.textContent = hits.length > shown.length
        ? `${fmt(hits.length)} resultados. A mostrar os 30 mais tocados.`
        : `${fmt(hits.length)} ${hits.length === 1 ? "resultado" : "resultados"}.`;
      table.querySelector("tbody").innerHTML = shown
        .map((t) => {
          const total = t[2] + t[3] + t[4];
          return `<tr><td>${esc(t[0])}<small>${esc(t[1])}</small></td>
            <td class="num">${fmt(t[2])}</td><td class="num">${fmt(t[3])}</td><td class="num">${fmt(t[4])}</td>
            <td class="num"><strong>${fmt(total)}</strong></td></tr>`;
        })
        .join("");
      table.hidden = false;
    });
  }

  // ---------- arranque ----------
  async function init() {
    const get = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });
    [stats, index] = await Promise.all([get("data/stats.json"), get("data/tracks.json")]);

    renderHero();
    renderTop();
    renderRotationText();
    renderOverlapText();
    renderCalendarText();
    renderFooter();
    renderCharts();
    setupSearch();

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderCharts);
  }

  init().catch((err) => {
    console.error(err);
    $("#error").hidden = false;
    $("#lede").textContent = "";
  });
})();
