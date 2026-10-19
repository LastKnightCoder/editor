// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtemp, mkdir, symlink, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { publicationDestination } from "../publish-destination";
import { planPublication } from "../publish-release-state";
it.each(["../private", "/absolute", ".git/config", "assets/.GiT/hooks/pre-commit"])(
  "发布计划拒绝非法历史路径 %s",
  filePath => {
    expect(() => planPublication([], [{ filePath, contentHash: "" }])).toThrow();
  }
);
it("输出目标中的目录链接不能导向外部文件", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-publish-destination-"));
  try {
    const root = path.join(directory, "site"),
      outside = path.join(directory, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(outside, "asset.js"), "保留");
    await symlink(outside, path.join(root, "assets"));
    expect(() => publicationDestination(root, "assets/asset.js")).toThrow("符号链接");
    expect(await readFile(path.join(outside, "asset.js"), "utf8")).toBe("保留");
    expect(publicationDestination(root, "data/article.json")).toBe(
      path.join(await realpath(root), "data/article.json")
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
