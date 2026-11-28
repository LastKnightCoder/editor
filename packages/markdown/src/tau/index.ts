import { encodeTauMarkdown } from "./encode.ts";
import { decodeTauMarkdown } from "./decode.ts";
import type { TauMarkdownOptions } from "./format.ts";

export { encodeTauMarkdown } from "./encode.ts";
export { decodeTauMarkdown } from "./decode.ts";
export {
  TAU_MARKDOWN_HEADER,
  TAU_MARKDOWN_HELP,
  isTauMarkdown,
  type TauMarkdownOptions,
  type TauMarkdownLimits,
  type TauMarkdownDecoded,
} from "./format.ts";

export function getTauMarkdownWithPositions(
  content: readonly unknown[],
  options: TauMarkdownOptions = {}
) {
  const markdown = encodeTauMarkdown(content, options);
  const parsed = decodeTauMarkdown(markdown, options);
  return { markdown, positionMap: parsed.positionMap, blockRanges: parsed.blockRanges };
}
