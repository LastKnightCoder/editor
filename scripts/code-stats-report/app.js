// 外壳：视图切换、筛选与主题
(function () {
  const S = window.Stats;
  const stage = document.getElementById("stage");

  const { generatedAt, scope } = window.CODE_STATS;
  document.getElementById("meta").textContent = [scope, `生成于 ${generatedAt}`]
    .filter(Boolean)
    .join(" · ");

  function chips(el, values, set, label, swatch) {
    el.innerHTML = values
      .map(
        v =>
          `<button class="chip" data-v="${v}" aria-pressed="${set.has(v)}">${swatch ? `<i class="sw" style="background:${S.color(v)}"></i>` : ""}${label(v)}</button>`
      )
      .join("");
    el.onclick = e => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const v = b.dataset.v;
      // 单击只看这一项；已只剩它时恢复全部，免得筛成空
      const only = set.size === 1 && set.has(v);
      set.clear();
      (only ? values : [v]).forEach(x => set.add(x));
      S.views.treemap.reset();
      S.emit();
    };
  }

  function render() {
    chips(document.getElementById("group-filter"), S.GROUPS, S.state.groups, v => v);
    chips(
      document.getElementById("lang-filter"),
      S.ALL_LANGS,
      S.state.langs,
      v => S.LANG_LABEL[v],
      true
    );
    document
      .querySelectorAll("#tabs button")
      .forEach(b => b.setAttribute("aria-pressed", b.dataset.view === S.state.view));
    S.views[S.state.view].render(stage);
  }

  document.getElementById("tabs").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    S.state.view = b.dataset.view;
    S.emit();
  });
  document.getElementById("theme-toggle").addEventListener("click", e => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "";
    e.currentTarget.textContent = dark ? "浅色" : "深色";
  });
  window.addEventListener("resize", () => S.state.view === "treemap" && render());

  S.onChange(render);
  render();
})();
