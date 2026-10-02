import diff from "fast-diff";
import { Node, Point, Text, type Descendant } from "slate";

export interface QuoteAnchor {
  exact: string;
  prefix: string;
  suffix: string;
  heading?: string;
  truncated?: boolean;
}

export const QUOTE_CONTEXT_LENGTH = 32;
export const QUOTE_MAX_LENGTH = 2000;
export const QUOTE_FUZZY_THRESHOLD = 0.75;

export interface QuoteResolution {
  status: "exact" | "fuzzy" | "lost";
  blockStart: number;
  blockEnd: number;
  score: number;
}

export function headingPaths(content: Descendant[]): string[] {
  const ancestors: { level: number; title: string }[] = [];
  return content.map(node => {
    if (!Text.isText(node) && node.type === "header") {
      const level = Number(node.level);
      while (ancestors.length && ancestors[ancestors.length - 1].level >= level) ancestors.pop();
      ancestors.push({ level, title: Node.string(node) });
    }
    return ancestors.map(item => item.title).join(" › ");
  });
}

function textIndex(content: Descendant[]) {
  const blocks = content.map(node => Node.string(node));
  let offset = 0;
  const starts = blocks.map(text => {
    const start = offset;
    offset += text.length + 1;
    return start;
  });
  return { blocks, starts, text: blocks.join("\n") };
}

function pointOffset(content: Descendant[], starts: number[], point: Point): number {
  const block = content[point.path[0]];
  if (!block) throw new Error("引述选区超出正文范围");
  let offset = starts[point.path[0]];
  for (const [leaf, path] of Node.texts(block)) {
    if (
      path.length === point.path.length - 1 &&
      path.every((part, i) => part === point.path[i + 1])
    ) {
      if (point.offset < 0 || point.offset > leaf.text.length) throw new Error("引述选区偏移无效");
      return offset + point.offset;
    }
    offset += leaf.text.length;
  }
  throw new Error("引述选区不是文本位置");
}

export function buildQuoteAnchor(
  content: Descendant[],
  range: { start: Point; end: Point }
): QuoteAnchor {
  const index = textIndex(content);
  const [start, end] =
    Point.compare(range.start, range.end) <= 0
      ? [range.start, range.end]
      : [range.end, range.start];
  const from = pointOffset(content, index.starts, start);
  const to = pointOffset(content, index.starts, end);
  const retainedEnd = Math.min(to, from + QUOTE_MAX_LENGTH);
  return {
    exact: index.text.slice(from, retainedEnd),
    prefix: index.text.slice(Math.max(0, from - QUOTE_CONTEXT_LENGTH), from),
    // 截断后仍围绕实际保存的引文取上下文，便于重复文本消歧。
    suffix: index.text.slice(retainedEnd, retainedEnd + QUOTE_CONTEXT_LENGTH),
    heading: headingPaths(content)[start.path[0]] || undefined,
    ...(to > retainedEnd ? { truncated: true } : {}),
  };
}

function contextScore(text: string, from: number, to: number, anchor: QuoteAnchor) {
  let matched = 0;
  for (let i = 1; i <= anchor.prefix.length; i++) {
    if (text[from - i] !== anchor.prefix[anchor.prefix.length - i]) break;
    matched++;
  }
  for (let i = 0; i < anchor.suffix.length; i++) {
    if (text[to + i] !== anchor.suffix[i]) break;
    matched++;
  }
  return matched / Math.max(1, anchor.prefix.length + anchor.suffix.length);
}

export function resolveQuoteAnchor(
  content: Descendant[],
  anchor: QuoteAnchor,
  threshold = QUOTE_FUZZY_THRESHOLD
): QuoteResolution {
  const index = textIndex(content);
  const headings = headingPaths(content);
  const fallback = Math.max(0, headings.indexOf(anchor.heading ?? ""));
  const lost: QuoteResolution = {
    status: "lost",
    blockStart: fallback,
    blockEnd: fallback,
    score: 0,
  };
  if (!anchor.exact.trim() || !content.length) return lost;
  const blockAt = (offset: number) => {
    let block = 0;
    while (block + 1 < index.starts.length && index.starts[block + 1] <= offset) block++;
    return block;
  };
  let bestExact = -1;
  let bestContext = -1;
  for (
    let from = index.text.indexOf(anchor.exact);
    from >= 0;
    from = index.text.indexOf(anchor.exact, from + 1)
  ) {
    const score = contextScore(index.text, from, from + anchor.exact.length, anchor);
    if (score > bestContext) {
      bestExact = from;
      bestContext = score;
    }
  }
  if (bestExact >= 0)
    return {
      status: "exact",
      blockStart: blockAt(bestExact),
      blockEnd: blockAt(bestExact + anchor.exact.length - 1),
      score: 1,
    };

  let best = lost;
  let bestRank = -1;
  const minimumLength = Math.floor(anchor.exact.length * threshold);
  const maximumLength = Math.ceil(anchor.exact.length / threshold);
  for (let start = 0; start < content.length; start++) {
    let candidate = "";
    for (let end = start; end < content.length; end++) {
      candidate += (end > start ? "\n" : "") + index.blocks[end];
      // 局部选区可能藏在长段落内，差分中的首尾新增文本不属于候选引文。
      const parts = diff(anchor.exact, candidate);
      const leading = parts[0]?.[0] === 1 ? parts[0][1].length : 0;
      const trailing =
        parts.length > 1 && parts[parts.length - 1][0] === 1
          ? parts[parts.length - 1][1].length
          : 0;
      const length = candidate.length - leading - trailing;
      if (length >= minimumLength && length <= maximumLength) {
        const shared = parts.reduce(
          (sum, [operation, text]) => sum + (operation === 0 ? text.length : 0),
          0
        );
        const score = shared / Math.max(anchor.exact.length, length);
        const from = index.starts[start] + leading;
        const to = index.starts[start] + candidate.length - trailing;
        const rank =
          score * 0.9 +
          contextScore(index.text, from, to, anchor) * 0.07 +
          (anchor.heading && headings[blockAt(from)] === anchor.heading ? 0.03 : 0);
        // 上下文只能消歧，不能让已删除的引文靠标题相同越过找回门槛。
        if (score >= threshold && rank > bestRank) {
          bestRank = rank;
          best = { status: "fuzzy", blockStart: blockAt(from), blockEnd: blockAt(to - 1), score };
        }
      }
      if (candidate.length >= maximumLength) break;
    }
  }
  return best;
}
