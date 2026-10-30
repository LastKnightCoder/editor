import { expect, it } from "vitest";
import { normalizeLocalResourcePath } from "./resource-path";

it.each([
  [String.raw`~\.editor\resources\图片.png`, "~/.editor/resources/图片.png"],
  [String.raw`~.editor\resources\图片.png`, "~/.editor/resources/图片.png"],
  ["~.editor/resources/图片.png", "~/.editor/resources/图片.png"],
  [String.raw`C:\Users\test\.editor\resources\a.png`, "C:/Users/test/.editor/resources/a.png"],
  [String.raw`\\server\share\a.png`, "//server/share/a.png"],
  ["~/.editor/resources/a.png", "~/.editor/resources/a.png"],
])("本地资源引用规范化且幂等：%s", (source, expected) => {
  expect(normalizeLocalResourcePath(source)).toBe(expected);
  expect(normalizeLocalResourcePath(expected)).toBe(expected);
});

it.each([
  "https://images.test/a.png?signature=%5C.foo&key=a%2Fb",
  String.raw`https://images.test/a.png?token=\signature`,
  "data:image/svg+xml,<svg></svg>",
  "blob:https://images.test/id",
  "tau-collab-asset:123",
  "file:///C:/Users/test/.editor/resources/a.png",
  "~.editor-other/resources/a.png",
  "~alice/resources/a.png",
  "relative/editor.png",
  "",
])("不改写协议地址或相似的合法路径：%s", source => {
  expect(normalizeLocalResourcePath(source)).toBe(source);
});
