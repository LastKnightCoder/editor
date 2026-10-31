/** 去掉同步脚本写在开头的生成注释与一级标题。 */
export function stripDocHeader(markdown: string): string {
  return markdown.replace(/^(\s*<!--[\s\S]*?-->)*\s*#\s[^\n]*\n/, "");
}
