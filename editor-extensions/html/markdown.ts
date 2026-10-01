import { htmlBlockCodec } from "./src/extensions/html-block/markdown.ts";
import { htmlInlineCodec } from "./src/extensions/html-inline/markdown.ts";

export { htmlBlockCodec, htmlInlineCodec };
export const htmlMarkdownCodecs = [htmlBlockCodec, htmlInlineCodec];
