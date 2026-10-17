// @vitest-environment node
import { expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { reminderCodec } from "./fixtures/example/reminderCodec";

it("纯 codec 在没有 DOM 的执行端可独立装配，缺失插件仍保留私有字段", () => {
  expect(typeof document).toBe("undefined");
  const active = createMarkdownProcessor({ codecs: [...editorMarkdownCodecs, reminderCodec] });
  const missing = createMarkdownProcessor({ codecs: editorMarkdownCodecs });
  const value = active.importFromMarkdown(":::plugin-reminder{done=true}\n跨执行端正文\n:::");
  expect(active.importFromMarkdown(active.getMarkdown(value))).toEqual(value);
  const opaque = value.map(node => ({ ...node, futureField: { version: 2 } }));
  expect(missing.importFromMarkdown(missing.getMarkdown(opaque))).toEqual(opaque);
});
