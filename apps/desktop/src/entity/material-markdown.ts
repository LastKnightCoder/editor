/** 一条外部材料的 Markdown：引用块原文，空一行写想法，末行出处。转卡片与 Notebook 材料资源共用 */
export function materialQuoteMarkdown(info: { quote: string; note: string; meta: string }): string {
  const quote = info.quote
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `> ${line}`)
    .join("\n");
  return [quote, info.note.trim(), `—— ${info.meta}`].filter(Boolean).join("\n\n");
}
