/**
 * 文档正文按示意画面切段：独占一行的 `::demo{name="todos" caption="…"}` 是一块可交互示意，
 * 其余是 Markdown，交给只读编辑器渲染。
 */
export type DocSegment =
  | { kind: "markdown"; markdown: string }
  | { kind: "demo"; name: string; caption?: string };

const DEMO_LINE = /^::demo\{([^}]*)\}\s*$/;
const ATTR = /(\w+)="([^"]*)"/g;

function parseAttrs(source: string): Record<string, string> {
  return Object.fromEntries(Array.from(source.matchAll(ATTR), match => [match[1], match[2]]));
}

export function splitDocSegments(markdown: string): DocSegment[] {
  const segments: DocSegment[] = [];
  let buffer: string[] = [];
  let inFence = false;
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) segments.push({ kind: "markdown", markdown: text });
    buffer = [];
  };
  for (const line of markdown.split("\n")) {
    // 代码块里出现的同样写法是示例文字，不当作示意
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = inFence ? null : DEMO_LINE.exec(line);
    if (!match) {
      buffer.push(line);
      continue;
    }
    const attrs = parseAttrs(match[1]);
    if (!attrs.name) throw new Error(`示意缺少 name：${line}`);
    flush();
    segments.push({ kind: "demo", name: attrs.name, caption: attrs.caption });
  }
  flush();
  return segments;
}
