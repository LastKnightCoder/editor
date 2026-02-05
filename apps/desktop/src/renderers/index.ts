import { registerBlockTypes } from "@/utils/blockRegistry";
import { htmlBlockRenderer } from "./HtmlBlockRenderer";
import { mermaidBlockRenderer } from "./MermaidBlockRenderer";
import { plantumlBlockRenderer } from "./PlantUMLBlockRenderer";
import { mindMapBlockRenderer } from "./MindMapBlockRenderer";
import { whiteBoardBlockRenderer } from "./WhiteBoardBlockRenderer";
import { tikzBlockRenderer } from "./TikzBlockRenderer";

export function initBlockRenderers() {
  registerBlockTypes([
    htmlBlockRenderer,
    mermaidBlockRenderer,
    plantumlBlockRenderer,
    mindMapBlockRenderer,
    whiteBoardBlockRenderer,
    tikzBlockRenderer,
  ]);
}
