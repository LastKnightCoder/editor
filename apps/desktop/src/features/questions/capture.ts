/**
 * 快速收集的输入解析（问题页收集栏与命令面板共用）：
 * 第一个「#分组」记号作为分组提示（按全名或前缀匹配，匹配交给主进程），其余文字为问题。
 * 「#」后须紧跟非空白字符，「C#」这类词内的井号不算分组记号。
 */

export interface CaptureInput {
  title: string;
  groupHint: string | null;
}

const GROUP_TOKEN = /(^|\s)#(\S+)/;

export function parseCapture(raw: string): CaptureInput {
  const match = raw.match(GROUP_TOKEN);
  if (!match) return { title: raw.trim(), groupHint: null };
  const start = match.index ?? 0;
  const title = (raw.slice(0, start) + match[1] + raw.slice(start + match[0].length))
    .replace(/\s{2,}/g, " ")
    .trim();
  return { title, groupHint: match[2] };
}

/** 在已知分组里解析提示（页内预览用；与主进程 captureQuestion 同规则） */
export function matchGroup<G extends { title: string }>(
  groups: G[],
  hint: string | null
): G | null {
  if (!hint) return null;
  const key = hint.toLowerCase();
  return (
    groups.find(g => g.title.toLowerCase() === key) ??
    groups.find(g => g.title.toLowerCase().startsWith(key)) ??
    null
  );
}

/**
 * 输入是否像一个问题（命令面板据此决定「记为问题」置顶还是垫底）：
 * 以问号结尾（允许尾随 #分组）或带 #分组 记号。
 */
export function looksLikeQuestion(raw: string): boolean {
  const text = raw.trim();
  return /[?？]\s*(#\S+)?$/.test(text) || GROUP_TOKEN.test(text);
}
