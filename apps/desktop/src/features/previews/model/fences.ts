/**
 * 围栏代码块解析（纯函数）：对话块的身份与内容都从消息原文派生，不依赖渲染期的 DOM。
 *
 * 口径与 react-markdown 一致：开栏 = 行首至多 3 空格 + ≥3 个 ` 或 ~，info 首词为语言；
 * 闭栏 = 同字符、长度不短于开栏、其后只有空白。内容 = 两栏之间的行按 \n 连接
 * （= 渲染期 Code 组件剥掉首尾换行后的 children），开栏缩进从内容行里等量剥掉。
 * 消息末尾未闭合的围栏也返回（closed=false）：流式生成中的块。
 */

export interface Fence {
  /** info 首词（小写）；无 info 为空串 */
  lang: string;
  content: string;
  closed: boolean;
}

const OPEN = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;

export function parseFences(text: string): Fence[] {
  const lines = text.split(/\r?\n/);
  const fences: Fence[] = [];
  let open: { indent: number; marker: string; lang: string; body: string[] } | null = null;

  for (const line of lines) {
    if (!open) {
      const m = OPEN.exec(line);
      if (m) open = { indent: m[1].length, marker: m[2], lang: m[3].toLowerCase(), body: [] };
      continue;
    }
    const close = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(line);
    if (close && close[2][0] === open.marker[0] && close[2].length >= open.marker.length) {
      fences.push({ lang: open.lang, content: open.body.join("\n"), closed: true });
      open = null;
      continue;
    }
    const strip = Math.min(open.indent, line.length - line.trimStart().length);
    open.body.push(line.slice(strip));
  }
  if (open) fences.push({ lang: open.lang, content: open.body.join("\n"), closed: false });
  return fences;
}

/**
 * 渲染期定位：Code 组件只拿得到自己的代码与所在文本段原文，据此找出它是该段第几个围栏
 * （内容全等的第一个；同段两块内容完全相同时视为同一块无妨）。找不到返回 -1。
 */
export function findFenceIndex(segmentText: string, code: string): number {
  return parseFences(segmentText).findIndex(f => f.content === code);
}
