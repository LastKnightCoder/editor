/** 基础 Mermaid 渲染：原生 mermaid SVG 输出，明暗主题跟随系统 */
export const renderMermaidSvg = async (params: {
  code: string;
  mermaidId: string;
  isDark: boolean;
  /** 不可信来源（如模型生成）传 strict：禁用点击回调与 HTML 标签；默认 loose 保持原行为 */
  securityLevel?: "strict" | "loose";
}): Promise<string> => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: params.isDark ? "dark" : "default",
    securityLevel: params.securityLevel ?? "loose",
    fontFamily: "monospace",
  });
  await mermaid.parse(params.code);
  const { svg } = await mermaid.render(params.mermaidId, params.code);
  return svg;
};
