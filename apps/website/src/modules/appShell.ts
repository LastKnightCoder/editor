/**
 * 示意窗口的外壳：侧栏与标题栏按桌面端 app/navigation.ts 的真实信息架构生成，
 * 页面里用 data-side / data-top 声明当前选中项与面包屑。
 */
import { ICON_SRC, icon } from "../lib/dom.ts";

interface NavItem {
  label: string;
  icon: string;
  badge?: number;
  count?: number;
}

const NAV: [string, NavItem[]][] = [
  [
    "日常",
    [
      { label: "今日", icon: "flame" },
      { label: "日程", icon: "calendar" },
      { label: "待办", icon: "todo" },
      { label: "日记", icon: "pen" },
      { label: "番茄专注", icon: "timer" },
    ],
  ],
  [
    "知识",
    [
      { label: "卡片库", icon: "layers" },
      { label: "文章", icon: "file" },
      { label: "项目", icon: "folder" },
      { label: "白板", icon: "board" },
      { label: "数据库", icon: "table" },
    ],
  ],
  [
    "学习",
    [
      { label: "问题管理", icon: "help", count: 4 },
      { label: "Notebook", icon: "flask" },
      { label: "微信读书", icon: "book-open" },
      { label: "PDF", icon: "book" },
      { label: "漫步", icon: "walk" },
      { label: "闪卡复习", icon: "repeat", badge: 20 },
    ],
  ],
  [
    "AI",
    [
      { label: "AI 对话", icon: "chat" },
      { label: "Skill", icon: "spark" },
      { label: "MCP 服务器", icon: "plug" },
    ],
  ],
  [
    "分享",
    [
      { label: "协作", icon: "users" },
      { label: "发布", icon: "send" },
    ],
  ],
];

function renderSide(el: HTMLElement) {
  const active = el.dataset.side;
  const groups = NAV.map(([group, items]) => {
    const rows = items.map(item => {
      const tail = item.badge
        ? `<b class="badge">${item.badge}</b>`
        : item.count
          ? `<em class="cnt">${item.count}</em>`
          : "";
      return `<div class="side-item${item.label === active ? " on" : ""}">${icon(item.icon)}<span>${item.label}</span>${tail}</div>`;
    });
    return `<div class="side-group">${icon("chev")}${group}</div>${rows.join("")}<div class="side-sep"></div>`;
  });
  el.innerHTML = `<div class="side-scroll">${groups.join("")}</div><div class="side-item">${icon("sliders")}<span>设置</span></div>`;
}

interface TopConfig {
  crumb?: string[];
  mapOn?: boolean;
}

function renderTop(el: HTMLElement) {
  const { crumb = [], mapOn }: TopConfig = JSON.parse(el.dataset.top ?? "{}");
  const crumbHtml = crumb
    .map((c, i) =>
      i === crumb.length - 1 && crumb.length > 1
        ? `${icon("file")}${c}${icon("chev", "width:12px;height:12px")}`
        : c
    )
    .join(`<span class="sep">/</span>`);
  const isRail = el.closest(".app")?.classList.contains("rail");
  el.innerHTML = `<div class="lights"><i></i><i></i><i></i></div>
    <div class="app-brand"><img src="${ICON_SRC}" alt="" />Tau${icon("collapse")}</div>
    ${isRail ? `<span style="width:4px"></span>` : ""}
    <div class="nav-arrows">${icon("left")}${icon("right")}</div>
    <div class="crumb">${crumbHtml}</div>
    <div class="app-search">${icon("search")}搜索或跳转…<kbd>Ctrl K</kbd></div>
    <div class="app-tools"><span${mapOn ? ' style="color:var(--tau-accent-text)"' : ""}>${icon("map")}</span>${icon("chat")}${icon("monitor")}</div>`;
}

export function renderAppShells() {
  document.querySelectorAll<HTMLElement>("[data-side]").forEach(renderSide);
  document.querySelectorAll<HTMLElement>("[data-top]").forEach(renderTop);
}
