import { mermaidCodec } from "./src/extensions/mermaid/markdown.ts";
import { plantumlCodec } from "./src/extensions/plantuml/markdown.ts";
import { abcCodec } from "./src/extensions/abc/markdown.ts";

export { mermaidCodec, plantumlCodec, abcCodec };
export const diagramMarkdownCodecs = [mermaidCodec, abcCodec, plantumlCodec];
