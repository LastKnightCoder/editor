/**
 * 白板示意：按画布里 HTML 元素的实际位置，画手绘风格的形状、箭头与导图连线；
 * 数据库示意：视图标签切换，进入视口后自动轮播，用户点过标签就停下。
 */
import { mustQuery, prefersReducedMotion } from "../lib/dom.ts";
import { seededRandom } from "../lib/random.ts";

type Box = { x: number; y: number; w: number; h: number };

const SEED = 11;
let rand = seededRandom(SEED);
const jitter = (amount: number) => (rand() - 0.5) * 2 * amount;
const fmt = (n: number) => n.toFixed(1);

/** 一笔略带弧度的线 */
function stroke(x1: number, y1: number, x2: number, y2: number, bow: number) {
  const mx = (x1 + x2) / 2 + jitter(bow * 1.5);
  const my = (y1 + y2) / 2 + jitter(bow * 1.5);
  return `M${fmt(x1 + jitter(bow))} ${fmt(y1 + jitter(bow))}Q${fmt(mx)} ${fmt(my)} ${fmt(x2 + jitter(bow))} ${fmt(y2 + jitter(bow))}`;
}

/** 手绘直线：两笔略微错开 */
function roughLine(x1: number, y1: number, x2: number, y2: number, bow = 1.6) {
  return stroke(x1, y1, x2, y2, bow) + stroke(x1, y1, x2, y2, bow);
}

function roughPolygon(points: [number, number][]) {
  return points.map((p, i) => roughLine(...p, ...points[(i + 1) % points.length])).join("");
}

/** 手绘椭圆：两圈，半径带抖动，结尾略微越过起点 */
function roughEllipse(cx: number, cy: number, rx: number, ry: number) {
  return [0, 1]
    .map(() => {
      const start = rand() * Math.PI * 2;
      const pts = Array.from({ length: 26 }, (_, i) => {
        const a = start + (i / 22) * Math.PI * 2;
        const k = 1 + jitter(0.03);
        return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
      });
      let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        d += `Q${fmt(pts[i][0])} ${fmt(pts[i][1])} ${fmt(mx)} ${fmt(my)}`;
      }
      return d;
    })
    .join("");
}

/** 斜线填充：-45° 平行线，按形状轮廓裁剪 */
function hachure(box: Box, gap: number, cross = false) {
  let d = "";
  for (let t = -box.h; t < box.w; t += gap) {
    d += stroke(box.x + t, box.y + box.h, box.x + t + box.h, box.y, 0.8);
    if (cross) d += stroke(box.x + t, box.y, box.x + t + box.h, box.y + box.h, 0.8);
  }
  return d;
}

function arrow(x1: number, y1: number, x2: number, y2: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = (offset: number) =>
    roughLine(x2, y2, x2 - Math.cos(angle + offset) * 11, y2 - Math.sin(angle + offset) * 11, 0.6);
  return roughLine(x1, y1, x2, y2, 2.2) + head(0.45) + head(-0.45);
}

function boxOf(el: HTMLElement): Box {
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}

const center = (b: Box) => [b.x + b.w / 2, b.y + b.h / 2] as const;

function drawBoard() {
  rand = seededRandom(SEED);
  const board = mustQuery(".wb");
  const svg = mustQuery<SVGSVGElement>("#wb-ink");
  svg.setAttribute("viewBox", `0 0 ${board.clientWidth} ${board.clientHeight}`);
  const q = (sel: string) => boxOf(mustQuery(sel, board));

  const parts: string[] = [];
  const path = (d: string, cls: string, clip?: string) =>
    parts.push(`<path class="${cls}" d="${d}"${clip ? ` clip-path="url(#${clip})"` : ""}/>`);

  // 画框里的三个形状：矩形 + 斜线、椭圆 + 交叉线、菱形 + 淡涂
  const note = q('[data-shape="rect"]');
  const rect = { x: note.x - 18, y: note.y - 14, w: note.w + 36, h: note.h + 28 };
  const rectPts: [number, number][] = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ];
  parts.push(
    `<clipPath id="wb-clip-rect"><polygon points="${rectPts.map(p => p.join(",")).join(" ")}"/></clipPath>`
  );
  path(hachure(rect, 8), "fill-a", "wb-clip-rect");
  path(roughPolygon(rectPts), "stroke");

  const sw = q('[data-shape="ellipse"]');
  const [ex, ey] = center(sw);
  const erx = sw.w / 2 + 26;
  const ery = sw.h / 2 + 18;
  parts.push(
    `<clipPath id="wb-clip-ellipse"><ellipse cx="${ex}" cy="${ey}" rx="${erx}" ry="${ery}"/></clipPath>`
  );
  path(
    hachure({ x: ex - erx, y: ey - ery, w: erx * 2, h: ery * 2 }, 11, true),
    "fill-b",
    "wb-clip-ellipse"
  );
  path(roughEllipse(ex, ey, erx, ery), "stroke");

  const res = q('[data-shape="diamond"]');
  const [dx, dy] = center(res);
  const dw = res.w / 2 + 44;
  const dh = res.h / 2 + 26;
  const diamond: [number, number][] = [
    [dx, dy - dh],
    [dx + dw, dy],
    [dx, dy + dh],
    [dx - dw, dy],
  ];
  parts.push(`<polygon class="fill-c" points="${diamond.map(p => p.join(",")).join(" ")}"/>`);
  path(roughPolygon(diamond), "stroke");

  path(arrow(rect.x + rect.w / 2, rect.y + rect.h + 4, dx - dw / 2 - 4, dy - dh / 2 - 2), "stroke");
  path(arrow(ex, ey + ery + 4, dx + dw / 2 + 2, dy - dh / 2 - 2), "stroke");

  // 画框 → 导图中心
  const frame = q(".wb-frame");
  const root = q('[data-mm="root"]');
  path(
    arrow(frame.x + frame.w + 8, root.y + root.h / 2, root.x - 10, root.y + root.h / 2),
    "stroke accent"
  );

  // 导图连线：父节点右缘 → 子节点左缘，按分支着色
  board.querySelectorAll<HTMLElement>("[data-mm-parent]").forEach(node => {
    const parent = q(`[data-mm="${node.dataset.mmParent}"]`);
    const child = boxOf(node);
    const x1 = parent.x + parent.w;
    const y1 = parent.y + parent.h / 2;
    // 三级节点是纯文字 + 下划线，连线接到下划线上
    const x2 = child.x;
    const y2 = node.classList.contains("mm-l") ? child.y + child.h - 1 : child.y + child.h / 2;
    const mx = (x1 + x2) / 2;
    parts.push(
      `<path class="mm-edge ${node.dataset.branch}" d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`
    );
  });

  // 导图叶子 → 嵌入文章：虚线引用
  const leaf = q('[data-mm="desk"]');
  const doc = q(".wb-doc");
  parts.push(
    `<path class="link" d="M${leaf.x + leaf.w + 6} ${leaf.y + leaf.h / 2}C${doc.x - 40} ${leaf.y + leaf.h / 2} ${doc.x - 50} ${doc.y + 60} ${doc.x - 8} ${doc.y + 60}"/>`
  );

  svg.innerHTML = parts.join("");
}

const DB_ROTATE_MS = 3200;

function initDatabaseViews() {
  const root = mustQuery("#database");
  const tabs = [...root.querySelectorAll<HTMLElement>("[data-db-view]")];
  const show = (view: string) => {
    tabs.forEach(t => t.classList.toggle("on", t.dataset.dbView === view));
    root
      .querySelectorAll<HTMLElement>("[data-db-pane]")
      .forEach(p => p.classList.toggle("on", p.dataset.dbPane === view));
  };

  let timer = 0;
  let picked = false;
  tabs.forEach(t =>
    t.addEventListener("click", () => {
      // 用户点过就不再自动切换
      picked = true;
      clearInterval(timer);
      show(t.dataset.dbView ?? "table");
    })
  );
  if (prefersReducedMotion()) return;

  new IntersectionObserver(
    ([entry]) => {
      clearInterval(timer);
      if (picked || !entry.isIntersecting) return;
      timer = window.setInterval(() => {
        const next = (tabs.findIndex(t => t.classList.contains("on")) + 1) % tabs.length;
        show(tabs[next].dataset.dbView ?? "table");
      }, DB_ROTATE_MS);
    },
    { threshold: 0.5 }
  ).observe(mustQuery(".db-fit", root));
}

export function initBoard() {
  drawBoard();
  void document.fonts.ready.then(drawBoard);
  initDatabaseViews();
}
