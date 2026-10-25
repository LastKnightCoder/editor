import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectReleaseNotes, demoteHeadings, parseReleaseHash } from "./releases.ts";

describe("更新日志数据", () => {
  it("按版本号从新到旧排列，跳过 README 与空文件", () => {
    const notes = collectReleaseNotes({
      "/notes/0.9.0.md": "## 修复\n\n- a",
      "/notes/0.10.0.md": "- b",
      "/notes/0.10.2.md": "  \n",
      "/notes/README.md": "# 说明",
      "/notes/0.2.13.md": "- c",
    });
    expect(notes.map(note => note.version)).toEqual(["0.10.0", "0.9.0", "0.2.13"]);
    expect(notes[1]?.markdown).toBe("### 修复\n\n- a");
  });

  it("标题降一级，代码块内不动", () => {
    expect(demoteHeadings("## 新功能\n### 白板\n```\n## 注释\n```\n#标签")).toBe(
      "### 新功能\n#### 白板\n```\n## 注释\n```\n#标签"
    );
  });

  it("从地址锚点读出端与版本", () => {
    expect(parseReleaseHash("")).toEqual({ platform: "desktop" });
    expect(parseReleaseHash("#mobile")).toEqual({ platform: "mobile", version: undefined });
    expect(parseReleaseHash("#desktop-0.60.0")).toEqual({ platform: "desktop", version: "0.60.0" });
    expect(parseReleaseHash("#other")).toEqual({ platform: "desktop" });
  });

  it("两端的发布说明都按版本号命名", () => {
    for (const app of ["desktop", "mobile"]) {
      const dir = fileURLToPath(new URL(`../../../${app}/release-notes/`, import.meta.url));
      const files = readdirSync(dir).filter(name => name.endsWith(".md") && name !== "README.md");
      expect(files.length).toBeGreaterThan(0);
      for (const name of files) expect(name).toMatch(/^\d+\.\d+\.\d+\.md$/);
    }
  });
});
