import { registerBlockTypes } from "@/utils/blockRegistry";
import { htmlBlockRenderer } from "./HtmlBlockRenderer";
import { mermaidBlockRenderer } from "./MermaidBlockRenderer";
import { plantumlBlockRenderer } from "./PlantUMLBlockRenderer";
import { mindMapBlockRenderer } from "./MindMapBlockRenderer";
import { tikzBlockRenderer } from "./TikzBlockRenderer";
import { typstBlockRenderer } from "./TypstBlockRenderer";
import { whiteboardBlockRenderer } from "./WhiteBoardBlockRenderer";

export function initBlockRenderers() {
  registerBlockTypes([
    htmlBlockRenderer,
    mermaidBlockRenderer,
    plantumlBlockRenderer,
    mindMapBlockRenderer,
    whiteboardBlockRenderer,
    tikzBlockRenderer,
    typstBlockRenderer,
  ]);
}
