import { bulletedListCodec } from "./src/extensions/bulleted-list/markdown.ts";
import { numberedListCodec } from "./src/extensions/numbered-list/markdown.ts";
import { listItemCodec } from "./src/extensions/list-item/markdown.ts";
import { checkListCodec, checkListItemCodec } from "./src/extensions/check-list/markdown.ts";
export { bulletedListCodec, numberedListCodec, listItemCodec, checkListCodec, checkListItemCodec };
// 任务列表须先于普通列表认领（importNode 按声明顺序，首个认领生效）
export const listMarkdownCodecs = [
  checkListCodec,
  checkListItemCodec,
  bulletedListCodec,
  numberedListCodec,
  listItemCodec,
];
