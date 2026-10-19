import plantumlEncoder from "plantuml-encoder";

export const PLANTUML_DEFAULT_SERVER = "https://www.plantuml.com/plantuml";

/** 生成图表地址，静态导出无需加载 React 渲染器。 */
export const buildPlantumlSvgUrl = (content: string, server: string = PLANTUML_DEFAULT_SERVER) => {
  const trimmed = content.trim();
  return trimmed ? `${server}/svg/${plantumlEncoder.encode(trimmed)}` : "";
};

/** 图源已声明主题时尊重作者；否则在第一个 @startXXX 后注入。 */
export const applyDarkTheme = (content: string, theme: string): string => {
  if (!theme || /^\s*!theme/m.test(content)) return content;
  const directive = `!theme ${theme}`;
  const startMatch = content.match(/@start\w+[^\n]*\n?/);
  if (startMatch && startMatch.index !== undefined) {
    const insertAt = startMatch.index + startMatch[0].length;
    return `${content.slice(0, insertAt)}${directive}\n${content.slice(insertAt)}`;
  }
  return `${directive}\n${content}`;
};
