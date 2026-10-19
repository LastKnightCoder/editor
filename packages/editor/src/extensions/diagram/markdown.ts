import { mermaidCodec } from "./src/extensions/mermaid/markdown.ts";
import { plantumlCodec } from "./src/extensions/plantuml/markdown.ts";

export { mermaidCodec, plantumlCodec };
export const diagramMarkdownCodecs = [mermaidCodec, plantumlCodec];
