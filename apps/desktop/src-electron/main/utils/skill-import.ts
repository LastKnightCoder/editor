import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { parseSkillFrontMatter } from "./skill-frontmatter";

export const SKILL_README = "SKILL.md";
const IGNORED_DIRS = new Set([".git", "node_modules", "__pycache__", ".venv", "__MACOSX"]);
const MAX_SCAN_DEPTH = 5;

export interface SkillImportCandidate {
  /** 候选在暂存根目录下的相对路径（commit 时回传） */
  relPath: string;
  folderName: string;
  name: string;
  description: string;
  fileCount: number;
  hasScripts: boolean;
}

export interface GithubSkillSource {
  owner: string;
  repo: string;
  ref: string;
  subPath: string;
}

/** 支持 github.com/o/r、/tree/ref/path、/blob/ref/path/SKILL.md 三种链接 */
export const parseGithubUrl = (raw: string): GithubSkillSource => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("不是有效的链接");
  }
  if (url.hostname !== "github.com") throw new Error("目前只支持 github.com 的仓库链接");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("链接里缺少仓库名");
  const [owner, rawRepo, kind, ref, ...rest] = parts;
  const repo = rawRepo.replace(/\.git$/, "");
  if (!kind) return { owner, repo, ref: "HEAD", subPath: "" };
  if ((kind !== "tree" && kind !== "blob") || !ref) throw new Error("无法识别的 GitHub 链接");
  let subPath = rest.join("/");
  if (kind === "blob")
    subPath = path.posix.dirname(subPath) === "." ? "" : path.posix.dirname(subPath);
  return { owner, repo, ref, subPath };
};

/** 递归找含 SKILL.md 的目录；找到即停止向下（Skill 内部的子目录不再当候选） */
export const findSkillDirs = async (root: string, depth = 0): Promise<string[]> => {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  if (entries.some(e => e.isFile() && e.name === SKILL_README)) return [root];
  if (depth >= MAX_SCAN_DEPTH) return [];
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name) || entry.name.startsWith("."))
      continue;
    found.push(...(await findSkillDirs(path.join(root, entry.name), depth + 1)));
  }
  return found;
};

export const countFiles = async (dir: string): Promise<{ count: number; hasScripts: boolean }> => {
  let count = 0;
  let hasScripts = false;
  const walk = async (current: string) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "scripts") hasScripts = true;
        await walk(full);
      } else {
        count += 1;
        if (/\.(py|sh|bash|js|mjs|cjs|ts)$/i.test(entry.name)) hasScripts = true;
      }
    }
  };
  await walk(dir);
  return { count, hasScripts };
};

export const describeCandidates = async (stageRoot: string, dirs: string[]) =>
  Promise.all(
    dirs.map(async dir => {
      const readme = await fs.readFile(path.join(dir, SKILL_README), "utf-8");
      const meta = parseSkillFrontMatter(readme);
      const { count, hasScripts } = await countFiles(dir);
      const folderName = path.basename(dir);
      return {
        relPath: path.relative(stageRoot, dir),
        folderName,
        name: meta.name ?? folderName,
        description: meta.description,
        fileCount: count,
        hasScripts,
      } satisfies SkillImportCandidate;
    })
  );

export const createStageDir = () => fs.mkdtemp(path.join(os.tmpdir(), "tau-skill-import-"));

/** 解压到暂存目录；逐条校验落点，拒绝 zip-slip */
export const extractZip = async (zipData: Buffer, stageDir: string): Promise<void> => {
  const zip = new AdmZip(zipData);
  const root = path.resolve(stageDir);
  for (const entry of zip.getEntries()) {
    const target = path.resolve(root, entry.entryName);
    const rel = path.relative(root, target);
    if (rel.startsWith("..") || path.isAbsolute(rel))
      throw new Error(`压缩包含非法路径：${entry.entryName}`);
    if (entry.isDirectory) {
      await fs.mkdir(target, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, entry.getData());
    }
  }
};

/** Skill 目录名：保留中文、字母数字与连字符 */
export const sanitizeFolderName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_\u4e00-\u9fa5]/g, "")
    .replace(/^-+|-+$/g, "");

export const copyDir = async (from: string, to: string): Promise<void> => {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(src, dest);
    else if (entry.isFile()) await fs.copyFile(src, dest);
  }
};

export const zipDirectory = (dir: string): Buffer => {
  const zip = new AdmZip();
  zip.addLocalFolder(dir, path.basename(dir));
  return zip.toBuffer();
};

/** 关联目录白名单清洗：非数组归一为 undefined（从未选择 = 全部生效）；数组去重、trim、滤空 */
export const cleanSelectedSkills = (raw: unknown): string[] | undefined =>
  Array.isArray(raw)
    ? [
        ...new Set(
          raw
            .filter((s): s is string => typeof s === "string" && s.trim() !== "")
            .map(s => s.trim())
        ),
      ]
    : undefined;

/** 白名单三态判断：undefined = 从未选择（全部生效）；数组只生效列出的（空数组 = 全不选） */
export const isSelectedSkill = (
  folderName: string,
  selectedSkills: string[] | undefined
): boolean => selectedSkills === undefined || selectedSkills.includes(folderName);
