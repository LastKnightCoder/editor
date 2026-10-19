/**
 * 就地成型文档的脚本：每个块先打 Markdown 记号（淡墨），敲完记号当场成型，再打正文。
 * schedule() 把脚本按顺序排成帧时刻，渲染与镜头都从同一份时刻取值。
 */
export type InlinePart = { text: string; bold?: boolean; code?: boolean; link?: boolean };

export type DocBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; parts: InlinePart[] }
  | { kind: "quote"; text: string; source?: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "math"; tex: string }
  | { kind: "code"; lang: string; code: string };

export const MARK: Record<DocBlock["kind"], (b: DocBlock) => string> = {
  heading: b => "#".repeat((b as { level: number }).level) + " ",
  paragraph: () => "",
  quote: () => "> ",
  bullets: () => "- ",
  math: () => "$$",
  code: b => "```" + (b as { lang: string }).lang,
};

export const PACE = { mark: 5, char: 3, settle: 10, gap: 18, line: 26 };

export type Timed = {
  block: DocBlock;
  start: number;
  /** 记号打完、成型的时刻 */
  formAt: number;
  /** 正文开始的时刻 */
  bodyAt: number;
  end: number;
};

const len = (s: string) => [...s].length;

export function bodyLength(block: DocBlock) {
  switch (block.kind) {
    case "heading":
    case "quote":
      return len(block.text);
    case "paragraph":
      return block.parts.reduce((n, p) => n + len(p.text) + (p.bold ? 4 : 0) + (p.code ? 2 : 0), 0);
    case "bullets":
      return block.items.reduce((n, item) => n + len(item), 0);
    case "math":
    case "code":
      return 0;
  }
}

/** starts 给定时按指定帧开始各块（用于卡节拍），否则首尾相接排队 */
export function schedule(blocks: DocBlock[], startAt = 0, starts?: number[]): Timed[] {
  let cursor = startAt;
  return blocks.map((block, i) => {
    const start = starts?.[i] ?? cursor;
    const mark = MARK[block.kind](block);
    const formAt = start + len(mark) * PACE.mark + (mark ? PACE.settle : 0);
    const bodyAt = formAt + (mark ? 6 : 0);
    let end: number;
    if (block.kind === "math") end = bodyAt + PACE.line * 2;
    else if (block.kind === "code") end = bodyAt + block.code.split("\n").length * PACE.line * 0.6;
    else end = bodyAt + bodyLength(block) * PACE.char + (block.kind === "bullets" ? block.items.length * 6 : 0);
    cursor = end + PACE.gap;
    return { block, start, formAt, bodyAt, end };
  });
}
