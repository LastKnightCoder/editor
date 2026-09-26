import { describe, expect, it } from "vitest";
import { buildTreeIndex, filterTree, type TreeEntry } from "../fileTree/treeFilter";

const root = "/r";
const dir = (path: string): TreeEntry => ({
  name: path.split("/").pop()!,
  path,
  isDirectory: true,
});
const file = (path: string): TreeEntry => ({
  name: path.split("/").pop()!,
  path,
  isDirectory: false,
});

const index = buildTreeIndex(root, [
  dir("/r/images"),
  file("/r/images/a.png"),
  file("/r/images/b.png"),
  dir("/r/src"),
  file("/r/src/images.ts"),
  file("/r/src/main.ts"),
  file("/r/readme.md"),
]);

const view = (query: string, expanded: string[] = [], limit = 100) => {
  const { rows, truncated } = filterTree(index, query, new Set(expanded), limit);
  return {
    rows: rows.map(row => `${"  ".repeat(row.depth)}${row.name}${row.expanded ? "/" : ""}`),
    truncated,
  };
};

describe("filterTree", () => {
  it("命中的文件夹只显示自身，命中文件带出祖先目录", () => {
    expect(view("images").rows).toEqual(["images", "src/", "  images.ts"]);
  });

  it("自身命中的文件夹按展开状态列出全部内容", () => {
    expect(view("images", ["/r/images"]).rows).toEqual([
      "images/",
      "  a.png",
      "  b.png",
      "src/",
      "  images.ts",
    ]);
  });

  it("大小写不敏感", () => {
    expect(view("README").rows).toEqual(["readme.md"]);
  });

  it("超过上限截断", () => {
    expect(view(".", [], 2)).toEqual({ rows: ["images/", "  a.png"], truncated: true });
  });
});
