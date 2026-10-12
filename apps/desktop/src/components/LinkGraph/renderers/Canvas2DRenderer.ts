/**
 * Canvas 2D 渲染器 —— S/M 档（≤ 2000 节点）。
 *
 * 只读 scene + camera + palette，不回写任何布局状态；换成 WebGL（批次 5）
 * 时实现同一个 draw 签名即可，core 层一行不用改。
 *
 * 绘制顺序（后画的盖前面）：连线 → 高亮连线 → 节点辉光 → 节点 → 标签。
 * 高亮的线单独走一遍，是为了让它盖在所有淡线之上，而不是夹在中间。
 */

import type { Camera } from "../core/camera";
import { clusterGeometry, mapSubtopicGeometry } from "../core/clusterGeometry";
import { isMapScene, type MapScene } from "../core/mapScene";
import type { GraphNode, GraphPalette, GraphScene } from "../core/types";
import { withAlpha } from "../core/palette";
import { springScale } from "../core/timeline";

export interface RenderState {
  /** 悬停节点 id，null 表示无悬停（此时不降淡任何节点） */
  hoveredId: number | null;
  /** 当前卡片（编辑中的那一张等，通常只有一两个）：accent 填色 + 辉光 */
  currentIds: Set<number>;
  /**
   * 筛选命中；null 表示没有筛选。命中的保持自己的主题色，未命中的降淡。
   * 与 currentIds 分开：筛选命中可能是几百张甚至全部，全刷成 accent 加辉光，
   * 整张图就成了一片蓝雾，主题色全没了（用户反馈过，「全部」时尤其难看）
   */
  filterIds?: Set<number> | null;
  /** 降淡的中心节点的一度邻居（通常就是悬停节点的邻居） */
  adjacentIds: Set<number>;
  /**
   * 降淡以谁为中心；不传时等于 hoveredId。悬停结束后的淡出期间悬停已为 null，
   * 但降淡还要以刚离开的节点为中心退回去，所以两者分开。
   */
  focusId?: number | null;
  /** 簇 id → 颜色（由宿主按主题算好缓存，渲染器不做取色） */
  clusterColors?: Map<number, string>;
  /**
   * 悬停强调的程度 0..1（非邻居降淡、簇背景隐去都按它插值）。不传时有悬停即 1。
   * 由宿主做短时渐变：鼠标在密集节点上扫过时悬停频繁开关，硬切会整屏频闪。
   */
  emphasis?: number;
  /**
   * 入场播放时每个节点的显现程度 0..1（0 未出现，1 长满）；不在表里的按 1 处理，
   * 不传表示没在播放。时间逻辑在 core/timeline.ts，渲染器只读这张表。
   */
  reveal?: Map<number, number> | null;
}

/** 缩放小于此值时不画卡片标签，改画簇标签（语义缩放的雏形） */
const CLUSTER_LABEL_MAX_SCALE = 0.55;
/**
 * 离线地图的三级缩放阈值。按真实库校准：地图约 730×700 世界单位，
 * 卡片最近邻间距中位数约 12.6——fit 后缩放约 0.8，卡片间距只有 10px，
 * 这时只该看大主题；放到 1.3 左右子主题的范围才看得清；到 2.4 卡片间距约 30px，
 * 标题才放得下。
 */
export const MAP_SUBTOPIC_LABEL_SCALE = 1.3;
export const MAP_CARD_LABEL_SCALE = 2.4;
/** 簇背景色块的不透明度：只做「这一片是一起的」的暗示，不能盖住节点 */
const CLUSTER_BLOB_ALPHA = 0.1;

/** 悬停时非邻居节点的不透明度（强调程度为 1 时） */
const DIMMED_ALPHA = 0.25;
/** 筛选未命中的节点的不透明度：比悬停降淡更轻，筛选是常驻状态，要能看出命中落在哪几个岛 */
const FILTERED_OUT_ALPHA = 0.2;

/** 标签显示的缩放阈值：太小时全是糊字，不如不画 */
const LABEL_MIN_SCALE = 0.55;
/** 缩放较小时只给度数高的节点显示标签 */
const LABEL_DEGREE_GATE = 3;
/** 标签占位高度，用于网格避让 */
const LABEL_CELL = 18;

export type Box = { left: number; right: number; top: number; bottom: number };

export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D;
  /** 最近一帧调色板的字体栈（算标签占位时用，ctx.font 不认 var()） */
  private fontFamily = "sans-serif";
  private dpr = 1;
  private width = 0;
  private height = 0;

  /** 最近一帧悬停标题的占位框（画布坐标，含底板）；没有悬停标题时为 null */
  private lastHoverLabelBox: Box | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("LinkGraph: 无法获取 2D 上下文");
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  draw(scene: GraphScene, camera: Camera, palette: GraphPalette, state: RenderState) {
    const ctx = this.ctx;
    this.fontFamily = palette.fontFamily;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const hovering = state.hoveredId !== null;
    const focusId = state.focusId === undefined ? state.hoveredId : state.focusId;
    const emphasis = focusId !== null ? Math.min(1, Math.max(0, state.emphasis ?? 1)) : 0;
    const dimming = emphasis > 0;
    const scale = camera.scale;
    const geometry = clusterGeometry(scene);
    const mapMode = isMapScene(scene);
    const filter = state.filterIds ?? null;
    const filteredOut = (id: number) => filter !== null && !filter.has(id);
    const reveal = state.reveal ?? null;
    const shown = (id: number) => (reveal ? (reveal.get(id) ?? 1) : 1);

    // ---- 簇的背景色块：画在最底层，只给出「岛」的轮廓暗示。
    // 离线地图模式不画：主题在空间上已经分成了清楚的岛，再叠一层彩色光晕只会发脏
    if (!mapMode && !reveal && emphasis < 1 && state.clusterColors) {
      for (const [cluster, shape] of geometry) {
        const color = state.clusterColors.get(cluster);
        if (!color) continue;
        const [cx, cy] = camera.toCanvas(shape.x, shape.y);
        const r = shape.radius * scale;
        if (r < 12 || cx + r < 0 || cy + r < 0 || cx - r > this.width || cy - r > this.height) {
          continue;
        }
        const blob = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        blob.addColorStop(0, withAlpha(color, CLUSTER_BLOB_ALPHA * (1 - emphasis)));
        blob.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- 连线：淡线一遍，高亮线一遍。筛选时一端未命中的线再淡一档，单独一遍
    const highlighted: Array<[GraphNode, GraphNode]> = [];
    const faded: Array<[GraphNode, GraphNode]> = [];
    const growing: Array<[GraphNode, GraphNode, number]> = [];
    ctx.lineWidth = Math.max(0.5, 1.1 * Math.min(1, scale));
    const edgeColor = dimming ? withAlpha(palette.edge, 1 - 0.6 * emphasis) : palette.edge;
    ctx.strokeStyle = edgeColor;
    ctx.beginPath();
    for (const edge of scene.edges) {
      const a = scene.nodeById.get(edge.source);
      const b = scene.nodeById.get(edge.target);
      if (!a || !b) continue;
      // 播放中：两端都出现后才画，从先出现的一端向后出现的一端画出来
      const showA = shown(a.id);
      const showB = shown(b.id);
      if (showA <= 0 || showB <= 0) continue;
      if (showA < 1 || showB < 1) {
        growing.push(showA >= showB ? [a, b, showB] : [b, a, showA]);
        continue;
      }
      if (dimming && (edge.source === focusId || edge.target === focusId)) {
        highlighted.push([a, b]);
        continue;
      }
      if (filteredOut(a.id) || filteredOut(b.id)) {
        faded.push([a, b]);
        continue;
      }
      const [ax, ay] = camera.toCanvas(a.x, a.y);
      const [bx, by] = camera.toCanvas(b.x, b.y);
      if (!this.segmentVisible(ax, ay, bx, by)) continue;
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();

    if (growing.length > 0) {
      ctx.strokeStyle = edgeColor;
      ctx.beginPath();
      for (const [from, to, amount] of growing) {
        const [ax, ay] = camera.toCanvas(from.x, from.y);
        const [tx, ty] = camera.toCanvas(to.x, to.y);
        const bx = ax + (tx - ax) * amount;
        const by = ay + (ty - ay) * amount;
        if (!this.segmentVisible(ax, ay, bx, by)) continue;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }

    if (faded.length > 0) {
      ctx.strokeStyle = withAlpha(edgeColor, FILTERED_OUT_ALPHA);
      ctx.beginPath();
      for (const [a, b] of faded) {
        const [ax, ay] = camera.toCanvas(a.x, a.y);
        const [bx, by] = camera.toCanvas(b.x, b.y);
        if (!this.segmentVisible(ax, ay, bx, by)) continue;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }

    if (highlighted.length > 0) {
      // 强调满格时是纯高亮色；渐变途中叠在淡线上按强调程度透出
      ctx.strokeStyle =
        emphasis >= 1 ? palette.edgeHighlight : withAlpha(palette.edgeHighlight, emphasis);
      ctx.lineWidth = Math.max(1, 1.8 * Math.min(1, scale));
      ctx.beginPath();
      for (const [a, b] of highlighted) {
        const [ax, ay] = camera.toCanvas(a.x, a.y);
        const [bx, by] = camera.toCanvas(b.x, b.y);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }

    // ---- 节点
    const labelCandidates: GraphNode[] = [];
    for (const node of scene.nodes) {
      const appear = shown(node.id);
      if (appear <= 0) continue;
      const growing = appear < 1;
      const [cx, cy] = camera.toCanvas(node.x, node.y);
      // 播放中半径走弹簧曲线（冲过头再回落，像「长出来」），透明度线性跟上
      const r = Math.max(1.2, node.radius * scale) * (growing ? springScale(appear) : 1);
      if (r <= 0) continue;
      if (cx + r < 0 || cy + r < 0 || cx - r > this.width || cy - r > this.height) continue;

      const isHovered = node.id === state.hoveredId;
      const isAdjacent = state.adjacentIds.has(node.id);
      const isCurrent = state.currentIds.has(node.id);
      const dimmed = dimming && node.id !== focusId && !isAdjacent;
      const outOfFilter = filteredOut(node.id) && !isHovered && !isCurrent;

      // 辉光只给强调节点：全场辉光既慢又糊
      if (isHovered || isCurrent) {
        const glow = ctx.createRadialGradient(cx, cy, r, cx, cy, r * 3.2);
        glow.addColorStop(0, palette.glow);
        glow.addColorStop(1, withAlpha(palette.glow, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 簇色只用于普通态：强调态（悬停/当前）必须是 accent，否则用户分不清
      // 「这是我选中的」和「这是某个主题的」
      // 筛选命中的节点保持主题色（「命中」靠未命中的降淡来表达，不靠换色）
      const base = state.clusterColors?.get(node.cluster) ?? palette.nodeFill;
      let alpha = outOfFilter ? FILTERED_OUT_ALPHA : 1;
      if (dimmed) alpha *= 1 - (1 - DIMMED_ALPHA) * emphasis;
      if (growing) alpha *= Math.min(1, appear * 2);
      ctx.fillStyle = isHovered
        ? palette.nodeFillHover
        : isCurrent
          ? palette.nodeFillCurrent
          : alpha < 1
            ? withAlpha(base, alpha)
            : base;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // 描边用底色，作用是在节点密集处切出间隙（而不是当轮廓看）
      if (r > 2.5 && !outOfFilter && !growing && (!dimmed || emphasis < 0.5)) {
        ctx.lineWidth = Math.min(2, r * 0.35);
        ctx.strokeStyle = isCurrent ? palette.nodeStrokeCurrent : palette.nodeStroke;
        ctx.stroke();
      }

      // 桥接卡片（连接了两个主题）加一圈细环：这类卡片往往是洞见所在，值得能被找到。
      // 用中性的正文色而不是 accent——accent 已经表示「选中/悬停」，不能一色两义。
      // 只在放大到能看清卡片时画，缩小时全是环反而成了噪点。
      if (
        node.isBridge &&
        !growing &&
        !dimmed &&
        !outOfFilter &&
        !isHovered &&
        !isCurrent &&
        scale >= LABEL_MIN_SCALE
      ) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = withAlpha(palette.label, 0.45);
        ctx.stroke();
      }

      // 悬停时只留指着的那一个标签：先前连一度邻居的标签一起强显，
      // 而枢纽节点邻居一多就在同一片区域堆成糊成一团，反而看不清指的是谁。
      // 邻居的身份已经由提亮的连线和节点色表达，不需要再靠文字重复一遍。
      if (!node.label || growing) continue;
      if (hovering) {
        if (isHovered) labelCandidates.push(node);
        continue;
      }
      if (outOfFilter) continue;
      if (mapMode) {
        // 地图模式：卡片标题只在放大到卡片层时出现（中低缩放交给主题名）
        if (isCurrent || scale >= MAP_CARD_LABEL_SCALE) labelCandidates.push(node);
        continue;
      }
      if (isCurrent || this.labelAllowed(node, scale)) labelCandidates.push(node);
    }

    // 悬停标签先占位：它是用户正指着的东西，主题名与它重叠时让位（只让那一个，其余不动）
    const hoveredNode = hovering ? labelCandidates.find(n => n.id === state.hoveredId) : undefined;
    const hoverBox = hoveredNode ? this.nodeLabelBox(hoveredNode, camera) : null;
    this.lastHoverLabelBox = hoverBox;
    const reserved = hoverBox ? [hoverBox] : [];

    // ---- 离线地图的主题名：三级语义缩放
    //   远：只有大主题名；中：子主题名；近：卡片标题（上面已入候选）
    // 主题名是地图的底层信息，不随悬停出现/消失：鼠标在密集的岛上扫过时悬停在
    // 「有 / 无」之间来回切，主题名跟着一亮一灭就是整屏闪烁（用户反馈过）
    if (mapMode && scale < MAP_CARD_LABEL_SCALE) {
      this.drawMapLabels(
        scene,
        camera,
        palette,
        geometry,
        scale,
        reserved,
        reveal ? shown : undefined
      );
      if (hoveredNode) this.drawNodeLabels([hoveredNode], camera, palette, state);
      ctx.restore();
      return;
    }

    // ---- 簇标签：缩得太小时卡片标题一律糊成一片，这时改显示主题名
    // （语义缩放的第一步：同一块地方在不同缩放下承载不同粒度的信息）
    if (!mapMode && scale < CLUSTER_LABEL_MAX_SCALE && scene.clusters.length > 0) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const placedClusters: Box[] = [...reserved];
      // 大簇优先占位
      for (const cluster of scene.clusters) {
        const shape = geometry.get(cluster.id);
        if (!shape || !cluster.label) continue;
        if (reveal && !cluster.members.some(id => shown(id) > 0)) continue;
        const [cx, cy] = camera.toCanvas(shape.x, shape.y);
        if (cx < 0 || cy < 0 || cx > this.width || cy > this.height) continue;
        // 字号随簇规模走，大主题更醒目
        const size = Math.min(20, 11 + Math.sqrt(cluster.members.length));
        ctx.font = `${size.toFixed(1)}px ${palette.fontFamily}`;
        const text = this.truncate(cluster.label, 16);
        const half = ctx.measureText(text).width / 2 + 4;
        const box = { left: cx - half, right: cx + half, top: cy - size, bottom: cy + size };
        if (placedClusters.some(other => this.overlaps(box, other))) continue;
        placedClusters.push(box);
        ctx.fillStyle = withAlpha(palette.background, 0.82);
        this.plate(ctx, box.left - 2, cy - size * 0.75, half * 2 + 4, size * 1.5);
        ctx.fillStyle = state.clusterColors?.get(cluster.id) ?? palette.label;
        ctx.fillText(text, cx, cy);
      }
      if (hoveredNode) this.drawNodeLabels([hoveredNode], camera, palette, state);
      ctx.restore();
      return;
    }

    // ---- 标签：按重要度排序后避让
    labelCandidates.sort((a, b) => this.labelPriority(b, state) - this.labelPriority(a, state));
    this.drawNodeLabels(labelCandidates, camera, palette, state);
    ctx.restore();
  }

  /**
   * 悬停标题的占位框（画布坐标，按底板外扩）。宿主把它当作悬停节点命中范围的一部分：
   * 标题画在节点正下方，鼠标挪到标题上就离开了节点的命中圆，悬停一断标题就消失，
   * 鼠标又落回节点上再次悬停——来回闪（用户反馈过）
   */
  hoverLabelBox(): Box | null {
    const box = this.lastHoverLabelBox;
    if (!box) return null;
    return { left: box.left - 4, right: box.right + 4, top: box.top - 3, bottom: box.bottom };
  }

  /** 卡片标题的占位框（画布坐标），标题画在节点正下方 */
  private nodeLabelBox(node: GraphNode, camera: Camera): Box {
    const ctx = this.ctx;
    ctx.font = `12px ${this.fontFamily}`;
    const [cx, cy] = camera.toCanvas(node.x, node.y);
    const r = Math.max(1.2, node.radius * camera.scale);
    const halfWidth = ctx.measureText(this.truncate(node.label)).width / 2 + 2;
    const top = cy + r + 4;
    return { left: cx - halfWidth, right: cx + halfWidth, top, bottom: top + LABEL_CELL };
  }

  /**
   * 按顺序画卡片标题并避让。按实测文字宽度做矩形避让：先前用固定网格（90px 一格），
   * 而中文标签实际宽度经常超过一格，相邻格的两条标签会叠在一起。
   */
  private drawNodeLabels(
    nodes: GraphNode[],
    camera: Camera,
    palette: GraphPalette,
    state: RenderState
  ) {
    const ctx = this.ctx;
    const placed: Box[] = [];
    for (const node of nodes) {
      const box = this.nodeLabelBox(node, camera);
      const isHovered = node.id === state.hoveredId;
      // 悬停标签必须显示（用户正指着它），其余让位
      if (!isHovered && placed.some(other => this.overlaps(box, other))) continue;
      placed.push(box);
      ctx.font = `12px ${palette.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      // 悬停标签垫一层底色：它常常落在连线、节点与主题名上方，没有底板会糊在一起
      if (isHovered) {
        ctx.fillStyle = withAlpha(palette.background, 0.88);
        this.plate(ctx, box.left - 4, box.top - 3, box.right - box.left + 8, LABEL_CELL);
      }
      ctx.fillStyle = palette.label;
      const [cx] = camera.toCanvas(node.x, node.y);
      ctx.fillText(this.truncate(node.label), cx, box.top);
    }
  }

  /**
   * 离线地图的主题名。
   *
   * 观感规则（针对上一版「彩色碎字 + 截断」的问题）：
   *  - 名字用正文色而不是主题色：彩色字在浅底上既不好读又显得花；颜色交给节点去表达；
   *  - 永不截断：名字来自 tag，本来就短；
   *  - 不垫实心底板，改用同底色的描边光晕：压在节点上也读得清，但不留一块块补丁；
   *  - 大主题名用字重与字号区分层级，子主题名更小更淡。
   */
  private drawMapLabels(
    scene: MapScene,
    camera: Camera,
    palette: GraphPalette,
    geometry: Map<number, { x: number; y: number; radius: number }>,
    scale: number,
    reserved: Box[],
    shown?: (id: number) => number
  ) {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    // 播放中：名字随主题一起长出来。位置仍按全部成员算（按已出现的算，名字会跟着质心一路漂），
    // 只按已出现的比例决定出不出现、多淡——前几张卡出现时名字还很淡，岛长到一定规模才清楚
    const presence = (members: readonly number[]) => {
      if (!shown) return members.length ? 1 : 0;
      let sum = 0;
      for (const id of members) sum += shown(id);
      return members.length === 0 ? 0 : Math.min(1, (sum / members.length) * 3);
    };
    const placed: Box[] = [];
    const blocked = (box: Box) => reserved.some(other => this.overlaps(box, other));
    const showSubtopics = scale >= MAP_SUBTOPIC_LABEL_SCALE;

    const draw = (
      text: string,
      x: number,
      y: number,
      size: number,
      weight: number,
      color: string,
      force: boolean
    ) => {
      const [cx, cy] = camera.toCanvas(x, y);
      if (cx < -40 || cy < -20 || cx > this.width + 40 || cy > this.height + 20) return false;
      ctx.font = `${weight} ${size}px ${palette.fontFamily}`;
      const half = ctx.measureText(text).width / 2 + 6;
      const box = {
        left: cx - half,
        right: cx + half,
        top: cy - size * 0.8,
        bottom: cy + size * 0.8,
      };
      // 大主题名在远景强制显示（不互相避让），但仍给悬停标签让位
      if (blocked(box)) return false;
      if (!force && placed.some(other => this.overlaps(box, other))) return false;
      placed.push(box);
      ctx.lineWidth = Math.max(3, size * 0.32);
      ctx.strokeStyle = withAlpha(palette.background, 0.9);
      ctx.strokeText(text, cx, cy);
      ctx.fillStyle = color;
      ctx.fillText(text, cx, cy);
      return true;
    };

    // 大主题名在远景永远显示（它们是地图的「国名」，每个都要能找到）；
    // 进入子主题层后退为淡色，让位给更细的名字
    for (const cluster of scene.clusters) {
      const shape = geometry.get(cluster.id);
      if (!shape || !cluster.label) continue;
      const alpha = presence(cluster.members);
      if (alpha <= 0) continue;
      const size = Math.round(Math.min(18, 13 + Math.sqrt(cluster.members.length) * 0.3));
      if (showSubtopics) {
        // 名字挪到岛的上沿，不压住中间的子主题名
        const top = shape.y - shape.radius * 0.72;
        draw(cluster.label, shape.x, top, size, 600, withAlpha(palette.label, 0.55 * alpha), false);
      } else {
        const color = alpha < 1 ? withAlpha(palette.label, alpha) : palette.label;
        draw(cluster.label, shape.x, shape.y, size, 600, color, true);
      }
    }

    if (!showSubtopics) return;
    const subtopics = new Map(scene.subtopics.map(sub => [sub.id, sub]));
    for (const [id, shape] of mapSubtopicGeometry(scene)) {
      const sub = subtopics.get(id)!;
      if (shape.count < 3) continue;
      const alpha = presence(sub.members);
      if (alpha <= 0) continue;
      draw(sub.label, shape.x, shape.y, 12, 500, withAlpha(palette.label, 0.85 * alpha), false);
    }
  }

  /** 标签优先级：当前态（筛选命中）压过普通节点，同档按度数 */
  private labelPriority(node: GraphNode, state: RenderState): number {
    return (state.currentIds.has(node.id) ? 1e4 : 0) + node.degree;
  }

  private labelAllowed(node: GraphNode, scale: number): boolean {
    if (scale < LABEL_MIN_SCALE) return false;
    if (scale < 1) return node.degree >= LABEL_DEGREE_GATE;
    return true;
  }

  private overlaps(a: Box, b: Box): boolean {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  private truncate(label: string, limit = 14): string {
    return label.length > limit ? `${label.slice(0, limit)}…` : label;
  }

  /** 圆角底板；roundRect 在部分 canvas 实现（含测试用的 mock）里缺失，退化为直角 */
  private plate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, height, 4);
    else ctx.rect(x, y, width, height);
    ctx.fill();
  }

  /** 两端都在视口外且不跨视口时跳过（粗判，够省掉大部分远处连线） */
  private segmentVisible(ax: number, ay: number, bx: number, by: number): boolean {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    return !(maxX < 0 || maxY < 0 || minX > this.width || minY > this.height);
  }
}
