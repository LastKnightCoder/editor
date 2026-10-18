import { mermaidCodec } from "./src/extensions/mermaid/markdown.ts";
import { plantumlCodec } from "./src/extensions/plantuml/markdown.ts";
import { abcCodec } from "./src/extensions/abc/markdown.ts";
import { typstCodec } from "./src/extensions/typst/markdown.ts";

export { mermaidCodec, plantumlCodec, abcCodec, typstCodec };
export const diagramMarkdownCodecs = [mermaidCodec, abcCodec, plantumlCodec, typstCodec];
