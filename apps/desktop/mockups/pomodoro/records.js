/*
  专注记录共用件：记录行 / 修改时长 Popover / 记录菜单 / 按天分组的无限滚动列表（含批量选择）。
  【视觉参考，非导出源】—— 依赖 shared.js 的 window.P。
  接口口径：updatePomodoroSession(sessionId, focusMs) 只能改专注时长（起止时间不变）；
  删除走 deletePomodoroSession(s)，界面不二次确认，Toast 撤销（同 D-040 待办口径）。
*/
(function () {
  "use strict";
  const {
    icon,
    hm,
    fmtDur,
    fmtClock,
    presetById,
    colorOf,
    recTags,
    timing,
    timer,
    now,
    on,
    toast,
    MIN,
  } = P;

  const css = document.createElement("style");
  css.textContent = `
  .rec{display:flex;align-items:center;gap:9px;min-height:36px;padding:0 4px 0 10px;border-radius:9px;position:relative}
  .rec:hover{background:var(--bg-hover)}
  .rec-time{flex:none;width:90px;font-size:12.5px;color:var(--ink-2);font-variant-numeric:tabular-nums}
  .rec-time .to{color:var(--ink-3)}
  .rec-name{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:4.2em;max-width:9em}
  .rec-name.gone{color:var(--ink-3);font-weight:400}
  .rec-tags{display:flex;gap:4px;flex:none}
  .rec-dur{flex:none;display:inline-flex;align-items:center;font-size:12.5px;font-weight:500;color:var(--ink-1);height:24px;padding:0 7px;border-radius:7px;font-variant-numeric:tabular-nums}
  .rec-dur:hover{background:var(--bg-press)}
  .rec-more{opacity:0}
  .rec:hover .rec-more,.rec-more:focus-visible{opacity:1}
  .rec.live .rec-dur{color:var(--accent-text)}
  .rec.sel{background:var(--bg-selected)}
  .chk{flex:none;width:16px;height:16px;border-radius:5px;border:1px solid var(--line-1);background:var(--bg-surface);display:grid;place-items:center;color:var(--ink-inverse)}
  .rec.sel .chk{background:var(--accent);border-color:var(--accent)}
  .chk .icon{width:11px;height:11px;stroke-width:2.5;opacity:0}
  .rec.sel .chk .icon{opacity:1}
  .day-h{display:flex;align-items:baseline;gap:8px;padding:14px 10px 6px;position:sticky;top:0;z-index:1;background:var(--bg-surface)}
  .day-h b{font-size:13px;font-weight:600}
  .day-h .d{font-size:12px;color:var(--ink-3)}
  .day-h .s{margin-left:auto;font-size:12px;color:var(--ink-2);font-variant-numeric:tabular-nums}
  .day-rib{margin:0 10px 6px;height:8px;border-radius:4px}
  .day-rib .blk{top:0;bottom:0;border-radius:3px}
  .day-rib .gap{top:0;bottom:0}
  .day-rib.big{height:22px;border-radius:6px;margin-top:2px;margin-bottom:8px}
  .day-rib.big .blk{top:3px;bottom:3px;border-radius:4px}
  .day-rib.big .gap{top:3px;bottom:3px}
  .hist-more{display:flex;justify-content:center;align-items:center;gap:8px;padding:14px 0 6px;color:var(--ink-3);font-size:12px}
  .sel-bar{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--bg-page);margin-top:8px;font-size:12.5px}
  [data-theme="cocoa"] .sel-bar{background:var(--bg-page)}
  `;
  document.head.appendChild(css);

  function recRowHTML(s, opts = {}) {
    const p = presetById(s.presetId);
    const name = p
      ? `<span class="rec-name">${p.name}</span>`
      : `<span class="rec-name gone">已删除的预设</span>`;
    const chk = opts.select ? `<span class="chk">${icon("check")}</span>` : "";
    return `<div class="rec${opts.selected ? " sel" : ""}" data-id="${s.id}">${chk}
      <span class="rec-time">${hm(s.startTime)}<span class="to">–${hm(s.endTime)}</span></span>
      <span class="pdot" style="--c:${colorOf(s.presetId)}"></span>${name}
      <span class="rec-tags">${opts.noTags ? "" : opts.tags === "early" ? (P.isEarly(s) ? '<span class="tag warn">提前结束</span>' : "") : recTags(s)}</span><span class="spacer"></span>
      <button class="rec-dur" data-dur title="修改专注时长">${fmtDur(s.focusMs)}</button>
      ${opts.select ? "" : `<button class="ibtn rec-more" data-more title="更多">${icon("more")}</button>`}</div>`;
  }
  function liveRowHTML() {
    const t = timing();
    if (!t) return "";
    const s = timer.session;
    return `<div class="rec live"><span class="rec-time">${hm(s.startTime)}<span class="to">–</span></span>
      <span class="pdot" style="--c:${colorOf(s.presetId)}"></span><span class="rec-name">${t.preset.name}</span>
      <span class="rec-tags"><span class="tag accent">${t.paused ? "已暂停" : "进行中"}</span></span><span class="spacer"></span>
      <span class="rec-dur" data-live>${fmtDur(t.elapsed)}</span></div>`;
  }

  function openFocusEditor(anchor, s) {
    const min = Math.round(s.focusMs / MIN);
    P.openPop(
      anchor,
      `<div class="pop-title">${icon("clock")}修改专注时长</div>
      <div class="stepper"><button class="ibtn" data-step="-1">${icon("minus")}</button><input class="input" data-v value="${min}"><span class="unit">分钟</span><button class="ibtn" data-step="1">${icon("plus")}</button></div>
      <p style="font-size:12.5px;color:var(--ink-2);margin-top:10px">${hm(s.startTime)}–${hm(s.endTime)} · 起止时间不变，只修正计入统计的专注时长。</p>
      <div class="pop-foot"><button class="btn btn-ghost" data-x>取消</button><button class="btn btn-primary" data-ok>保存</button></div>`,
      {
        width: 280,
        placement: "bottom-end",
        onMount(el, close) {
          const v = el.querySelector("[data-v]");
          v.select();
          el.querySelectorAll("[data-step]").forEach(
            b => (b.onclick = () => (v.value = Math.max(1, (+v.value || 0) + +b.dataset.step)))
          );
          const ok = () => {
            const n = +v.value;
            if (!(n >= 1 && n <= 600)) return v.focus();
            const prev = s.focusMs;
            P.updateSessionFocus(s.id, n * MIN);
            close();
            toast(`已改为 ${n} 分钟`, () => P.updateSessionFocus(s.id, prev));
          };
          el.querySelector("[data-ok]").onclick = ok;
          el.querySelector("[data-x]").onclick = close;
          el.addEventListener("keydown", e => e.key === "Enter" && ok());
        },
      }
    );
  }
  function recordMenu(anchor, s) {
    P.openMenu(
      anchor,
      [
        { icon: "clock", label: "修改专注时长", act: "edit" },
        { icon: "calendar", label: "在日程中查看", act: "cal" },
        "-",
        { icon: "trash", label: "删除记录", act: "del", danger: true },
      ],
      e => {
        if (e.act === "edit")
          openFocusEditor(
            (anchor.closest && anchor.closest(".rec")?.querySelector("[data-dur]")) || anchor,
            s
          );
        if (e.act === "cal") toast("跳转日程页并定位到当天（日历映射已存在）");
        if (e.act === "del") {
          const undo = P.deleteSessions([s.id]);
          toast("已删除 1 条记录", undo);
        }
      },
      { placement: "bottom-end" }
    );
  }
  /** 行内事件代理：点时长改时长、点更多开菜单、选择模式下点行勾选 */
  function bindRows(root, getSel) {
    root.addEventListener("click", e => {
      const row = e.target.closest(".rec[data-id]");
      if (!row) return;
      const s = P.sessions.find(x => x.id === +row.dataset.id);
      if (!s) return;
      const sel = getSel && getSel();
      if (sel) {
        sel.has(s.id) ? sel.delete(s.id) : sel.add(s.id);
        row.classList.toggle("sel", sel.has(s.id));
        sel.onChange && sel.onChange();
        return;
      }
      if (e.target.closest("[data-dur]")) openFocusEditor(e.target.closest("[data-dur]"), s);
      else if (e.target.closest("[data-more]")) recordMenu(e.target.closest("[data-more]"), s);
    });
    root.addEventListener("contextmenu", e => {
      const row = e.target.closest(".rec[data-id]");
      if (!row || (getSel && getSel())) return;
      e.preventDefault();
      recordMenu(
        { x: e.clientX, y: e.clientY },
        P.sessions.find(x => x.id === +row.dataset.id)
      );
    });
  }

  /**
   * 全部记录：按天分组、sticky 日头 + 当天细时间带、触底自动加载（IntersectionObserver，无「加载更多」按钮）。
   * 选择模式：行首复选、底部选择条「删除」→ Toast 撤销（取代 legacy 批量管理大弹窗）。
   */
  function mountHistory(scroller, opts = {}) {
    const PAGE = 6;
    let shown = PAGE,
      loading = false,
      selecting = false;
    const sel = new Set();
    sel.onChange = () => opts.onSelChange && opts.onSelChange(sel.size);
    function render() {
      const groups = P.groupByDay(opts.filter ? P.sessions.filter(opts.filter) : P.sessions);
      const more = shown < groups.length;
      scroller.innerHTML =
        groups
          .slice(0, shown)
          .map(
            g => `<section><div class="day-h"><b>${P.dayLabel(g.ts)}</b>${g.off > -3 ? `<span class="d">${P.dateCN(g.ts)}</span>` : ""}<span class="s">${g.items.length} 个 · ${fmtDur(g.focusMs)}</span></div>
            ${opts.ribbons === false ? "" : `<div class="ribbon day-rib${g.off === 0 ? " big" : ""}">${P.ribbonHTML(g.items, { off: g.off, live: g.off === 0, now: g.off === 0 })}</div>`}
            ${g.off === 0 && !selecting && opts.live !== false ? liveRowHTML() : ""}
            ${g.items.map(s => recRowHTML(s, { select: selecting, selected: sel.has(s.id), noTags: opts.noTags })).join("")}</section>`
          )
          .join("") +
        (more
          ? `<div class="hist-more" data-sentinel>${loading ? '<span class="spin"></span>加载中' : "继续下滑加载更早的记录"}</div>`
          : `<div class="hist-more">没有更早的记录了</div>`);
      const sen = scroller.querySelector("[data-sentinel]");
      if (sen) io.observe(sen);
    }
    const io = new IntersectionObserver(
      es => {
        if (!es.some(e => e.isIntersecting) || loading) return;
        loading = true;
        render();
        setTimeout(() => {
          loading = false;
          shown += PAGE;
          render();
        }, 420);
      },
      { root: scroller, rootMargin: "0px 0px 160px 0px" }
    );
    bindRows(scroller, () => (selecting ? sel : null));
    on(type => {
      if (type === "data" || type === "timer") render();
      if (type === "tick") {
        const l = scroller.querySelector("[data-live]");
        const t = timing();
        if (l && t) l.textContent = fmtDur(t.elapsed);
      }
    });
    render();
    return {
      render,
      setSelecting(v) {
        selecting = v;
        sel.clear();
        sel.onChange();
        render();
      },
      selecting: () => selecting,
      deleteSelected() {
        const ids = [...sel];
        if (!ids.length) return;
        const undo = P.deleteSessions(ids);
        toast(`已删除 ${ids.length} 条记录`, undo);
        sel.clear();
        sel.onChange();
      },
      selectDay(off) {
        P.sessionsOn(off).forEach(s => sel.add(s.id));
        sel.onChange();
        render();
      },
    };
  }

  window.R = { recRowHTML, liveRowHTML, openFocusEditor, recordMenu, bindRows, mountHistory };
})();
