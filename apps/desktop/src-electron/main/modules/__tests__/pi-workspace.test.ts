/**
 * 对话工作目录：空 / 不存在的目录落到应用数据目录；学习项目对话固定在资料 Markdown 目录；
 * 仓库读当前分支与本地分支，切换后分支跟着变，不存在的分支拒绝；游离 HEAD 时分支为 null。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkoutWorkspaceBranch,
  listWorkspaceBranches,
  readWorkspaceInfo,
  resolveSessionCwd,
  resolveWorkspaceCwd,
} from "../pi-workspace";
import { vibeLearningMarkdownDir } from "../vibe-learning-resource-read-utils";

const run = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });

describe("pi-workspace", () => {
  let root: string;
  let appDir: string;
  let repo: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "pi-workspace-")));
    appDir = join(root, "app");
    repo = join(root, "repo");
    mkdirSync(appDir);
    mkdirSync(repo);
    run(repo, "init", "--initial-branch=main");
    run(repo, "config", "user.email", "test@example.com");
    run(repo, "config", "user.name", "test");
    writeFileSync(join(repo, "a.txt"), "a");
    run(repo, "add", ".");
    run(repo, "commit", "-m", "init");
    run(repo, "branch", "feature");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("空目录与不存在的目录落到应用数据目录", () => {
    expect(resolveWorkspaceCwd("", appDir)).toEqual({ cwd: appDir, missing: false });
    expect(resolveWorkspaceCwd("  ", appDir)).toEqual({ cwd: appDir, missing: false });
    expect(resolveWorkspaceCwd(join(root, "gone"), appDir)).toEqual({ cwd: appDir, missing: true });
    expect(resolveWorkspaceCwd(repo, appDir)).toEqual({ cwd: repo, missing: false });
  });

  it("学习项目对话固定在项目的资料 Markdown 目录（没有资料时先建出来），忽略请求目录", () => {
    const resolved = resolveSessionCwd(
      { cwd: repo, chatScope: "vibe-learning-chat:12", databaseName: "lib.db" },
      appDir
    );
    expect(resolved).toEqual({ cwd: join(appDir, "vibe-learning", "lib", "12"), missing: false });
    expect(statSync(resolved.cwd).isDirectory()).toBe(true);
    // 与资料转换落盘用同一约定
    expect(join(appDir, vibeLearningMarkdownDir("lib", 12))).toBe(resolved.cwd);
  });

  it("其余场景按请求目录解析", () => {
    expect(
      resolveSessionCwd({ cwd: repo, chatScope: "main-chat", databaseName: "lib" }, appDir)
    ).toEqual({ cwd: repo, missing: false });
    expect(
      resolveSessionCwd({ cwd: "", chatScope: "pdf-chat:3", databaseName: "lib" }, appDir)
    ).toEqual({ cwd: appDir, missing: false });
  });

  it("非仓库目录没有 git 信息", async () => {
    const info = await readWorkspaceInfo("", appDir);
    expect(info).toEqual({ path: appDir, isAppDir: true, missing: false, git: null });
  });

  it("仓库子目录读到仓库根与当前分支", async () => {
    const nested = join(repo, "sub");
    mkdirSync(nested);
    const info = await readWorkspaceInfo(nested, appDir);
    expect(info.path).toBe(nested);
    expect(info.isAppDir).toBe(false);
    expect(info.git?.root).toBe(repo);
    expect(info.git?.branch).toBe("main");
    expect(info.git?.head).toMatch(/^[0-9a-f]{4,}$/);
  });

  it("切换到本地分支，拒绝不存在的分支", async () => {
    expect((await listWorkspaceBranches(repo)).sort()).toEqual(["feature", "main"]);
    await checkoutWorkspaceBranch(repo, "feature");
    expect((await readWorkspaceInfo(repo, appDir)).git?.branch).toBe("feature");
    await expect(checkoutWorkspaceBranch(repo, "nope")).rejects.toThrow("本地没有分支 nope");
  });

  it("游离 HEAD 时分支为 null、保留短哈希", async () => {
    run(repo, "checkout", "--detach");
    const info = await readWorkspaceInfo(repo, appDir);
    expect(info.git?.branch).toBeNull();
    expect(info.git?.head).not.toBe("");
  });
});
