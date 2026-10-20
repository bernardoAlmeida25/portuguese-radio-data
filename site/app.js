/* Rádio em dados — front-end sem build. Lê data/stats.json e data/tracks.json.
   Suporta dois idiomas (PT/EN): toda a interface traduz; músicas, artistas
   e nomes das rádios ficam sempre na forma original dos dados. */
(() => {
  "use strict";

  const STATIONS = ["RFM", "Rádio Comercial", "Mega Hits"];
  const VAR = { "RFM": "--c-rfm", "Rádio Comercial": "--c-rc", "Mega Hits": "--c-mh" };
  const SHORT = { "RFM": "RFM", "Rádio Comercial": "Comercial", "Mega Hits": "Mega Hits" };

  const state = { tab: "Todas", excl: "RFM", lang: "pt" };
  let stats, index, haystack;
  const charts = [];

  // ---------- i18n ----------
  const I18N = {
    pt: {
      docTitle: "O que toca na rádio portuguesa",
      h1: "O que toca na rádio portuguesa",
      loading: "A carregar dados…",
      chooseStation: "Escolher rádio",
      langSwitch: "Idioma",
      errorA: "Não foi possível carregar os dados. Gera-os com",
      errorB: "e abre a página através de um servidor local",
      errorC: "dentro da pasta",
      h2Top: "Mais tocadas",
      h3Songs: "Músicas",
      h3Artists: "Artistas",
      h2Day: "Um dia de rádio",
      dayNote: "Quantas músicas passam, em média, em cada hora do dia.",
      ariaHourly: "Músicas por hora do dia em cada rádio",
      h2Rot: "Quão repetitiva é cada rádio?",
      h3RotSongs: "Como se dividem as músicas",
      hintRotSongs: "Percentagem das músicas diferentes, por frequência de passagem.",
      h3RotPlays: "Como se dividem as passagens",
      hintRotPlays: "Percentagem do total de passagens, pelos mesmos escalões.",
      ariaRotSongs: "Distribuição das músicas por frequência de rotação",
      ariaRotPlays: "Distribuição das passagens por frequência de rotação",
      h2Over: "As rádios tocam o mesmo?",
      h3OverShare: "Quanto do que passa é partilhado",
      hintOverShare: "Percentagem das passagens de cada rádio, consoante a música também passe noutras.",
      ariaOverlap: "Passagens por número de rádios que tocam a música",
      h3OverCommon: "Músicas em comum",
      hintCommon: "Parte das músicas de uma rádio que também passam noutra.",
      h3AllThree: "Passam nas três rádios",
      h3OnlyOne: "Só passam numa rádio",
      h2Cal: "Dados recolhidos por dia",
      ariaDaily: "Passagens registadas por dia",
      h2Search: "Procura uma música ou um artista",
      searchLabel: "Pesquisar",
      searchPh: "Por exemplo: Calema, Taylor Swift, Dracula",
      thSong: "Música",
      thTotal: "Total",
      footData: "Dados em domínio público, recolhidos todos os dias das páginas das rádios.",
      footLink: "Código e dados no GitHub",
      allStations: "Todas as rádios",
      plays: "passagens",
      noData: "Ainda sem dados.",
      lede: (f) => `${f.plays} passagens na RFM, Rádio Comercial e Mega Hits, de ${f.start} a ${f.end}. ${f.songs} músicas diferentes, de ${f.artists} artistas.`,
      topNoteAll: "Soma das três rádios. Cada barra mostra quanto vem de cada uma.",
      topNoteTab: (tab) => `Passagens na ${tab} durante o período analisado. Escolhe outra rádio nos botões do topo.`,
      rotNote: (f) => `Na ${f.most}, ${f.pMost} das músicas diferentes passaram só uma vez no período; na ${f.least}, ${f.pLeast}. Quanto menor o número, mais a rádio vive de um repertório fixo.`,
      factsPlays: "Passagens analisadas",
      factsDays: "Dias com dados",
      factsPerDay: "Passagens por dia",
      factsSongs: "Músicas diferentes",
      factsArtists: "Artistas diferentes",
      factsAvg: "Passagens por música, em média",
      factsOnce: "Músicas que passaram só uma vez",
      factsTop10: "Peso das 10 mais tocadas nas passagens",
      overNote: (f) => `Só ${f.n} músicas passaram nas três rádios. A maior coincidência: ${f.p} das músicas da ${f.a} também passam na ${f.b}.`,
      matrixAria: "Percentagem das músicas da rádio (linha) que também passam na outra (coluna)",
      calNote: (d, n, miss) => `Há dados de ${fmt(d)} dos ${fmt(n)} dias do período.` + (miss ? ` Os dias sem barras são dias em que a recolha não correu; as médias deste site usam só os dias com dados.` : ""),
      footMethod: (when) => `Atualizado a ${when}. Passagens repetidas na recolha foram removidas. Para comparar rádios, as músicas são cruzadas ignorando maiúsculas, acentos e texto entre parênteses. Em colaborações, cada artista creditado conta uma passagem.`,
      chartHourlyY: "Músicas nessa hora",
      rotLegendTitle: "Passagens por semana, por música",
      dailyY: "Passagens registadas",
      searchMin: "Escreve pelo menos dois caracteres.",
      searchNone: "Nenhuma música ou artista encontrado. Tenta outra grafia.",
      searchCapped: (n) => `${fmt(n)} resultados. A mostrar os 30 mais tocados.`,
      searchCount: (n) => `${fmt(n)} ${n === 1 ? "resultado" : "resultados"}.`,
    },
    en: {
      docTitle: "What plays on Portuguese radio",
      h1: "What plays on Portuguese radio",
      loading: "Loading data…",
      chooseStation: "Choose station",
      langSwitch: "Language",
      errorA: "Could not load the data. Generate it with",
      errorB: "and open the page through a local server",
      errorC: "inside the folder",
      h2Top: "Most played",
      h3Songs: "Songs",
      h3Artists: "Artists",
      h2Day: "A day of radio",
      dayNote: "How many songs are played, on average, in each hour of the day.",
      ariaHourly: "Songs per hour of the day on each station",
      h2Rot: "How repetitive is each station?",
      h3RotSongs: "How songs break down",
      hintRotSongs: "Percentage of unique songs by airplay frequency.",
      h3RotPlays: "How plays break down",
      hintRotPlays: "Percentage of all plays, by the same tiers.",
      ariaRotSongs: "Distribution of songs by rotation frequency",
      ariaRotPlays: "Distribution of plays by rotation frequency",
      h2Over: "Do the stations play the same?",
      h3OverShare: "How much of what airs is shared",
      hintOverShare: "Percentage of each station's plays, depending on whether the song also plays on others.",
      ariaOverlap: "Plays by number of stations playing each song",
      h3OverCommon: "Songs in common",
      hintCommon: "Share of one station's songs that also play on another.",
      h3AllThree: "Played on all three stations",
      h3OnlyOne: "Only played on one station",
      h2Cal: "Data collected per day",
      ariaDaily: "Plays recorded per day",
      h2Search: "Search for a song or an artist",
      searchLabel: "Search",
      searchPh: "For example: Calema, Taylor Swift, Dracula",
      thSong: "Song",
      thTotal: "Total",
      footData: "Public-domain data, collected every day from the stations' websites.",
      footLink: "Code and data on GitHub",
      allStations: "All stations",
      plays: "plays",
      noData: "No data yet.",
      lede: (f) => `${f.plays} plays on RFM, Rádio Comercial and Mega Hits from ${f.start} to ${f.end}. ${f.songs} unique songs by ${f.artists} artists.`,
      topNoteAll: "Sum of the three stations. Each bar shows how much comes from each one.",
      topNoteTab: (tab) => `Plays on ${tab} during the analysed period. Pick another station with the buttons at the top.`,
      rotNote: (f) => `On ${f.most}, ${f.pMost} of unique songs were played only once in the period; on ${f.least}, ${f.pLeast}. The lower the number, the more the station relies on a fixed repertoire.`,
      factsPlays: "Plays analysed",
      factsDays: "Days with data",
      factsPerDay: "Plays per day",
      factsSongs: "Unique songs",
      factsArtists: "Unique artists",
      factsAvg: "Plays per song, on average",
      factsOnce: "Songs played only once",
      factsTop10: "Share of plays held by the 10 most played",
      overNote: (f) => `Only ${f.n} songs were played on all three stations. The biggest overlap: ${f.p} of ${f.a}'s songs also play on ${f.b}.`,
      matrixAria: "Percentage of the row station's songs that also play on the column station",
      calNote: (d, n, miss) => `There is data for ${fmt(d)} of the ${fmt(n)} days in the period.` + (miss ? ` Days without bars are days when collection didn't run; this site's averages only use days with data.` : ""),
      footMethod: (when) => `Updated ${when}. Duplicate plays were removed during collection. To compare stations, songs are matched ignoring case, accents and text in brackets. On collaborations, each credited artist counts as one play.`,
      chartHourlyY: "Songs in that hour",
      rotLegendTitle: "Plays per week, per song",
      dailyY: "Plays recorded",
      searchMin: "Type at least two characters.",
      searchNone: "No song or artist found. Try another spelling.",
      searchCapped: (n) => `${fmt(n)} results. Showing the 30 most played.`,
      searchCount: (n) => `${fmt(n)} ${n === 1 ? "result" : "results"}.`,
    },
  };

  // Rótulos que vêm do stats.json (gerados em português pelo build_stats.py)
  // e são traduzidos no próprio browser.
  const JSON_LABELS_EN = {
    "menos de 1 por semana": "less than 1 per week",
    "1 a 3": "1 to 3",
    "3 a 7": "3 to 7",
    "7 a 14": "7 to 14",
    "mais de 14": "more than 14",
    "Só nesta rádio": "Only on this station",
    "Em 2 rádios": "On 2 stations",
    "Nas 3 rádios": "On all 3 stations",
  };

  const t = (key) => (I18N[state.lang] && I18N[state.lang][key]) || I18N.pt[key] || key;
  const jLabel = (s) => (state.lang === "en" && JSON_LABELS_EN[s]) || s;

  function detectLang() {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "pt" || saved === "en") return saved;
    } catch (e) { /* localStorage indisponível */ }
    return (navigator.language || "pt").toLowerCase().startsWith("pt") ? "pt" : "en";
  }

  // Textos estáticos do index.html (marcados com data-i18n / data-i18n-placeholder / data-i18n-aria)
  function applyStaticTexts() {
    document.title = t("docTitle");
    document.documentElement.lang = state.lang === "en" ? "en" : "pt-PT";
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => (el.setAttribute("aria-label", t(el.dataset.i18nAria))));
  }

  // ---------- utilitários ----------
  const $ = (sel) => document.querySelector(sel);
  const loc = () => (state.lang === "en" ? "en-GB" : "pt-PT");
  const fmt = (n) => Number(n).toLocaleString(loc());
  const dec = (n, d = 1) => Number(n).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 0) => dec(x * 100, d) + "%";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const dayLabel = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const longDate = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString(loc(), { day: "numeric", month: "long", year: "numeric" });
  const plain = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tabVar = (tab) => (tab === "Todas" ? "--ink" : VAR[tab]);
  const tabLabel = (tab) => (tab === "Todas" ? t("allStations") : tab);

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
      el.innerHTML = `<li><span></span><div class="lbl"><small>${esc(t("noData"))}</small></div></li>`;
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
    $("#lede").textContent = t("lede")({
      plays: fmt(totals.plays),
      start: longDate(period.start),
      end: longDate(period.end),
      songs: fmt(totals.unique_songs),
      artists: fmt(totals.unique_artists),
    });

    $("#presets").innerHTML = ["Todas", ...STATIONS]
      .map((tab) => {
        const top = stats.top_songs[tab][0];
        return `<button type="button" class="preset" data-tab="${esc(tab)}" style="--c:var(${tabVar(tab)})" aria-pressed="${tab === state.tab}">
          <span class="name">${esc(tabLabel(tab))}</span>
          <span class="song"><b>${esc(top ? top.track : "—")}</b><br>${top ? fmt(top.plays) + " " + esc(t("plays")) : ""}</span>
        </button>`;
      })
      .join("");
  }

  function renderTop() {
    const tab = state.tab;
    $("#top-note").textContent = tab === "Todas" ? t("topNoteAll") : t("topNoteTab")(tab);
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
    $("#rot-note").textContent = t("rotNote")({
      most, least,
      pMost: pct(ps[most].played_once_share),
      pLeast: pct(ps[least].played_once_share),
    });

    const rows = [
      [t("factsPlays"), (s) => fmt(s.plays)],
      [t("factsDays"), (s) => fmt(s.days)],
      [t("factsPerDay"), (s) => dec(s.plays_per_day)],
      [t("factsSongs"), (s) => fmt(s.unique_songs)],
      [t("factsArtists"), (s) => fmt(s.unique_artists)],
      [t("factsAvg"), (s) => dec(s.avg_plays_per_song)],
      [t("factsOnce"), (s) => pct(s.played_once_share)],
      [t("factsTop10"), (s) => pct(s.top10_share, 1)],
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
    $("#over-note").textContent = t("overNote")({
      n: fmt(o.songs_in_all),
      p: pct(best.v),
      a: best.a,
      b: best.b,
    });

    $("#matrix").innerHTML =
      `<thead><tr><th></th>${STATIONS.map((st) => `<th>${esc(SHORT[st])}</th>`).join("")}</tr></thead><tbody>` +
      STATIONS.map(
        (a) =>
          `<tr><th scope="row">${esc(SHORT[a])}</th>${STATIONS.map((b) =>
            a === b ? `<td class="self">—</td>` : `<td>${pct(o.containment[a][b])}</td>`
          ).join("")}</tr>`
      ).join("") +
      "</tbody>";
    $("#matrix").setAttribute("aria-label", t("matrixAria"));

    fillList($("#list-all"), o.in_all, "song");

    $("#excl-tabs").innerHTML = STATIONS.map(
      (st) => `<button type="button" data-st="${esc(st)}" style="--c:var(${VAR[st]})" aria-pressed="${st === state.excl}">${esc(st)}</button>`
    ).join("");
    fillList($("#list-excl"), o.exclusive[state.excl], "song", 5);
  }

  function renderCalendarText() {
    const p = stats.period;
    $("#cal-note").textContent = t("calNote")(p.days_with_data, p.days_span, p.missing_days.length > 0);
  }

  function renderFooter() {
    const when = new Date(stats.generated_at).toLocaleDateString(loc(), { day: "numeric", month: "long", year: "numeric" });
    $("#foot-method").textContent = t("footMethod")(when);
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
        scales: { y: { beginAtZero: true, title: { display: true, text: t("chartHourlyY") } } },
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
            label: jLabel(lab), data: STATIONS.map((st) => stats.rotation[key][st][i] * 100), backgroundColor: ramp[i],
          })),
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          scales: {
            x: { stacked: true, max: 100, ticks: { callback: (v) => v + "%" } },
            y: { stacked: true, grid: { display: false } },
          },
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12 }, title: { display: true, text: t("rotLegendTitle") } },
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
          label: jLabel(lab), data: STATIONS.map((st) => stats.overlap.plays_share[st][i] * 100), backgroundColor: oRamp[i],
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
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: t("dailyY") } } },
        plugins: { legend: { position: "bottom" } },
      },
    });
  }

  // ---------- pesquisa ----------
  function runSearch() {
    const input = $("#q");
    const table = $("#results");
    const note = $("#q-note");

    if (!haystack) return; // dados ainda não chegaram
    const q = plain(input.value.trim());
    if (q.length < 2) {
      table.hidden = true;
      note.textContent = t("searchMin");
      return;
    }
    const tokens = q.split(/\s+/);
    const hits = [];
    for (let i = 0; i < haystack.length; i++) {
      if (tokens.every((tk) => haystack[i].includes(tk))) hits.push(index.tracks[i]);
    }
    if (!hits.length) {
      table.hidden = true;
      note.textContent = t("searchNone");
      return;
    }
    const shown = hits.slice(0, 30);
    note.textContent = hits.length > shown.length ? t("searchCapped")(hits.length) : t("searchCount")(hits.length);
    table.querySelector("tbody").innerHTML = shown
      .map((tr) => {
        const total = tr[2] + tr[3] + tr[4];
        return `<tr><td>${esc(tr[0])}<small>${esc(tr[1])}</small></td>
          <td class="num">${fmt(tr[2])}</td><td class="num">${fmt(tr[3])}</td><td class="num">${fmt(tr[4])}</td>
          <td class="num"><strong>${fmt(total)}</strong></td></tr>`;
      })
      .join("");
    table.hidden = false;
  }

  // ---------- idioma e arranque ----------
  function renderAll() {
    applyStaticTexts();
    renderHero();
    renderTop();
    renderRotationText();
    renderOverlapText();
    renderCalendarText();
    renderFooter();
    renderCharts();
    runSearch();
  }

  function setLang(lang) {
    if (lang !== "pt" && lang !== "en") return;
    if (lang === state.lang) return;
    state.lang = lang;
    try { localStorage.setItem("lang", lang); } catch (e) { /* ignore */ }
    document.querySelectorAll("#lang-switch button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === lang));
    renderAll();
  }

  async function init() {
    state.lang = detectLang();
    applyStaticTexts(); // traduz o "A carregar dados…" e o título antes dos dados chegarem

    document.querySelectorAll("#lang-switch button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === state.lang));
    $("#lang-switch").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) setLang(btn.dataset.lang);
    });
    $("#presets").addEventListener("click", (e) => {
      const btn = e.target.closest(".preset");
      if (!btn) return;
      state.tab = btn.dataset.tab;
      $("#presets").querySelectorAll(".preset").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      renderTop();
    });
    $("#excl-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.excl = b.dataset.st;
      $("#excl-tabs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      fillList($("#list-excl"), stats.overlap.exclusive[state.excl], "song", 5);
    });
    $("#q").addEventListener("input", runSearch);

    const get = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });
    [stats, index] = await Promise.all([get("data/stats.json"), get("data/tracks.json")]);

    haystack = index.tracks.map((tr) => plain(tr[0] + " " + tr[1]));
    STATIONS.forEach((st, i) => ($("#th-" + i).textContent = SHORT[st]));

    renderAll();

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderCharts);
  }

  init().catch((err) => {
    console.error(err);
    $("#error").hidden = false;
    $("#lede").textContent = "";
  });
})();