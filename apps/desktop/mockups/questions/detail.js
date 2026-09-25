/*
  问题详情（方案 A 常驻面板 / 方案 B 抽屉共用）：标题 → 分组与时间 → 状态三段 → 背景 → 材料 → 动作。
  【视觉参考，非导出源】
*/
(function () {
  "use strict";
  const { icon, esc, STATUS, KIND, statusRing, groupById, questionMaterials, relDate } = window.QM;

  function detailHTML(q) {
    const g = groupById(q.groupId);
    const mats = questionMaterials(q);
    const answers = mats.filter(m => m.kind === "answer");
    const refs = mats.filter(m => m.kind !== "answer");
    return `
      <div class="dt-head">
        <button class="field-btn" data-act="group"><i class="pdot" style="--c:var(--pc-${g.color})"></i>${esc(g.title)}${icon("chev-down")}</button>
        <span class="muted" style="font-size:12px">${relDate(q.createTime)}提出</span>
        <span class="spacer"></span>
        <button class="icon-btn" data-act="more" title="更多">${icon("more")}</button>
      </div>
      <div class="q-title" contenteditable="true" spellcheck="false" data-title>${esc(q.questionContent)}</div>
      <div class="steps" style="margin-top:14px">
        ${["not_started", "in_progress", "resolved"]
          .map(
            s =>
              `<button class="s-${s}${q.status === s ? " on" : ""}" data-status="${s}">${statusRing(s, "sm")}${STATUS[s].label}</button>`
          )
          .join("")}
      </div>

      <div class="sec-title">背景</div>
      <div class="desc-box" contenteditable="true" spellcheck="false">${esc(q.description)}</div>

      <div class="sec-title">我的答案<span class="spacer"></span>${answers.length ? "" : `<button class="btn btn-ghost" data-act="answer" style="height:24px">${icon("pen")}写答案</button>`}</div>
      ${
        answers.length
          ? `<div class="dt-mats">${answers.map(m => window.QM.materialHTML(m)).join("")}</div>`
          : `<div class="dt-empty">${q.status === "resolved" ? "已标为解答，但还没有用自己的话写下结论。" : "材料够了，就用自己的话把答案写下来。"}</div>`
      }

      <div class="sec-title">探究材料 <span class="muted" style="font-weight:400">${refs.length || ""}</span><span class="spacer"></span><span class="comps">${window.QM.compositionHTML({ answers: refs.map(m => m.id) })}</span></div>
      ${
        refs.length
          ? `<div class="dt-mats">${refs.map(m => window.QM.materialHTML(m)).join("")}</div>`
          : `<div class="dt-empty">${icon("lightbulb")}从这里开始探究：读到什么、想到什么，写成一张卡片挂上来；或者关联已有的卡片、文章。</div>`
      }
      <div class="act-row" style="margin-top:10px">
        <button class="btn btn-soft" data-act="card">${icon("layers")}写一张卡片</button>
        <button class="btn btn-soft" data-act="new">${icon("plus")}新建${icon("chev-down")}</button>
        <button class="btn btn-soft" data-act="link">${icon("link")}关联已有<kbd>L</kbd></button>
      </div>

      <div class="sec-title">探究轨迹<span class="spacer"></span><span class="stat">${window.QM.trajectoryStats(q)}</span></div>
      ${window.QM.trajectoryHTML(q)}`;
  }

  /** 绑定一次即可，事件委托；getQ 返回当前问题 */
  function bindDetail(root, getQ) {
    const QM = window.QM;
    root.addEventListener("click", e => {
      const q = getQ();
      if (!q) return;
      const s = e.target.closest("[data-status]");
      if (s) return QM.setStatus(q.id, s.dataset.status);
      const un = e.target.closest("[data-unlink]");
      if (un) return (e.stopPropagation(), QM.unlinkMaterial(q.id, +un.dataset.unlink));
      const a = e.target.closest("[data-act]");
      if (!a) {
        const m = e.target.closest("[data-mat]");
        if (m)
          QM.toast(`打开「${esc(QM.matById(+m.dataset.mat).title)}」（页内导航到卡片 / 文章详情）`);
        return;
      }
      const act = a.dataset.act;
      if (act === "group") QM.groupMenu(a, q);
      else if (act === "more") QM.questionMenu(a, q);
      else if (act === "card") QM.openComposer(q.id, "card");
      else if (act === "answer") QM.openComposer(q.id, "answer");
      else if (act === "link") QM.openPicker(q.id);
      else if (act === "new") QM.newMenu(a, q);
    });
    QM.bindTrajectory(root, getQ);
    root.addEventListener(
      "blur",
      e => {
        const q = getQ();
        if (!q) return;
        if (e.target.matches("[data-title]")) {
          const t = e.target.textContent.trim();
          if (t && t !== q.questionContent) QM.updateQuestion(q.id, { questionContent: t });
        } else if (e.target.matches(".desc-box")) {
          q.description = e.target.textContent.trim();
        }
      },
      true
    );
    root.addEventListener("keydown", e => {
      if (e.target.matches("[data-title]") && e.key === "Enter") {
        e.preventDefault();
        e.target.blur();
      }
    });
  }

  window.QD = { detailHTML, bindDetail };
})();
