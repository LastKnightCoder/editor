// @vitest-environment node
import { expect, it } from "vitest";
import simpleGit from "simple-git";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stagePublication, publicationGitError } from "../publish-git";
it("只提交发布路径，包含被 ignore 的数据，保留其他文件并按字面处理资源名", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tau-publish-git-"));
  try {
    const git = simpleGit(root);
    await git.init();
    await git.addConfig("user.name", "Publish Test");
    await git.addConfig("user.email", "publish@example.invalid");
    await writeFile(path.join(root, ".gitignore"), "data/\n");
    await writeFile(path.join(root, "CNAME"), "example.invalid");
    await writeFile(path.join(root, "old.html"), "旧文件");
    await git.add([".gitignore", "CNAME", "old.html"]);
    await git.commit("初始网站");
    await mkdir(path.join(root, "data"));
    await writeFile(path.join(root, "data/item.json"), "{}");
    await writeFile(path.join(root, "index.html"), "入口");
    await writeFile(path.join(root, "private.txt"), "不属于发布");
    await writeFile(path.join(root, "*.txt"), "作者可用特殊文件名");
    await rm(path.join(root, "old.html"));
    await stagePublication(
      git,
      ["index.html", "data/item.json", "*.txt"],
      ["old.html", "missing.html"]
    );
    const staged = (await git.raw(["diff", "--cached", "--name-only", "-z"]))
      .split("\0")
      .filter(Boolean);
    expect(new Set(staged)).toEqual(new Set(["index.html", "data/item.json", "*.txt", "old.html"]));
    await git.commit("发布");
    expect(await git.show(["HEAD:data/item.json"])).toBe("{}");
    expect(await readFile(path.join(root, "CNAME"), "utf8")).toBe("example.invalid");
    expect(await git.raw(["ls-tree", "--name-only", "HEAD"])).not.toContain("private.txt");
    await git.add(["private.txt"]);
    await expect(stagePublication(git, ["index.html"], [])).rejects.toThrow("其他暂存");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("Git 错误不向日志或界面传递凭据", () => {
  const token = "example-test-token";
  const remote = `https://x-access-token:${token}@github.com/owner/repo.git`;
  const error = publicationGitError(new Error(`clone ${remote} failed ${token}`), [remote, token]);
  expect(error.message).not.toContain(token);
  expect(error.message).toContain("已隐藏");
});
