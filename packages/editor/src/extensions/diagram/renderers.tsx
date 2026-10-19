import loadable from "@loadable/component";

export const PlantUML = loadable(() => import("./src/renderers/PlantUML"));
export const Typst = loadable(() => import("./src/renderers/Typst"));
export const MermaidRenderer = loadable(() => import("./src/renderers/MermaidRenderer"));
export type { MermaidRendererProps } from "./src/renderers/MermaidRenderer";

/** 通用 Markdown 展示器的语言插槽，宿主显式注册，不让 shared 依赖图表包。 */
export const diagramLanguageRenderers = {
  mermaid: ({ code, isDark = false }: { code: string; isDark?: boolean }) => (
    <MermaidRenderer code={code} isDark={isDark} />
  ),
  plantuml: ({ code, isDark = false }: { code: string; isDark?: boolean }) => (
    <PlantUML content={code} isDark={isDark} />
  ),
};
