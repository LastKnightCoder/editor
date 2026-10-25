/** SDK 的 mode 沿用 CodeMirror 的 mode 名；其中与通用语言名不同的换成 Shiki 认识的名字 */
const CODEMIRROR_MODE_LANGUAGES: Record<string, string> = {
  stex: "latex",
  htmlmixed: "html",
};

/** 源码块 mode 对应的高亮语言；Shiki 不认识的名字按纯文本显示 */
export function shikiLanguageForMode(mode: string): string {
  return CODEMIRROR_MODE_LANGUAGES[mode] ?? mode;
}
