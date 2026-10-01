import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { exampleMarkdown } from "../src/host/markdown";

it("专用语法往返与文本位置保持，缺少 codec 可通过通用载体保真", () => {
  const source = ":::example-reminder{done=true}\n公开正文\n:::";
  const result = exampleMarkdown.importFromMarkdownWithPositions(source);
  expect(result.content[0]).toMatchObject({ type: "example.reminder", done: true });
  expect(exampleMarkdown.importFromMarkdown(exampleMarkdown.getMarkdown(result.content))).toEqual(
    result.content
  );
  expect(result.positionMap.getMappings()).toContainEqual(
    expect.objectContaining({
      type: "text",
      slateTextPath: [0, 0, 0],
      mdLine: 1,
      mdCh: 0,
    })
  );
  const withoutCodec = createMarkdownProcessor({ codecs: editorMarkdownCodecs });
  expect(withoutCodec.importFromMarkdown(withoutCodec.getMarkdown(result.content))).toEqual(
    result.content
  );
});

it("Node 按公开包入口加载 codec，不需要 DOM 或宿主别名", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      'import { exampleMarkdown } from "./src/host/markdown.ts"; if (typeof document !== "undefined") throw new Error("不应存在 DOM"); const value = exampleMarkdown.importFromMarkdown(":::example-reminder{done=true}\\n正文\\n:::"); console.log(JSON.stringify(value[0]));',
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  expect(JSON.parse(output)).toMatchObject({ type: "example.reminder", done: true });
});

it("公开工具条布局入口可由 Node 加载，旧 src 入口被包边界拒绝", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      'import assert from "node:assert/strict"; import { calculateFloatingPosition } from "@tau/editor/toolbar"; assert.deepEqual(calculateFloatingPosition({anchorRect:{top:100,bottom:120,left:50,width:40},viewportWidth:600,viewportHeight:500,floatingWidth:80,floatingHeight:30}),{top:128,left:30,placement:"bottom"}); await assert.rejects(import("@tau/editor/src"),{code:"ERR_PACKAGE_PATH_NOT_EXPORTED"}); console.log("ok");',
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  expect(output.trim()).toBe("ok");
});
