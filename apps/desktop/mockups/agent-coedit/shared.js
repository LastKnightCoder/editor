/* Agent 协同编辑样板间 · 共享渲染（视觉参考，非实现源） */

export const PLANS = [
  ["index.html", "总览"],
  ["a-suggest.html", "A 建议模式"],
  ["b-thread.html", "B 批注对话"],
  ["c-live.html", "C 放手改 + 回看"],
];

// 协作者：两个 Agent + 用户自己，颜色取 tag 色板
export const P = {
  me: { name: "我", init: "我", t: "tu" },
  proof: { name: "校对", init: "校", t: "t2", bot: true, role: "改错字、统一术语" },
  research: { name: "调研员", init: "调", t: "t1", bot: true, role: "补资料、核对数据" },
};

export const ic = (name, extra = "") => `<i data-lucide="${name}" ${extra}></i>`;

export function av(key, cls = "") {
  const p = P[key];
  return `<span class="av ${p.t} ${cls}" title="${p.name}">${p.init}${p.bot ? `<span class="bot">${ic("sparkles")}</span>` : ""}</span>`;
}
export const caret = key => `<span class="caret ${P[key].t}"><i>${P[key].name}</i></span>`;
export const who = key => `<span class="who ${P[key].t}">${P[key].name}</span>`;
export const typing = key => `<span class="typing ${P[key].t}"><i></i><i></i><i></i></span>`;

export function titlebar(presence, extra = "") {
  return `<div class="tbar">
    ${ic("panel-left")}
    <span class="crumb">文章 / <b>离线优先的笔记同步</b></span>
    <span class="sp"></span>${extra}
    <div class="presence">${presence}</div>
    <button class="btn ghost">${ic("share-2")}共享</button>
  </div>`;
}

export function win({ presence, extra, doc, side = "" }) {
  return `<div class="win">${titlebar(presence, extra)}<div class="body"><div class="main">${doc}</div>${side}</div></div>`;
}

// 文章正文骨架：slots 覆盖各段落
export function doc(slots = {}) {
  const s = (k, d) => slots[k] ?? d;
  return `<div class="doc">
    <h1>离线优先的笔记同步</h1>
    <div class="meta">${s("meta", "更新于 2 分钟前 · 2,340 字")}</div>
    ${s("p1", `<p>多数笔记软件把「同步」理解为把文件推到服务器。离线优先换了一个前提：本机副本才是主角，服务器只是另一个副本。这样断网时什么都不用等，联网后再把改动合起来。</p>`)}
    <h2>为什么用 CRDT</h2>
    ${s("p2", `<p>传统做法是最后写入者获胜，两台设备同时改一段话，总有一方的改动被吞掉。CRDT 让每次修改都带上足够的上下文，任何顺序合并都得到同一个结果，所以不需要中心服务器裁决。</p>`)}
    ${s("p3", `<p>代价是元数据。Yjs 的文档在长期编辑后会膨胀到正文的 3 到 5 倍，需要定期压缩快照，并且压缩不能丢掉别的设备尚未收到的增量。</p>`)}
    <h2>现有产品怎么做</h2>
    ${s("p4", `<p>Obsidian 的官方同步按文件做三方合并，冲突时生成副本；Logseq 曾尝试基于文件的同步，后来转向数据库版本。Notion 的离线模式到 2025 年才支持整页离线编辑。</p>`)}
    ${s("p5", `<p>这些方案的共同点是：合并发生在文件或页面层级，而不是字符层级。</p>`)}
  </div>`;
}

export function mount(planKey, scenes) {
  const keys = Object.keys(scenes);
  let cur = new URLSearchParams(location.search).get("s") || keys[0];
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  const render = () => {
    bar.innerHTML = `<b>Agent 协同编辑</b>
      ${PLANS.map(([h, l]) => `<a href="${h}" class="${h === planKey ? "on" : ""}">${l}</a>`).join("")}
      <span class="sp"></span>
      <div class="scenes">${keys.map((k, i) => `<button data-s="${k}" class="${k === cur ? "on" : ""}">${i + 1} ${scenes[k].label}</button>`).join("")}</div>
      <button class="mb-btn" id="tg-mode">浅/深</button>`;
    const sc = scenes[cur];
    stage.innerHTML = `${sc.view}<div class="cap"><h3>${sc.label}</h3>${sc.cap}</div>`;
    window.lucide?.createIcons();
    history.replaceState(null, "", `?s=${cur}`);
  };
  const stage = document.createElement("div");
  stage.className = "stage";
  document.body.append(bar, stage);
  bar.addEventListener("click", e => {
    const b = e.target.closest("[data-s]");
    if (b) {
      cur = b.dataset.s;
      render();
    }
    if (e.target.closest("#tg-mode")) {
      const h = document.documentElement;
      h.dataset.mode = h.dataset.mode === "dark" ? "light" : "dark";
    }
  });
  addEventListener("keydown", e => {
    const i = keys.indexOf(cur);
    if (e.key === "ArrowRight" && i < keys.length - 1) {
      cur = keys[i + 1];
      render();
    }
    if (e.key === "ArrowLeft" && i > 0) {
      cur = keys[i - 1];
      render();
    }
  });
  render();
}
