/**
 * 功能片时间轴：从产品片初版拆出的两段（所见即所得 + 块、创作模式），仍按原曲的小节排布，
 * 所以拍点与 Product 一致；各片渲染时把影片 0 秒对齐到 range[0]，配乐也从同一处截起。
 */
import { bar, beat } from "../product/timeline";

export { bar, beat, f, MUSIC_OFFSET } from "../product/timeline";

export const P = {
  editor: {
    manifesto1: [bar(15), bar(16)] as [number, number],
    live: { start: bar(16), end: bar(24) },
    manifesto2: [bar(24), bar(25)] as [number, number],
    blocks: { slash: bar(25), cuts: 25 * 4 + 2, cutCount: 18, end: bar(30) },
  },
  /** 创作模式：数值为曲内拍序号（beat(n) 换算成秒），小节 n 的第 k 拍 = n * 4 + k */
  compose: {
    manifesto: [bar(30), bar(31)] as [number, number],
    start: 31 * 4,
    toggle: 31 * 4 + 1,
    intent: 31 * 4 + 2,
    typing: 32 * 4,
    gather: 33 * 4,
    phases: [33 * 4, 33 * 4 + 1, 33 * 4 + 3],
    /** 第一个 frame 落位；之后每拍落一个元素（frame 或卡片） */
    place: 34 * 4,
    done: 36 * 4 + 1,
    write: 37 * 4,
    glow: 38 * 4,
    link: 39 * 4,
    end: 40 * 4,
  },
} as const;

/** 各功能片在原时间轴上的区间（秒） */
export const FEATURE_RANGES = {
  editor: [P.editor.manifesto1[0], P.editor.blocks.end] as [number, number],
  compose: [P.compose.manifesto[0], beat(P.compose.end)] as [number, number],
};
