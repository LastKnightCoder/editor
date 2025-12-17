import { registerBlockTypes } from "@/utils/blockRegistry";
import { htmlBlockRenderer } from "./HtmlBlockRenderer";
import { mermaidBlockRenderer } from "./MermaidBlockRenderer";
import { plantumlBlockRenderer } from "./PlantUMLBlockRenderer";
import { mindMapBlockRenderer } from "./MindMapBlockRenderer";
import { whiteBoardBlockRenderer } from "./WhiteBoardBlockRenderer";

/**
 * 初始化所有块渲染器
 */
export function initBlockRenderers() {
  registerBlockTypes([
    htmlBlockRenderer,
    mermaidBlockRenderer,
    plantumlBlockRenderer,
    mindMapBlockRenderer,
    whiteBoardBlockRenderer,
  ]);
}
