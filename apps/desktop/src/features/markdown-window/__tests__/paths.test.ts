import { describe, expect, it } from "vitest";
import {
  baseName,
  dirName,
  invalidFileName,
  isWithin,
  joinPath,
  rebasePath,
  splitExtension,
} from "../paths";

describe("paths", () => {
  it("按路径风格拼接", () => {
    expect(joinPath("/Users/a/docs", "x.md")).toBe("/Users/a/docs/x.md");
    expect(joinPath("/Users/a/docs/", "x.md")).toBe("/Users/a/docs/x.md");
    expect(joinPath("C:\\notes", "x.md")).toBe("C:\\notes\\x.md");
  });

  it("取文件名与目录", () => {
    expect(baseName("/a/b/c.md")).toBe("c.md");
    expect(baseName("C:\\a\\b")).toBe("b");
    expect(dirName("/a/b/c.md")).toBe("/a/b");
    expect(dirName("/c.md")).toBe("/");
    expect(dirName("C:\\a\\c.md")).toBe("C:\\a");
  });

  it("拆扩展名，点开头视为无扩展名", () => {
    expect(splitExtension("论文.md")).toEqual({ stem: "论文", ext: ".md" });
    expect(splitExtension(".gitignore")).toEqual({ stem: ".gitignore", ext: "" });
    expect(splitExtension("a.b.c")).toEqual({ stem: "a.b", ext: ".c" });
  });

  it("判断包含关系，不被同前缀目录误判", () => {
    expect(isWithin("/a/b/c.md", "/a/b")).toBe(true);
    expect(isWithin("/a/b", "/a/b/")).toBe(true);
    expect(isWithin("/a/bc/d.md", "/a/b")).toBe(false);
    expect(isWithin("C:\\a\\b\\c.md", "C:\\a")).toBe(true);
  });

  it("文件夹改名后其中的路径跟随", () => {
    expect(rebasePath("/a/old/x.md", "/a/old", "/a/new")).toBe("/a/new/x.md");
    expect(rebasePath("/a/old", "/a/old", "/a/new")).toBe("/a/new");
    expect(rebasePath("/a/other/x.md", "/a/old", "/a/new")).toBe("/a/other/x.md");
  });

  it("校验文件名", () => {
    expect(invalidFileName("好.md")).toBeNull();
    expect(invalidFileName("  ")).not.toBeNull();
    expect(invalidFileName("a/b")).not.toBeNull();
    expect(invalidFileName("..")).not.toBeNull();
  });
});
