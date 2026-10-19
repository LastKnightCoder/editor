/**
 * 创作模式演示数据：新建空白文章「工具如何参与思考」→ 写下意图 → AI 从笔记里召集资料分组摆上白板 →
 * 写第一段时「卡片笔记法」那张卡亮起 → 连到此段。标题与「一天」故事线、知识地图共用。
 * 卡片位置按 features/compose/model.ts 的 layoutGather 算（间距 28、内边距 24、顶部 52、组间 72）。
 */
import { TOPIC } from "./day";

export type ComposeDocKind = "card" | "article" | "diary";

export type ComposeDoc = {
  id: string;
  kind: ComposeDocKind;
  tags: string[];
  /** 卡片、日记正文的首个标题；文章用 title */
  heading?: string;
  title?: string;
  body: string[];
  /** 召集理由（AI 写，20 字以内） */
  why: string;
  updated: string;
  /** 日记头：日期、时刻 */
  moment?: { day: string; time: string };
  /** 文章封面渐变下标（同 utils/cover 的派生色板） */
  cover?: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ComposeFrame = { name: string; x: number; y: number; width: number; height: number; items: ComposeDoc[] };

export const DOC_SIZE: Record<ComposeDocKind, { width: number; height: number }> = {
  card: { width: 260, height: 240 },
  diary: { width: 260, height: 240 },
  article: { width: 280, height: 360 },
};

/** 版宽：卡面先按版宽排好再整体缩小 */
export const PAPER_WIDTH: Record<ComposeDocKind, number> = { card: 460, diary: 460, article: 620 };

export const KIND_LABEL: Record<ComposeDocKind, string> = { card: "卡片", article: "文章", diary: "日记" };

export type DocInput = Omit<ComposeDoc, "x" | "y" | "width" | "height">;

const GAP = 28;
const FRAME_PADDING = 24;
const FRAME_TITLE_SPACE = 52;
const GROUP_GAP = 72;
const columnsFor = (count: number) => Math.min(count, count <= 4 ? 2 : Math.min(4, Math.ceil(Math.sqrt(count))));

export function layoutGather(groups: { name: string; items: DocInput[] }[]): ComposeFrame[] {
  let left = 0;
  return groups.map(group => {
    const cell = group.items.reduce((size, item) => ({ width: Math.max(size.width, DOC_SIZE[item.kind].width), height: Math.max(size.height, DOC_SIZE[item.kind].height) }), { width: 0, height: 0 });
    const columns = columnsFor(group.items.length);
    const rows = Math.ceil(group.items.length / columns);
    const width = FRAME_PADDING * 2 + columns * cell.width + (columns - 1) * GAP;
    const height = FRAME_TITLE_SPACE + FRAME_PADDING + rows * cell.height + (rows - 1) * GAP;
    const frame: ComposeFrame = {
      name: group.name,
      x: left,
      y: 0,
      width,
      height,
      items: group.items.map((item, index) => ({
        ...item,
        ...DOC_SIZE[item.kind],
        x: left + FRAME_PADDING + (index % columns) * (cell.width + GAP),
        y: FRAME_TITLE_SPACE + Math.floor(index / columns) * (cell.height + GAP),
      })),
    };
    left += width + GROUP_GAP;
    return frame;
  });
}

export const COMPOSE = {
  title: TOPIC.article,
  /** 意图卡预填「标题」，用户接着补完 */
  intentTyped: "，从《延展心智》说起，结合我这两年写卡片的体验",
  notes: "3,214",
  candidates: 48,
  paragraph: "这两年我一直用卡片记笔记，一张卡只写一个观点。这条规矩看似在管理笔记，其实是在逼我把想法想清楚。",
  /** 亮起并被连到正文的那张卡 */
  glowId: "zettel",
};

export const COMPOSE_FRAMES = layoutGather([
  {
    name: "环境参与思考",
    items: [
      {
        id: "scene",
        kind: "card",
        tags: ["认知科学", "笔记方法"],
        heading: TOPIC.card,
        body: ["读《延展心智》时划下了这一句：", TOPIC.highlight, "所以，记录的方式会反过来塑造想法。"],
        why: "和这篇的核心论点几乎一致",
        updated: "10月17日",
      },
      {
        id: "sketch",
        kind: "card",
        tags: ["认知科学"],
        heading: "草图让想法看得见",
        body: ["建筑师在草图上反复涂改，想法是在纸面上长出来的。", "外部表征让我们能「看见」并操作自己的想法。"],
        why: "建筑师草图的例子可直接用",
        updated: "9月30日",
      },
      {
        id: "diary",
        kind: "diary",
        tags: ["读书"],
        moment: { day: "2026年10月16日 星期五", time: "21:40" },
        body: ["读到第三章，忽然意识到桌上铺开的卡片本身就在帮我思考。换一种摆法，想到的东西就不一样。"],
        why: "你当时的亲身体会",
        updated: "10月16日",
      },
    ],
  },
  {
    name: "卡片笔记的实践",
    items: [
      {
        id: "brain",
        kind: "article",
        tags: [],
        title: "我的第二大脑搭建记录",
        body: ["用了两年卡片笔记，我把整套流程整理成这篇记录：从收集、提炼到链接，每一步都在做什么。", "最大的收获不是存下了多少，而是想法开始自己连起来。"],
        why: "两年实践的完整记录",
        updated: "10月14日",
        cover: 4,
      },
      {
        id: "zettel",
        kind: "card",
        tags: ["写作方法"],
        heading: TOPIC.oldCards[0],
        body: ["一张卡片只写一个观点，标题就是这个观点本身。", "观点足够小，才能被别的卡片引用、组合。"],
        why: "方法论出处，可作论据",
        updated: "2024年3月2日",
      },
      {
        id: "writing",
        kind: "card",
        tags: ["写作方法"],
        heading: TOPIC.oldCards[2],
        body: ["写下来的过程，就是把模糊的念头变成可以检验的句子。"],
        why: "与「工具塑造想法」同源",
        updated: "10月9日",
      },
      {
        id: "links",
        kind: "card",
        tags: ["笔记方法"],
        heading: "链接比分类更重要",
        body: ["文件夹只能放一处，链接能让一个想法同时属于多个语境。"],
        why: "补上卡片之间的组织方式",
        updated: "8月21日",
      },
    ],
  },
]);

export const COMPOSE_DOCS = COMPOSE_FRAMES.flatMap(frame => frame.items);

/** 全部内容（含框外名签）的包围盒，用于 fit */
export const boundsOf = (frames: ComposeFrame[]) => ({
  minX: 0,
  minY: -50,
  maxX: Math.max(...frames.map(f => f.x + f.width)),
  maxY: Math.max(...frames.map(f => f.y + f.height)),
});

export const COMPOSE_BOUNDS = boundsOf(COMPOSE_FRAMES);
