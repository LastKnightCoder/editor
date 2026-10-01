/**
 * 对话工作目录（pi 的 cwd）：目录解析与 git 分支读取 / 切换。
 * 主对话由渲染端传对话自己的目录；空串或已不存在的目录落到应用数据目录（~/.editor），
 * 保证 pi 的 bash / 文件工具不会拿着坏路径起不来。学习项目对话的目录由场景决定（见 resolveSessionCwd）。
 */
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import simpleGit from "simple-git";
import type { PiWorkspaceGit, PiWorkspaceInfo } from "@/types/pi-session";
import { vibeLearningMarkdownDir } from "./vibe-learning-resource-read-utils";

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** 请求目录 → 实际目录：空或不存在时用 fallback（应用数据目录） */
export function resolveWorkspaceCwd(
  requested: string | undefined,
  fallback: string
): { cwd: string; missing: boolean } {
  const trimmed = requested?.trim();
  if (!trimmed) return { cwd: fallback, missing: false };
  return isDirectory(trimmed) ? { cwd: trimmed, missing: false } : { cwd: fallback, missing: true };
}

/**
 * 会话的实际工作目录：学习项目对话（`vibe-learning-chat:<项目 id>`）固定在该项目资料转换出的
 * Markdown 目录（还没有资料时先建出来），其余按请求目录解析。
 */
export function resolveSessionCwd(
  request: { cwd: string; chatScope?: string; databaseName?: string },
  appDir: string
): { cwd: string; missing: boolean } {
  const projectId = /^vibe-learning-chat:(\d+)$/.exec(request.chatScope ?? "")?.[1];
  if (projectId && request.databaseName) {
    const cwd = join(appDir, vibeLearningMarkdownDir(request.databaseName, projectId));
    mkdirSync(cwd, { recursive: true });
    return { cwd, missing: false };
  }
  return resolveWorkspaceCwd(request.cwd, appDir);
}

/** 目录所在的 git 仓库；不是仓库、或本机没装 git 时为 null */
export async function readWorkspaceGit(cwd: string): Promise<PiWorkspaceGit | null> {
  try {
    const git = simpleGit({ baseDir: cwd });
    if (!(await git.checkIsRepo())) return null;
    const [root, head, branch] = await Promise.all([
      git.revparse(["--show-toplevel"]),
      git.revparse(["--short", "HEAD"]).catch(() => ""),
      git.raw(["symbolic-ref", "--quiet", "--short", "HEAD"]).catch(() => ""),
    ]);
    return { root: root.trim(), branch: branch.trim() || null, head: head.trim() };
  } catch {
    return null;
  }
}

export async function readWorkspaceInfo(
  requested: string | undefined,
  appDir: string
): Promise<PiWorkspaceInfo> {
  const { cwd, missing } = resolveWorkspaceCwd(requested, appDir);
  return { path: cwd, isAppDir: cwd === appDir, missing, git: await readWorkspaceGit(cwd) };
}

/** 本地分支（按最近提交排序，当前分支也在内） */
export async function listWorkspaceBranches(cwd: string): Promise<string[]> {
  const output = await simpleGit({ baseDir: cwd }).raw([
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short)",
    "refs/heads",
  ]);
  return output
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

/** 切换到本地分支；工作区改动冲突等失败原样抛出 git 的说明 */
export async function checkoutWorkspaceBranch(cwd: string, branch: string): Promise<void> {
  const branches = await listWorkspaceBranches(cwd);
  if (!branches.includes(branch)) throw new Error(`本地没有分支 ${branch}`);
  await simpleGit({ baseDir: cwd }).checkout(branch);
}
