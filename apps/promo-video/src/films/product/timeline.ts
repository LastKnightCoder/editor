/**
 * 产品片时间轴：对齐配乐 Motivational Technology（117.5 BPM，一小节约 2 秒）。
 * 配乐从第 11 小节（约 23 秒，前奏尾段）起用；bar(n) / beat(n) 返回的是**影片内**秒数，n 为曲内小节 / 拍序号。
 * 曲子结构：前奏到第 15 小节，第 16 小节鼓点进入，第 40 小节回落，第 56 小节停一拍后第 58 小节爆发。
 */
import { TRACKS } from "../../brand/music";
import { sec } from "../../brand/motion";

const TRACK = TRACKS.motivationalTechnology;
const BEATS = TRACK.beats;
const BEAT_LEN = 60 / TRACK.bpm;
/** 曲子总长（秒） */
const TRACK_END = 189.048;
export const BEAT_SEC = BEAT_LEN;

const wholeBeat = (n: number) => (n < BEATS.length ? BEATS[n] : BEATS[BEATS.length - 1] + (n - BEATS.length + 1) * BEAT_LEN);
/** 拍序号可带小数（半拍、四分之一拍），在相邻两拍之间线性插值 */
const trackBeat = (n: number) => {
  const i = Math.floor(n);
  return i === n ? wholeBeat(n) : wholeBeat(i) + (wholeBeat(i + 1) - wholeBeat(i)) * (n - i);
};

/** 影片 0 秒对应曲内第 11 小节 */
export const MUSIC_OFFSET = trackBeat(11 * 4);

export const beat = (n: number) => trackBeat(n) - MUSIC_OFFSET;
export const bar = (n: number) => beat(n * 4);

export const P = {
  opening: {
    scatter: bar(11),
    converge: bar(11) + 0.15,
    wordmark: bar(12),
    tagline: bar(12) + 0.3,
    rise: bar(13),
    dive: bar(14) + 0.8,
    end: bar(15),
  },
  /** 写作：typed 为新一节各块起敲的小节；slash / cards 为曲内拍序号（小节 n 的第 k 拍 = n * 4 + k） */
  write: {
    start: bar(15),
    manifesto: [bar(15) + 0.1, bar(16)] as [number, number],
    typed: [16, 17, 18, 19],
    slash: 20 * 4,
    cards: 20 * 4 + 2,
    end: beat(22 * 4 + 3),
  },
  /** 白板 → 数据库：均为曲内拍序号 */
  board: {
    start: 22 * 4 + 3,
    manifesto: [23 * 4, 24 * 4],
    shapes: [24 * 4 + 1],
    arrows: 24 * 4 + 3,
    mind: 25 * 4,
    branches: [25 * 4 + 1, 25 * 4 + 2, 25 * 4 + 3],
    leaves: 26 * 4,
    palettes: [26 * 4 + 1, 26 * 4 + 2],
    sketch: 26 * 4 + 3,
    slides: [27 * 4, 27 * 4 + 1],
    fly: 27 * 4 + 2,
    dbManifesto: [27 * 4 + 2, 28 * 4],
    views: [28 * 4, 28 * 4 + 2, 29 * 4, 29 * 4 + 2],
    end: 30 * 4,
  },
  /**
   * 一个想法的一生：均为曲内拍序号（可带小数）。每一步 arrive 抵达窗口、leave 起飞去下一个；
   * focus / zoom 是停留期间推近的落点（相对窗口中心）。
   */
  life: {
    start: 30 * 4,
    manifesto: [30 * 4 + 2, 31 * 4 + 2],
    steps: [
      { arrive: 30 * 4 + 1.5, leave: 32 * 4 + 2, select: 31 * 4 + 2, mark: 32 * 4, focus: [150, -20], zoom: 1.28 },
      { arrive: 32 * 4 + 3, leave: 34 * 4, added: 32 * 4 + 3.5, ask: 33 * 4 + 0.5, answer: 33 * 4 + 1, focus: [230, -60], zoom: 1.3 },
      { arrive: 34 * 4 + 1, leave: 35 * 4 + 2, type: 34 * 4 + 1.5, links: 35 * 4 + 1, focus: [110, -200], zoom: 1.5 },
      { arrive: 35 * 4 + 3, leave: 36 * 4 + 3, flip: 36 * 4, press: 36 * 4 + 1.5, focus: [110, 40], zoom: 1.3 },
      { arrive: 37 * 4, leave: 37 * 4 + 3, glow: 37 * 4 + 0.5, focus: [0, 30], zoom: 1.32 },
      { arrive: 38 * 4, leave: 39 * 4 + 0.5, check: 38 * 4 + 0.5, press: 38 * 4 + 1.5, done: 38 * 4 + 3.5, focus: [200, 20], zoom: 1.32 },
    ],
    /** 拉远成闭环：[开始, 拉到全景] */
    loop: [39 * 4 + 0.5, 39 * 4 + 3],
    end: 40 * 4,
  },
  /** AI：均为曲内拍序号。小管家在音乐最安静的第 41–43 小节，节奏放慢 */
  ai: {
    start: 40 * 4,
    manifesto: [40 * 4 + 1, 41 * 4],
    /** 光标点标题栏 AI 按钮（open）→ 打字 → 点发送（send）；每次点按前留约 0.9 拍移过去 */
    assist: { open: 41 * 4 + 0.75, typing: 41 * 4 + 1.25, send: 41 * 4 + 2.75, query: 41 * 4 + 3.25, create: 42 * 4 + 0.5, answer: 42 * 4 + 2 },
    /** 点「AI 洞见」（click）→ 点可连接标记（popover）→ 点「连接」（connect） */
    insights: { start: 44 * 4, click: 44 * 4 + 0.75, report: 44 * 4 + 1.75, popover: 44 * 4 + 3.5, connect: 45 * 4 + 1.25 },
    /** 点「创作模式」开关（start）→ 点「开始找资料」（gather）→ 点「连到此段」（link） */
    compose: { start: 46 * 4, gather: 46 * 4 + 1, place: 46 * 4 + 2, done: 47 * 4, write: 47 * 4 + 0.5, glow: 47 * 4 + 1.5, link: 47 * 4 + 2.5 },
    end: 48 * 4,
  },
  /**
   * 拉远 → 知识地图（第 48–66 小节）：均为曲内拍序号。卡片里敲 [[ 连上一条 → 窗口收拢成地图上的节点、新连线伸出 →
   * 镜头沿线拉远进地图 → 点说明行开始回放、推进满屏白纸压整屏宣言（第 56 小节空拍）→ 第 58 小节爆发生长 → 地图洞见。
   */
  map: {
    start: 48 * 4,
    click: 48 * 4 + 0.25,
    swap: 48 * 4 + 0.5,
    typing: { start: 49 * 4, bracket: 49 * 4 + 0.75, query: 49 * 4 + 1.25, enter: 49 * 4 + 2, rest: 49 * 4 + 2.25 },
    morph: [51 * 4, 51 * 4 + 2.5] as [number, number],
    grow: [51 * 4 + 2, 51 * 4 + 3.5] as [number, number],
    pull: { title: 52 * 4 + 2, sub: 53 * 4 + 1, fit: 54 * 4 },
    chrome: [53 * 4 + 1, 54 * 4] as [number, number],
    hover: 55 * 4 + 0.5,
    play: 55 * 4 + 2,
    manifesto: [56 * 4, 58 * 4] as [number, number],
    growth: [58 * 4, 62 * 4] as [number, number],
    insights: { click: 62 * 4, result: 63 * 4, push: 63 * 4 + 2, select: 64 * 4, popover: 64 * 4 + 0.5, connect: 64 * 4 + 3, back: 65 * 4 },
    end: 66 * 4,
  },
  /**
   * All in one（第 66–74 小节）：均为曲内拍序号。地图窗口上叠宣言、期间侧栏换成番茄专注 → 番茄做完 → 飞到待办勾掉 →
   * 飞到日程多出这个番茄 → 飞到日记写一句 → 拉远，四个窗口飞进中间的今日窗口对应的位置。
   */
  daily: {
    start: 66 * 4,
    manifesto: [66 * 4 + 0.25, 67 * 4] as [number, number],
    swap: 66 * 4 + 2,
    /** 窗口之间每次飞 2 拍；待办点勾选圈（check），日记先点输入条（focus）再打字、点发送（send） */
    pomodoro: { done: 67 * 4 + 2, leave: 67 * 4 + 3 },
    todos: { arrive: 68 * 4 + 1, check: 68 * 4 + 1.75, leave: 68 * 4 + 3 },
    schedule: { arrive: 69 * 4 + 1, add: 69 * 4 + 1.25, leave: 69 * 4 + 2.5 },
    diary: { arrive: 70 * 4 + 0.5, focus: 70 * 4 + 1, type: 70 * 4 + 1.25, send: 70 * 4 + 3.25, leave: 70 * 4 + 3.5 },
    pull: 71 * 4 + 1.25,
    converge: [71 * 4 + 1.25, 72 * 4] as [number, number],
    today: 72 * 4 + 0.5,
    end: 74 * 4,
  },
  /**
   * 插件 + 本地（第 74–82 小节）：均为曲内拍序号。今日窗口上叠宣言，虚化期间换成插件中心 → 装微信读书（确认 → 下载校验中 →
   * 重启后生效 → 立即重启）→ 侧栏多出「微信读书」→ 粘贴 API Key 同步书架 → 设置 › 导入与导出 → 导出全部为 Markdown → 访达里显示压缩包。
   */
  plugins: {
    start: 74 * 4,
    manifesto: [74 * 4 + 0.25, 75 * 4] as [number, number],
    swap: 74 * 4 + 2,
    install: { press: 75 * 4 + 2, confirm: 75 * 4 + 2.25, ok: 76 * 4 + 0.75, staged: 76 * 4 + 2, restart: 76 * 4 + 3.5, back: 77 * 4 + 0.5 },
    weread: { nav: 77 * 4 + 1.25, open: 77 * 4 + 1.5, paste: 77 * 4 + 2.25, save: 77 * 4 + 3, sync: 77 * 4 + 3.5, shelf: 78 * 4 + 0.5 },
    /** 设置先停在「同步 › 本地数据库」（上次停留的分区），再点导航里的「导入与导出」 */
    settings: { press: 78 * 4 + 1.5, open: 78 * 4 + 1.75, nav: 78 * 4 + 3, choose: 79 * 4 + 0.25 },
    exporter: { open: 79 * 4 + 0.5, scope: 79 * 4 + 1.5, link: 79 * 4 + 2.5, press: 79 * 4 + 3.5, done: 80 * 4 + 1, finder: 80 * 4 + 1.25 },
    end: 82 * 4,
  },
  /**
   * 收尾（第 82 小节到曲末）：单位是影片秒。尾声没有鼓，每 2 小节一次和声涌起（第 84 / 86 / 88 / 90 小节），
   * 按低频和弦变化实测（比 117.45 BPM 外推的网格早 0.1–0.3 秒），第 91 小节后自然衰减，曲子在 166 秒结束。
   */
  ending: {
    start: beat(82 * 4),
    swell: [169.007, 172.989, 177.018, 181.023].map(t => t - MUSIC_OFFSET) as [number, number, number, number],
    end: TRACK_END - MUSIC_OFFSET - 0.05,
  },
  end: TRACK_END - MUSIC_OFFSET - 0.05,
} as const;

export const f = sec;

/** 曲内第 n 拍（可带小数）在影片里的帧号：各章节场景统一用它取时刻 */
export const at = (n: number) => f(beat(n));
/** 曲内第 n 拍处一拍的帧数（光标提前量、运镜时长都按拍算） */
export const beatFrames = (n: number) => at(n + 1) - at(n);
