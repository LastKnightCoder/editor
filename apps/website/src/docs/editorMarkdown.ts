/** 文档正文的 Markdown 解析：与桌面端导入同一套 codec，元素类型须被 editorKit 覆盖 */
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { blockquoteCodec } from "@tau/editor/extensions/blockquote/markdown";
import { calloutCodec } from "@tau/editor/extensions/callout/markdown";
import { detailCodec } from "@tau/editor/extensions/detail/markdown";
import { highlightBlockCodec } from "@tau/editor/extensions/highlight-block/markdown";
import { tableMarkdownCodecs } from "@tau/editor/extensions/table/markdown";
import { listMarkdownCodecs } from "@tau/editor/extensions/list/markdown";
import { headerCodec } from "@tau/editor/extensions/header/markdown";
import { linkCodec } from "@tau/editor/extensions/link/markdown";
import { bookmarkCodec } from "@tau/editor/extensions/bookmark/markdown";
import { annotationCodec } from "@tau/editor/extensions/annotation/markdown";
import { kbdCodec } from "@tau/editor/extensions/kbd/markdown";
import { divideLineCodec } from "@tau/editor/extensions/divide-line/markdown";
import { frontMatterCodec } from "@tau/editor/extensions/front-matter/markdown";
import { mediaMarkdownCodecs } from "@tau/editor/extensions/media/markdown";
import { underlineCodec } from "@tau/editor/extensions/underline/markdown";
import { styledTextCodec } from "@tau/editor/extensions/styled-text/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { codeBlockV2Codec as codeBlockCodec } from "@tau/editor/extensions/code-block/markdown";
import { mathMarkdownCodecs } from "@tau/editor/extensions/math/markdown";
import { emojiCodec } from "@tau/editor/extensions/emoji/markdown";

export const docsMarkdown = createMarkdownProcessor({
  codecs: [
    ...editorMarkdownCodecs,
    blockquoteCodec,
    calloutCodec,
    detailCodec,
    highlightBlockCodec,
    ...tableMarkdownCodecs,
    ...listMarkdownCodecs,
    headerCodec,
    linkCodec,
    bookmarkCodec,
    annotationCodec,
    kbdCodec,
    divideLineCodec,
    frontMatterCodec,
    ...mediaMarkdownCodecs,
    underlineCodec,
    styledTextCodec,
    emojiCodec,
    codeBlockCodec,
    ...mathMarkdownCodecs,
  ],
  textCodecs: [textFormattingCodec],
});
