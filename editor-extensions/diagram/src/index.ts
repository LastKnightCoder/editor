import mermaidExtension from "./extensions/mermaid";
import type {} from "./augmentations";
import abcExtension from "./extensions/abc";
import plantUMLExtension from "./extensions/plantuml";

export { mermaidExtension, abcExtension, plantUMLExtension };
export { createPlantUMLExtension, type PlantUMLExtensionOptions } from "./extensions/plantuml";
export type { MermaidElement, PlantUMLElement, AbcElement, TypstElement } from "./types";
export { insertMermaid, insertPlantUML, insertAbc } from "./insert";

/** 稳定扩展实例，宿主在场景 kit 中按需组合。渲染器由各扩展懒加载。 */
export const diagramExtensions = [mermaidExtension, abcExtension, plantUMLExtension] as const;
