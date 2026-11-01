// 播客移动端 mockup：页面件在这里拼装，须在 ai-mobile/ai.js（渲染图标、状态栏、Dock、主题与标签切换）之前执行。
(function () {
  const P = window.PC;
  const icon = (name, size = 16, cls = "") =>
    `<span${cls ? ` class="${cls}"` : ""} data-i="${name}" data-s="${size}"></span>`;
  const ep = id => P.episodes.find(e => e.id === id) || P.episodes[0];
  const fmt = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  const mins = sec => `${Math.round(sec / 60)} 分钟`;
  const playIcon = (state, size) =>
    state === "loading"
      ? icon("loader-circle", size, "spin")
      : icon(state === "playing" ? "pause" : "play", size);

  // 柱高与桌面 Waveform 同一公式；颜色按该时刻的说话人，进度前的柱子实色
  function wave(e, progress, bars, loading) {
    const rects = [];
    for (let i = 0; i < bars; i++) {
      const h = Math.min(100, 22 + Math.abs(Math.sin(i * 1.7) * 48 + Math.sin(i * 0.37) * 26));
      const speaker = P.speakers[Math.floor(((i / bars) * e.duration) / 14) % 2];
      const lit = !loading && i / bars < progress;
      rects.push(
        `<rect class="t${speaker.tone}" x="${i * 4}" y="${(100 - h) / 2}" width="2" height="${h}" rx="1" style="fill:var(--tone);opacity:${lit ? 1 : 0.3}"/>`
      );
    }
    return `<svg viewBox="0 0 ${bars * 4 - 2} 100" preserveAspectRatio="none">${rects.join("")}</svg>`;
  }

  const host = el =>
    `<div class="p-host"><span class="ib">${icon("chevron-left", 24)}</span><span class="t">${el.dataset.title || "播客"}</span></div>`;

  const bar = () => {
    const total = Math.round(P.episodes.reduce((sum, e) => sum + e.duration, 0) / 60);
    return `<div class="p-bar"><span class="stat num"><b>${P.episodes.length}</b> 期<i>·</i>共 <b>${total}</b> 分钟</span><span class="p-ib">${icon("search", 19)}</span></div>`;
  };

  const pills = el => {
    const active = el.dataset.active || "all";
    const items = [["all", "全部"], ...Object.entries(P.kinds).map(([k, v]) => [k, v.label])];
    return `<div class="p-pills">${items
      .map(([k, label]) => `<span class="p-pill${k === active ? " on" : ""}">${label}</span>`)
      .join("")}</div>`;
  };

  const source = e =>
    `<div class="src">${icon(P.kinds[e.kind].icon, 13)}<span>${e.source}</span></div>`;

  function rows(el) {
    const ids = (el.dataset.ids || P.episodes.map(e => e.id).join(",")).split(",");
    const state = el.dataset.state || "playing";
    const showHeard = "heard" in el.dataset;
    return `<div class="p-list">${ids
      .map(id => {
        const e = ep(id);
        const active = id === el.dataset.on;
        const heard = showHeard && e.heard;
        const done = heard && e.heard >= e.duration;
        const progress =
          heard && !done && !active
            ? `<i class="heard" style="width:${(e.heard / e.duration) * 100}%"></i>`
            : "";
        const meta = [fmt(e.duration), e.date];
        if (heard)
          meta.push(done ? "已听完" : `<span class="on">剩 ${mins(e.duration - e.heard)}</span>`);
        return `<div class="p-row${active ? " on" : ""}"><span class="p-tile t${e.tone}${active ? " on" : ""}">${
          active ? playIcon(state, 20) : icon("audio-lines", 22)
        }${progress}</span><div class="m"><div class="tt">${e.title}</div>${source(e)}<div class="mt num">${meta.join(" · ")}</div></div><span class="p-ib">${icon("ellipsis", 18)}</span></div>`;
      })
      .join("")}</div>`;
  }

  function mini(el) {
    const e = ep(el.dataset.ep);
    const state = el.dataset.state || "playing";
    const time = Number(el.dataset.time ?? 205);
    const sub =
      state === "loading"
        ? `<div class="sub">正在下载音频${el.dataset.pct ? ` ${el.dataset.pct}%` : "…"}</div>`
        : state === "error"
          ? `<div class="sub err">音频加载失败</div>`
          : `<div class="sub num">${fmt(time)} / ${fmt(e.duration)} · ${e.source}</div>`;
    const line = state === "loading" ? 0 : (time / e.duration) * 100;
    return `<div class="p-mini${"float" in el.dataset ? " float" : ""}"><i class="pl" style="width:${line}%"></i><span class="go">${playIcon(state, 18)}</span><div class="m"><div class="tt">${e.title}</div>${sub}</div><span class="p-ib">${icon("x", 18)}</span></div>`;
  }

  function head(el) {
    const e = ep(el.dataset.ep);
    const k = P.kinds[e.kind];
    const legend = P.speakers.map(s => `<span class="t${s.tone}"><i></i>${s.name}</span>`).join("");
    return `<div class="p-head"><span class="p-src">${icon(k.icon, 14)}<span>${k.label} · ${e.source}</span>${
      e.kind === "notebook" ? "" : icon("arrow-up-right", 14)
    }</span><h2>${e.title}</h2><div class="p-meta num"><span>${fmt(e.duration)}</span><span>86 句</span><span>${e.date}生成</span><span class="p-legend">${legend}</span></div></div>`;
  }

  function script(el) {
    const cur = Number(el.dataset.cur ?? 4);
    const from = Number(el.dataset.from || 0);
    const n = Number(el.dataset.n || P.lines.length);
    const press = Number(el.dataset.press ?? -1);
    const lines = P.lines.slice(from, from + n).map((line, i) => {
      const index = from + i;
      const s = P.speakers[line.s];
      const cls =
        (index === cur ? " cur" : cur >= 0 && index < cur ? " past" : "") +
        (index === press ? " press" : "");
      return `<div class="p-line t${s.tone}${cls}"><span class="av">${s.name[0]}</span><div><div class="who">${s.name}<span>${fmt(line.t)}</span></div><div class="tx">${line.text}</div></div></div>`;
    });
    const cap =
      "cap" in el.dataset
        ? `<div class="cap">脚本<small>跟随播放高亮 · 点一句从这里播</small></div>`
        : "";
    return `<div class="p-script">${cap}${lines.join("")}</div>`;
  }

  const skip = name => `<span class="c">${icon(name, 26)}<b>15</b></span>`;
  const ERRORS = {
    "error-sync": [
      "cloud-off",
      "这期音频还没同步到手机",
      "它存在电脑的本地资源库里。到「我的 › 同步」同步资源文件后再试。",
    ],
    "error-net": ["wifi-off", "音频下载失败", "网络不可用，或存储服务没有响应。检查网络后重试。"],
  };
  function player(el) {
    const e = ep(el.dataset.ep);
    const state = el.dataset.state || "playing";
    const time = Number(el.dataset.time ?? 205);
    const loading = state === "loading" || state === "dl";
    const error = ERRORS[state];
    const top = error
      ? `<div class="p-errrow">${icon(error[0], 18)}<div class="m"><b>${error[1]}</b>${error[2]}</div><span class="p-mbtn">${icon("refresh-cw", 14)}重试</span></div>`
      : `<div class="p-wave num${loading ? " loading" : ""}"><span>${fmt(loading ? 0 : time)}</span>${wave(e, time / e.duration, 64, loading)}<span>${fmt(e.duration)}</span></div>`;
    const pct = el.dataset.pct || 50;
    const status =
      state === "loading"
        ? `<div class="p-status">正在下载音频…</div>`
        : state === "dl"
          ? `<div class="p-dl"><i style="width:${pct}%"></i></div><div class="p-status num">正在下载音频 ${pct}% · ${el.dataset.size || "8.6 / 17.2 MB"}</div>`
          : el.dataset.note
            ? `<div class="p-status">${el.dataset.note}</div>`
            : "";
    const big = playIcon(loading ? "loading" : state, 26);
    return `<div class="p-player">${top}<div class="p-ctrl"><span class="c rate">1.25×</span>${skip("rotate-ccw")}<span class="big${error ? " dis" : ""}">${big}</span>${skip("rotate-cw")}<span class="c">${icon("ellipsis", 22)}</span></div>${status}</div>`;
  }

  // 锁屏 / 通知栏的媒体控件（系统绘制）
  function np(el) {
    const e = ep(el.dataset.ep);
    const time = Number(el.dataset.time ?? 205);
    const app =
      "app" in el.dataset ? `<div class="app">${icon("podcast", 13)}Tau · 播客</div>` : "";
    return `<div class="p-np">${app}<div class="top"><span class="art">${icon("podcast", 24)}</span><div class="m"><b>${e.title}</b><small>播客 · ${e.source}</small></div></div><div class="bar"><i style="width:${(time / e.duration) * 100}%"></i></div><div class="tm"><span>${fmt(time)}</span><span>-${fmt(e.duration - time)}</span></div><div class="ct"><span>${icon("rotate-ccw", 26)}<b>15</b></span><span>${icon("pause", 34)}</span><span>${icon("rotate-cw", 26)}<b>15</b></span></div></div>`;
  }

  const T = { host, bar, pills, rows, mini, head, script, player, np };
  document.querySelectorAll("[data-tpl]").forEach(el => {
    const tpl = document.createElement("template");
    tpl.innerHTML = T[el.dataset.tpl](el);
    el.replaceWith(tpl.content);
  });
})();
