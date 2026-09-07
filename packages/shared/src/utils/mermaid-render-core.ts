/** 基础 Mermaid 渲染：原生 mermaid SVG 输出，明暗主题跟随系统 */
export const renderMermaidSvg = async (params: {
  code: string;
  mermaidId: string;
  isDark: boolean;
}): Promise<string> => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: params.isDark ? "dark" : "default",
    securityLevel: "loose",
    fontFamily: "monospace",
  });
  await mermaid.parse(params.code);
  const { svg } = await mermaid.render(params.mermaidId, params.code);
  return svg;
};
