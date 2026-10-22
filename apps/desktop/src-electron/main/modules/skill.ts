import { ipcMain, net, shell } from "electron";
import { join, resolve, relative, isAbsolute, basename, sep } from "node:path";
import { homedir } from "node:os";
import { promises as fs, existsSync } from "node:fs";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";
import { Module } from "../types/module";
import { parseSkillFrontMatter } from "../utils/skill-frontmatter";
import {
  SKILL_README,
  cleanSelectedSkills,
  copyDir,
  countFiles,
  createStageDir,
  describeCandidates,
  extractZip,
  findSkillDirs,
  isSelectedSkill,
  parseGithubUrl,
  sanitizeFolderName,
  zipDirectory,
} from "../utils/skill-import";
import { cancelSkillScript, runSkillScript } from "../utils/skill-script-runner";
import {
  isSkillPackageManifest,
  validateDistributionManifest,
  type DistributionManifest,
} from "@tau/plugins/template";
import type {
  Skill,
  SkillDetail,
  SkillFile,
  SkillImportInspection,
  SkillImportSource,
  SkillLinkedDir,
  SkillScriptRunRequest,
} from "@/types";

const SKILLS_DIR = ".skills";
const LINKS_FILE = "skill-links.json";

/** 预置的关联目录（其它 AI 工具的 skills 目录），默认关闭 */
const PRESET_LINKS: Array<{ path: string; label: string }> = [
  { path: "~/.claude/skills", label: "Claude Code" },
  { path: "~/.codex/skills", label: "Codex" },
  { path: "~/.agents/skills", label: "通用 Agent Skills" },
];

const expandHome = (p: string) =>
  p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;

/** 真正的「位于目录内」判断（原实现用 startsWith，`.skills-evil` 会被放行） */
export const isInside = (root: string, target: string): boolean => {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const DEFAULT_SKILL_README = (name: string, description = "", manual = false, body?: string) => `---
name: ${JSON.stringify(name)}
description: ${JSON.stringify(description)}${manual ? "\ndisable-model-invocation: true" : ""}
---

${body ?? `# ${name}\n\n## 步骤\n\n1. \n`}`;

/** 插件包内的一个 Skill 目录；插件 Skill 随插件启停由渲染端过滤，Skill 包安装即可用。 */
interface PackageSkillRoot {
  dir: string;
  folderName: string;
  pluginId: string;
  pluginName: string;
  source: "plugin" | "package";
}

interface StoredLink {
  path: string;
  enabled: boolean;
  /** 只生效列出的 skill（文件夹名）；undefined = 从未选择，全部生效 */
  selectedSkills?: string[];
}

class SkillModule implements Module {
  name = "skill";
  private skillsDir = "";
  private linksFile = "";
  private stages = new Map<string, { root: string; temp: boolean }>();
  private packageRoots: PackageSkillRoot[] = [];

  async init() {
    const appDir = PathUtil.getAppDir();
    this.skillsDir = join(appDir, SKILLS_DIR);
    this.linksFile = join(appDir, LINKS_FILE);
    await fs.mkdir(this.skillsDir, { recursive: true });

    ipcMain.handle("skill:list", () => this.listSkills());
    ipcMain.handle("skill:detail", (_, skillPath: string) => this.getSkillDetail(skillPath));
    ipcMain.handle("skill:readme", (_, skillPath: string) => this.getSkillReadme(skillPath));
    ipcMain.handle("skill:tree", (_, skillPath: string) => this.getSkillTree(skillPath));
    ipcMain.handle("skill:get-skills-dir", () => this.skillsDir);
    ipcMain.handle("skill:read-file", (_, filePath: string) => this.readFile(filePath));
    ipcMain.handle("skill:write-file", (_, filePath: string, content: string) =>
      this.writeFile(filePath, content)
    );
    ipcMain.handle(
      "skill:create",
      (_, payload: { name: string; description?: string; manual?: boolean; body?: string }) =>
        this.createSkill(payload)
    );
    ipcMain.handle("skill:delete-skill", (_, skillPath: string) => this.deleteSkill(skillPath));
    ipcMain.handle("skill:create-entry", (_, dirPath: string, name: string, isDirectory: boolean) =>
      this.createEntry(dirPath, name, isDirectory)
    );
    ipcMain.handle("skill:rename", (_, oldPath: string, newName: string) =>
      this.renameEntry(oldPath, newName)
    );
    ipcMain.handle("skill:delete-entry", (_, targetPath: string) => this.deleteEntry(targetPath));
    ipcMain.handle("skill:show-in-folder", (_, filePath: string) => this.showInFolder(filePath));
    ipcMain.handle("skill:export-zip", (_, skillPath: string) => this.exportZip(skillPath));
    ipcMain.handle("skill:links:get", () => this.getLinks());
    ipcMain.handle("skill:links:set", (_, links: StoredLink[]) => this.setLinks(links));
    ipcMain.handle("skill:import:inspect", (_, source: SkillImportSource) =>
      this.inspectImport(source)
    );
    ipcMain.handle(
      "skill:import:commit",
      (_, token: string, items: Array<{ relPath: string; overwrite?: boolean }>) =>
        this.commitImport(token, items)
    );
    ipcMain.handle("skill:import:discard", (_, token: string) => this.discardImport(token));
    ipcMain.handle("skill:run-script", (_, request: SkillScriptRunRequest, runId?: string) =>
      this.runScript(request, runId)
    );
    ipcMain.handle("skill:cancel-script", (_, runId: string) => cancelSkillScript(runId));

    log.info("Skill module initialized");
  }

  // ── 根目录 ──

  private async readStoredLinks(): Promise<StoredLink[]> {
    try {
      const raw = JSON.parse(await fs.readFile(this.linksFile, "utf-8")) as {
        links?: StoredLink[];
      };
      return Array.isArray(raw.links)
        ? raw.links.map(l => ({ ...l, selectedSkills: cleanSelectedSkills(l.selectedSkills) }))
        : [];
    } catch {
      return [];
    }
  }

  private async enabledLinkRoots(): Promise<
    Array<{ root: string; selected: Set<string> | undefined }>
  > {
    const links = await this.readStoredLinks();
    return links
      .filter(l => l.enabled)
      .map(l => ({
        root: resolve(expandHome(l.path)),
        selected: l.selectedSkills ? new Set(l.selectedSkills) : undefined,
      }))
      .filter(l => existsSync(l.root) && !isInside(this.skillsDir, l.root));
  }

  /** 只读取 manifest 收集 Skill 目录；包文件的完整性由插件扫描与安装事务校验。 */
  private async scanPackageRoots(): Promise<PackageSkillRoot[]> {
    const pluginsDir = join(PathUtil.getAppDir(), "plugins");
    const folders = await fs.readdir(pluginsDir, { withFileTypes: true }).catch(() => []);
    const roots: PackageSkillRoot[] = [];
    for (const folder of folders) {
      if (folder.name.startsWith(".")) continue;
      const directory = join(pluginsDir, folder.name);
      let manifest: DistributionManifest;
      try {
        manifest = validateDistributionManifest(
          JSON.parse(await fs.readFile(join(directory, "manifest.json"), "utf-8"))
        );
      } catch {
        continue;
      }
      if (manifest.id !== folder.name || !("skills" in manifest) || !manifest.skills) continue;
      for (const id of manifest.skills)
        roots.push({
          dir: join(directory, "skills", id),
          folderName: `${manifest.id}:${id}`,
          pluginId: manifest.id,
          pluginName: manifest.name,
          source: isSkillPackageManifest(manifest) ? "package" : "plugin",
        });
    }
    this.packageRoots = roots;
    return roots;
  }

  /** 先查缓存，未命中再扫描一次，避免每次读取都遍历插件目录。 */
  private async findPackageRoot(
    match: (root: PackageSkillRoot) => boolean
  ): Promise<PackageSkillRoot | undefined> {
    return this.packageRoots.find(match) ?? (await this.scanPackageRoots()).find(match);
  }

  /** 可读：我的目录、已启用关联目录里勾选了的 skill 子树，或插件包内声明的 Skill 目录 */
  private async assertReadable(target: string): Promise<void> {
    if (isInside(this.skillsDir, target)) return;
    if (await this.findPackageRoot(root => isInside(root.dir, target))) return;
    const ok = (await this.enabledLinkRoots()).some(({ root, selected }) => {
      const rel = relative(resolve(root), resolve(target));
      if (rel.startsWith("..") || isAbsolute(rel)) return false;
      return selected === undefined || rel === "" || selected.has(rel.split(sep)[0]);
    });
    if (!ok) throw new Error("路径不在 Skill 目录内");
  }

  private assertWritable(target: string): void {
    if (!isInside(this.skillsDir, target)) {
      throw new Error("只能修改「我的」Skill；内置与关联目录的 Skill 只读");
    }
  }

  /** 路径必须是某个根下的一级 Skill 目录（关联目录还要在白名单内） */
  private async assertSkillDir(skillPath: string): Promise<void> {
    const inMine = resolve(join(skillPath, "..")) === resolve(this.skillsDir);
    const inLinked = (await this.enabledLinkRoots()).some(
      ({ root, selected }) =>
        resolve(join(skillPath, "..")) === resolve(root) &&
        (selected === undefined || selected.has(basename(skillPath)))
    );
    const inPackage =
      !inMine &&
      !inLinked &&
      Boolean(await this.findPackageRoot(root => resolve(root.dir) === resolve(skillPath)));
    if ((!inMine && !inLinked && !inPackage) || !existsSync(join(skillPath, SKILL_README))) {
      throw new Error("不是有效的 Skill 目录");
    }
  }

  async getLinks(): Promise<SkillLinkedDir[]> {
    const stored = await this.readStoredLinks();
    const byPath = new Map(stored.map(l => [l.path, l]));
    const presets = PRESET_LINKS.map(p => ({
      path: p.path,
      label: p.label,
      preset: true,
      enabled: byPath.get(p.path)?.enabled ?? false,
    }));
    const custom = stored
      .filter(l => !PRESET_LINKS.some(p => p.path === l.path))
      .map(l => ({ path: l.path, enabled: l.enabled, preset: false }));
    return Promise.all(
      [...presets, ...custom].map(async link => {
        const selectedSkills = byPath.get(link.path)?.selectedSkills;
        const abs = resolve(expandHome(link.path));
        const exists = existsSync(abs);
        if (!exists) return { ...link, exists, count: 0 };
        const skills = (await this.scanRoot(abs, "linked")).map(s => ({
          folderName: s.folderName,
          name: s.name,
          description: s.description,
          selected: isSelectedSkill(s.folderName, selectedSkills),
        }));
        return {
          ...link,
          exists,
          count: skills.length,
          selectedCount: skills.filter(s => s.selected).length,
          selectedSkills,
          skills,
        };
      })
    );
  }

  async setLinks(links: StoredLink[]): Promise<void> {
    const clean = links
      .filter(l => typeof l.path === "string" && l.path.trim())
      .map(l => ({
        path: l.path.trim(),
        enabled: Boolean(l.enabled),
        selectedSkills: cleanSelectedSkills(l.selectedSkills),
      }));
    await fs.writeFile(this.linksFile, JSON.stringify({ links: clean }, null, 2), "utf-8");
  }

  // ── 列表 / 详情 ──

  /** 读取一个 Skill 目录；不是目录或没有 SKILL.md 时返回 null */
  private async readSkill(
    skillPath: string,
    base: Pick<Skill, "folderName" | "source" | "rootPath" | "pluginId" | "pluginName">
  ): Promise<Skill | null> {
    // 关联目录常用软链接，stat 跟随链接判断是否目录
    const stat = await fs.stat(skillPath).catch(() => null);
    if (!stat?.isDirectory()) return null;
    const readme = await fs.readFile(join(skillPath, SKILL_README), "utf-8").catch(() => null);
    if (readme === null) return null;
    const meta = parseSkillFrontMatter(readme);
    const { count, hasScripts } = await countFiles(skillPath).catch(() => ({
      count: 1,
      hasScripts: false,
    }));
    return {
      ...base,
      name: meta.name ?? basename(skillPath),
      description: meta.description,
      path: skillPath,
      defaultInvocation: meta.disableModelInvocation ? "manual" : "auto",
      allowedTools: meta.allowedTools,
      fileCount: count,
      hasScripts,
      updatedAt: stat.mtimeMs,
    };
  }

  private async scanRoot(root: string, source: "mine" | "linked"): Promise<Skill[]> {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const skills: Skill[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const skill = await this.readSkill(join(root, entry.name), {
        folderName: entry.name,
        source,
        rootPath: source === "linked" ? root : undefined,
      });
      if (skill) skills.push(skill);
    }
    return skills;
  }

  private async listPackageSkills(): Promise<Skill[]> {
    const skills = await Promise.all(
      (await this.scanPackageRoots()).map(root =>
        this.readSkill(root.dir, {
          folderName: root.folderName,
          source: root.source,
          pluginId: root.pluginId,
          pluginName: root.pluginName,
        })
      )
    );
    return skills.filter((skill): skill is Skill => skill !== null);
  }

  async listSkills(): Promise<Skill[]> {
    await fs.mkdir(this.skillsDir, { recursive: true });
    const mine = await this.scanRoot(this.skillsDir, "mine");
    const linked = (
      await Promise.all(
        (await this.enabledLinkRoots()).map(async ({ root, selected }) =>
          (await this.scanRoot(root, "linked")).filter(
            s => selected === undefined || selected.has(s.folderName)
          )
        )
      )
    ).flat();
    return [...mine, ...linked, ...(await this.listPackageSkills())];
  }

  async getSkillReadme(skillPath: string): Promise<string | null> {
    await this.assertReadable(skillPath);
    return fs.readFile(join(skillPath, SKILL_README), "utf-8").catch(() => null);
  }

  private async walkFiles(root: string, current: string): Promise<SkillFile[]> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    const sorted = entries
      .filter(e => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "__pycache__")
      .sort((a, b) =>
        a.isDirectory() === b.isDirectory()
          ? a.name.localeCompare(b.name)
          : a.isDirectory()
            ? -1
            : 1
      );
    const files: SkillFile[] = [];
    for (const entry of sorted) {
      const full = join(current, entry.name);
      files.push({
        name: entry.name,
        path: full,
        relativePath: relative(root, full).split(sep).join("/"),
        isDirectory: entry.isDirectory(),
        isMarkdown: entry.name.endsWith(".md"),
      });
      if (entry.isDirectory()) files.push(...(await this.walkFiles(root, full)));
    }
    return files;
  }

  async getSkillDetail(skillPath: string): Promise<SkillDetail | null> {
    await this.assertReadable(skillPath);
    if (!existsSync(skillPath)) return null;
    const readmeContent = await fs.readFile(join(skillPath, SKILL_README), "utf-8").catch(() => "");
    const meta = parseSkillFrontMatter(readmeContent);
    const owner = await this.findPackageRoot(root => resolve(root.dir) === resolve(skillPath));
    const folderName = owner?.folderName ?? basename(skillPath);
    return {
      folderName,
      name: meta.name ?? basename(skillPath),
      description: meta.description,
      path: skillPath,
      source: owner?.source ?? (isInside(this.skillsDir, skillPath) ? "mine" : "linked"),
      ...(owner ? { pluginId: owner.pluginId, pluginName: owner.pluginName } : {}),
      defaultInvocation: meta.disableModelInvocation ? "manual" : "auto",
      allowedTools: meta.allowedTools,
      readmeContent,
      files: await this.walkFiles(skillPath, skillPath),
    };
  }

  async getSkillTree(skillPath: string): Promise<string> {
    await this.assertReadable(skillPath);
    const files = await this.walkFiles(skillPath, skillPath);
    const lines = [`${basename(skillPath)}/`];
    const depthOf = (f: SkillFile) => (f.relativePath ?? "").split("/").length - 1;
    files.forEach((file, index) => {
      const depth = depthOf(file);
      const next = files.slice(index + 1).find(f => depthOf(f) <= depth);
      const isLast = !next || depthOf(next) < depth;
      lines.push(
        `${"│   ".repeat(depth)}${isLast ? "└── " : "├── "}${file.name}${file.isDirectory ? "/" : ""}`
      );
    });
    return lines.join("\n");
  }

  // ── 读写 ──

  async readFile(filePath: string): Promise<string> {
    await this.assertReadable(filePath);
    if (!existsSync(filePath)) throw new Error("文件不存在");
    return fs.readFile(filePath, "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.assertWritable(filePath);
    await fs.mkdir(join(filePath, ".."), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  async createSkill(payload: {
    name: string;
    description?: string;
    manual?: boolean;
    body?: string;
  }): Promise<Skill> {
    const folderName = sanitizeFolderName(payload.name);
    if (!folderName) throw new Error("名称至少要包含一个字母、数字或汉字");
    const skillPath = join(this.skillsDir, folderName);
    if (existsSync(skillPath)) throw new Error(`已存在名为「${folderName}」的 Skill`);
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(
      join(skillPath, SKILL_README),
      DEFAULT_SKILL_README(
        payload.name.trim(),
        payload.description?.trim(),
        payload.manual,
        payload.body
      ),
      "utf-8"
    );
    log.info(`Created skill: ${folderName}`);
    return (await this.scanRoot(this.skillsDir, "mine")).find(s => s.folderName === folderName)!;
  }

  async deleteSkill(skillPath: string): Promise<void> {
    this.assertWritable(skillPath);
    if (resolve(join(skillPath, "..")) !== resolve(this.skillsDir))
      throw new Error("不是 Skill 目录");
    await shell.trashItem(skillPath);
    log.info(`Trashed skill: ${skillPath}`);
  }

  async createEntry(dirPath: string, name: string, isDirectory: boolean): Promise<string> {
    const target = join(dirPath, name);
    this.assertWritable(target);
    if (!name.trim() || name.includes("/") || name.includes("\\")) throw new Error("名称不合法");
    if (existsSync(target)) throw new Error(`「${name}」已存在`);
    if (isDirectory) await fs.mkdir(target, { recursive: true });
    else await fs.writeFile(target, "", "utf-8");
    return target;
  }

  async renameEntry(oldPath: string, newName: string): Promise<string> {
    this.assertWritable(oldPath);
    if (basename(oldPath) === SKILL_README) throw new Error("SKILL.md 是必需文件，不能重命名");
    const newPath = join(oldPath, "..", newName);
    this.assertWritable(newPath);
    if (existsSync(newPath)) throw new Error(`「${newName}」已存在`);
    await fs.rename(oldPath, newPath);
    return newPath;
  }

  async deleteEntry(targetPath: string): Promise<void> {
    this.assertWritable(targetPath);
    if (basename(targetPath) === SKILL_README) throw new Error("SKILL.md 是必需文件，不能删除");
    if (resolve(targetPath) === resolve(this.skillsDir)) throw new Error("不能删除 skills 目录");
    await shell.trashItem(targetPath);
  }

  async showInFolder(filePath: string): Promise<void> {
    await this.assertReadable(filePath);
    shell.showItemInFolder(filePath);
  }

  async exportZip(skillPath: string): Promise<Uint8Array> {
    await this.assertSkillDir(skillPath);
    return new Uint8Array(zipDirectory(skillPath));
  }

  // ── 导入：先解到暂存目录列出候选，再按勾选复制进「我的」 ──

  async inspectImport(source: SkillImportSource): Promise<SkillImportInspection> {
    let root: string;
    let temp = true;
    if (source.type === "folder") {
      root = resolve(source.path);
      temp = false;
    } else if (source.type === "zip") {
      root = await createStageDir();
      await extractZip(await fs.readFile(source.path), root);
    } else {
      const gh = parseGithubUrl(source.url);
      const response = await net.fetch(
        `https://github.com/${gh.owner}/${gh.repo}/archive/${encodeURIComponent(gh.ref)}.zip`
      );
      if (!response.ok) throw new Error(`下载仓库失败（HTTP ${response.status}）`);
      const stage = await createStageDir();
      await extractZip(Buffer.from(await response.arrayBuffer()), stage);
      // 归档顶层是 <repo>-<ref>/ 一层目录
      const [top] = (await fs.readdir(stage, { withFileTypes: true })).filter(e => e.isDirectory());
      root = top ? join(stage, top.name, gh.subPath) : stage;
      if (!existsSync(root)) throw new Error(`仓库里没有目录「${gh.subPath}」`);
      this.stages.set(`cleanup:${stage}`, { root: stage, temp: true });
    }

    const dirs = await findSkillDirs(root);
    if (dirs.length === 0) {
      if (temp) await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
      throw new Error("没有找到 SKILL.md");
    }
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.stages.set(token, { root, temp });
    const candidates = (await describeCandidates(root, dirs)).map(c => ({
      ...c,
      exists: existsSync(join(this.skillsDir, sanitizeFolderName(c.folderName) || c.folderName)),
    }));
    return { token, candidates };
  }

  async commitImport(
    token: string,
    items: Array<{ relPath: string; overwrite?: boolean }>
  ): Promise<string[]> {
    const stage = this.stages.get(token);
    if (!stage) throw new Error("导入已过期，请重新选择");
    const imported: string[] = [];
    for (const item of items) {
      const from = resolve(stage.root, item.relPath);
      if (!isInside(stage.root, from)) continue;
      const folderName = sanitizeFolderName(basename(from)) || basename(from);
      const to = join(this.skillsDir, folderName);
      if (existsSync(to)) {
        if (!item.overwrite) continue;
        await shell.trashItem(to);
      }
      await copyDir(from, to);
      imported.push(folderName);
    }
    await this.discardImport(token);
    return imported;
  }

  async discardImport(token: string): Promise<void> {
    const stage = this.stages.get(token);
    this.stages.delete(token);
    if (!stage?.temp) return;
    // GitHub 导入的暂存根是解压目录，候选根只是其子目录
    for (const [key, value] of this.stages) {
      if (key.startsWith("cleanup:") && isInside(value.root, stage.root)) {
        this.stages.delete(key);
        await fs.rm(value.root, { recursive: true, force: true }).catch(() => undefined);
        return;
      }
    }
    await fs.rm(stage.root, { recursive: true, force: true }).catch(() => undefined);
  }

  // ── 脚本执行（权限确认在渲染端的工具权限层完成） ──

  async runScript(request: SkillScriptRunRequest, runId?: string) {
    await this.assertSkillDir(request.skillPath);
    return runSkillScript(
      {
        skillDir: request.skillPath,
        script: request.script,
        args: request.args,
        stdin: request.stdin,
        timeoutMs: request.timeoutMs,
      },
      runId
    );
  }
}

export default new SkillModule();
