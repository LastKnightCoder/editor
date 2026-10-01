import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { createMarkdownProcessor } from "@tau/markdown";
import { reminderCodec } from "@example/editor-reminder/markdown";

export const exampleMarkdown = createMarkdownProcessor({
  codecs: [...editorMarkdownCodecs, reminderCodec],
});
