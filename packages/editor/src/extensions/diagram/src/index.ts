import mermaidExtension from "./extensions/mermaid";
import "./augmentations";
import plantUMLExtension from "./extensions/plantuml";

export { mermaidExtension, plantUMLExtension };
export { createPlantUMLExtension, type PlantUMLExtensionOptions } from "./extensions/plantuml";
export type { MermaidElement, PlantUMLElement } from "./types";
export { insertMermaid, insertPlantUML } from "./insert";

/** 稳定扩展实例，宿主在场景 kit 中按需组合。渲染器由各扩展懒加载。 */
export const diagramExtensions = [mermaidExtension, plantUMLExtension] as const;
