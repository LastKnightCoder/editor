import {
  buildMermaidTheme,
  readDocumentToken,
  withSvgBackground,
  type MermaidTokenReader,
} from "./mermaid-theme";

/**
 * 基础 Mermaid 渲染：配色取当前主题 token（mermaid `base` 主题），读不到 token 时回落官方明暗主题。
 * 图内 `%%{init: {theme: ...}}%%` 指令优先于这里的主题。
 */
export const renderMermaidSvg = async (params: {
  code: string;
  mermaidId: string;
  isDark: boolean;
  /** 不可信来源（如模型生成）传 strict：禁用点击回调与 HTML 标签；默认 loose 保持原行为 */
  securityLevel?: "strict" | "loose";
  /** token 取值；缺省从 <html> 读 --tau-* */
  token?: MermaidTokenReader;
}): Promise<string> => {
  const mermaid = (await import("mermaid")).default;
  const theme = buildMermaidTheme(params.token ?? readDocumentToken, params.isDark);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: params.securityLevel ?? "loose",
    ...(theme
      ? {
          theme: "base",
          themeVariables: theme.themeVariables,
          themeCSS: theme.themeCSS,
          fontFamily: theme.fontFamily,
        }
      : { theme: params.isDark ? "dark" : "default" }),
  });
  await mermaid.parse(params.code);
  const { svg } = await mermaid.render(params.mermaidId, params.code);
  return theme ? withSvgBackground(svg, theme.background) : svg;
};
