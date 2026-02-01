import { ipcMain } from "electron";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import log from "electron-log";
import { parse as parseYaml } from "yaml";
import PathUtil from "../utils/PathUtil";
import { Module } from "../types/module";
import { Skill, SkillFile, SkillDetail, SkillMeta } from "@/types";

const SKILLS_DIR = ".skills";
const SKILL_README = "SKILL.md";

const DEFAULT_SKILL_README = (name: string) => `---
description: "在这里填写 Skill 的简短描述"
---
# ${name}

## 描述

在这里描述这个 Skill 的用途...

## 使用方法

在这里说明如何使用这个 Skill...
`;

class SkillModule implements Module {
  name = "skill";
  private skillsDir = "";

  async init() {
    const appDir = PathUtil.getAppDir();
    this.skillsDir = join(appDir, SKILLS_DIR);

    await this.ensureSkillsDir();

    // 列出所有 Skills
    ipcMain.handle("skill:list", async () => {
      return await this.listSkills();
    });

    // 获取 Skill 详情
    ipcMain.handle("skill:detail", async (_, folderName: string) => {
      return await this.getSkillDetail(folderName);
    });

    // 获取 SKILL.md 内容
    ipcMain.handle("skill:readme", async (_, folderName: string) => {
      return await this.getSkillReadme(folderName);
    });

    // 获取文件列表
    ipcMain.handle("skill:files", async (_, folderName: string) => {
      return await this.getSkillFiles(folderName);
    });

    // 创建 Skill 文件夹
    ipcMain.handle("skill:create-folder", async (_, name: string) => {
      return await this.createSkillFolder(name);
    });

    // 写入文件
    ipcMain.handle(
      "skill:write-file",
      async (_, filePath: string, content: string) => {
        return await this.writeSkillFile(filePath, content);
      },
    );

    // 删除 Skill 文件夹
    ipcMain.handle("skill:delete-folder", async (_, folderName: string) => {
      return await this.deleteSkillFolder(folderName);
    });

    // 获取 skills 目录路径
    ipcMain.handle("skill:get-skills-dir", async () => {
      return this.skillsDir;
    });

    // 读取文件内容
    ipcMain.handle("skill:read-file", async (_, filePath: string) => {
      return await this.readSkillFile(filePath);
    });

    // 创建文件夹
    ipcMain.handle(
      "skill:create-directory",
      async (_, dirPath: string, dirName: string) => {
        return await this.createDirectory(dirPath, dirName);
      },
    );

    // 删除文件或文件夹
    ipcMain.handle("skill:delete", async (_, targetPath: string) => {
      return await this.deleteFileOrFolder(targetPath);
    });

    // 重命名文件或文件夹
    ipcMain.handle(
      "skill:rename",
      async (_, oldPath: string, newName: string) => {
        return await this.renameFileOrFolder(oldPath, newName);
      },
    );

    // 创建文件
    ipcMain.handle(
      "skill:create-file",
      async (_, dirPath: string, fileName: string) => {
        return await this.createFile(dirPath, fileName);
      },
    );

    // 获取整个 skills 目录的文件树
    ipcMain.handle("skill:get-file-tree", async (_, dirPath?: string) => {
      return await this.getFileTree(dirPath);
    });

    // 在文件系统中显示文件或文件夹
    ipcMain.handle("skill:show-in-folder", async (_, filePath: string) => {
      return await this.showInFolder(filePath);
    });

    // 获取 Skill 的树形结构
    ipcMain.handle("skill:tree", async (_, folderName: string) => {
      return await this.getSkillTree(folderName);
    });

    log.info("Skill module initialized");
  }

  private async ensureSkillsDir(): Promise<void> {
    if (!existsSync(this.skillsDir)) {
      await fs.mkdir(this.skillsDir, { recursive: true });
      log.info(`Created skills directory: ${this.skillsDir}`);
    }
  }

  // 列出所有 Skills
  async listSkills(): Promise<Skill[]> {
    await this.ensureSkillsDir();

    const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
    const skills: Skill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = join(this.skillsDir, entry.name);
      const readmePath = join(skillPath, SKILL_README);

      try {
        const readmeContent = await fs.readFile(readmePath, "utf-8");
        const meta = this.parseSkillReadme(readmeContent);

        // name 始终使用文件夹名称
        skills.push({
          folderName: entry.name,
          name: entry.name,
          description: meta.description || "",
          path: skillPath,
        });
      } catch {
        // SKILL.md 不存在，跳过
        continue;
      }
    }

    return skills;
  }

  // 从内容中提取描述（回退方法）
  private extractDescriptionFromContent(content: string): string {
    // 跳过 front-matter 后查找描述
    const contentWithoutFrontMatter = content.replace(
      /^---\n[\s\S]*?\n---\n?/,
      "",
    );
    const lines = contentWithoutFrontMatter.split("\n");
    let foundTitle = false;

    for (const line of lines) {
      if (!foundTitle) {
        if (line.match(/^#\s+/)) {
          foundTitle = true;
        }
        continue;
      }

      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) continue;

      return trimmedLine;
    }

    return "";
  }

  // 解析 SKILL.md 的 front-matter，只提取 description
  // name 始终使用文件夹名称，不从 front-matter 中读取
  private parseSkillReadme(content: string): Pick<SkillMeta, "description"> {
    // 匹配 front-matter（以 --- 开头和结尾）
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (frontMatterMatch) {
      try {
        const yamlContent = frontMatterMatch[1];
        const meta = parseYaml(yamlContent) as { description?: string };

        return {
          description: meta.description || "",
        };
      } catch (error) {
        log.warn("Failed to parse SKILL.md front-matter:", error);
        // 解析失败，回退到正则解析
      }
    }

    // 回退：从内容提取描述
    return {
      description: this.extractDescriptionFromContent(content),
    };
  }

  // 获取 Skill 详情
  async getSkillDetail(folderName: string): Promise<SkillDetail | null> {
    const skillPath = join(this.skillsDir, folderName);
    const readmePath = join(skillPath, SKILL_README);

    if (!existsSync(skillPath)) {
      return null;
    }

    let readmeContent = "";
    let description = "";

    try {
      readmeContent = await fs.readFile(readmePath, "utf-8");
      const meta = this.parseSkillReadme(readmeContent);
      description = meta.description;
    } catch {
      // SKILL.md 不存在
    }

    const files = await this.getSkillFiles(folderName);

    // name 始终使用文件夹名称
    return {
      folderName,
      name: folderName,
      description,
      path: skillPath,
      readmeContent,
      files,
    };
  }

  // 获取 SKILL.md 内容
  async getSkillReadme(
    folderName: string,
  ): Promise<{ name: string; readmeContent: string } | null> {
    const skillPath = join(this.skillsDir, folderName);
    const readmePath = join(skillPath, SKILL_README);

    try {
      const readmeContent = await fs.readFile(readmePath, "utf-8");
      // name 始终使用文件夹名称
      return { name: folderName, readmeContent };
    } catch {
      return null;
    }
  }

  // 获取文件列表
  async getSkillFiles(folderName: string): Promise<SkillFile[]> {
    const skillPath = join(this.skillsDir, folderName);

    if (!existsSync(skillPath)) {
      return [];
    }

    return await this.scanDirectory(skillPath);
  }

  private async scanDirectory(currentPath: string): Promise<SkillFile[]> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const files: SkillFile[] = [];

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      const isMarkdown = entry.name.endsWith(".md");

      files.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isMarkdown,
      });

      if (entry.isDirectory()) {
        const subFiles = await this.scanDirectory(fullPath);
        files.push(...subFiles);
      }
    }

    return files;
  }

  // 创建 Skill 文件夹
  async createSkillFolder(name: string): Promise<string> {
    const folderName = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "");

    const skillPath = join(this.skillsDir, folderName);

    if (existsSync(skillPath)) {
      throw new Error(`Skill "${folderName}" 已存在`);
    }

    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(
      join(skillPath, SKILL_README),
      DEFAULT_SKILL_README(name),
      "utf-8",
    );

    log.info(`Created skill: ${folderName}`);
    return folderName;
  }

  // 写入文件
  async writeSkillFile(filePath: string, content: string): Promise<void> {
    if (!filePath.startsWith(this.skillsDir)) {
      throw new Error("路径必须在 skills 目录下");
    }

    const parentDir = join(filePath, "..");
    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  // 删除 Skill 文件夹
  async deleteSkillFolder(folderName: string): Promise<void> {
    const skillPath = join(this.skillsDir, folderName);

    if (!existsSync(skillPath)) {
      throw new Error(`Skill "${folderName}" 不存在`);
    }

    await fs.rm(skillPath, { recursive: true, force: true });
    log.info(`Deleted skill: ${folderName}`);
  }

  // 读取文件内容
  async readSkillFile(filePath: string): Promise<string> {
    if (!filePath.startsWith(this.skillsDir)) {
      throw new Error("路径必须在 skills 目录下");
    }

    if (!existsSync(filePath)) {
      throw new Error("文件不存在");
    }

    return await fs.readFile(filePath, "utf-8");
  }

  // 创建文件夹
  async createDirectory(dirPath: string, dirName: string): Promise<string> {
    if (!dirPath.startsWith(this.skillsDir)) {
      throw new Error("路径必须在 skills 目录下");
    }

    const newDirPath = join(dirPath, dirName);

    if (existsSync(newDirPath)) {
      throw new Error(`文件夹 "${dirName}" 已存在`);
    }

    await fs.mkdir(newDirPath, { recursive: true });
    log.info(`Created directory: ${newDirPath}`);
    return newDirPath;
  }

  // 删除文件或文件夹
  async deleteFileOrFolder(targetPath: string): Promise<void> {
    if (!targetPath.startsWith(this.skillsDir)) {
      throw new Error("路径必须在 skills 目录下");
    }

    if (!existsSync(targetPath)) {
      throw new Error("文件或文件夹不存在");
    }

    // 禁止删除 SKILL.md
    const fileName = targetPath.split("/").pop() || "";
    if (fileName === SKILL_README) {
      throw new Error("SKILL.md 是必需文件，不允许删除");
    }

    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.unlink(targetPath);
    }
    log.info(`Deleted: ${targetPath}`);
  }

  // 重命名文件或文件夹
  async renameFileOrFolder(oldPath: string, newName: string): Promise<string> {
    if (!oldPath.startsWith(this.skillsDir)) {
      throw new Error("路径必须在 skills 目录下");
    }

    if (!existsSync(oldPath)) {
      throw new Error("文件或文件夹不存在");
    }

    // 禁止重命名 SKILL.md
    const oldFileName = oldPath.split("/").pop() || "";
    if (oldFileName === SKILL_README) {
      throw new Error("SKILL.md 是必需文件，不允许重命名");
    }

    const parentDir = join(oldPath, "..");
    const newPath = join(parentDir, newName);

    if (existsSync(newPath)) {
      throw new Error(`"${newName}" 已存在`);
    }

    await fs.rename(oldPath, newPath);
    log.info(`Renamed: ${oldPath} -> ${newPath}`);
    return newPath;
  }

  // 创建文件
  async createFile(dirPath: string, fileName: string): Promise<string> {
    if (!dirPath.startsWith(this.skillsDir)) {
      throw new Error("路径必须在 skills 目录下");
    }

    const filePath = join(dirPath, fileName);

    if (existsSync(filePath)) {
      throw new Error(`文件 "${fileName}" 已存在`);
    }

    await fs.writeFile(filePath, "", "utf-8");
    log.info(`Created file: ${filePath}`);
    return filePath;
  }

  // 获取整个 skills 目录的文件树
  async getFileTree(dirPath?: string): Promise<SkillFile[]> {
    await this.ensureSkillsDir();
    const targetPath = dirPath || this.skillsDir;

    // 验证路径在 skills 目录下
    if (!targetPath.startsWith(this.skillsDir)) {
      throw new Error("路径必须在 skills 目录下");
    }

    return await this.buildFileTree(targetPath);
  }

  private async buildFileTree(currentPath: string): Promise<SkillFile[]> {
    if (!existsSync(currentPath)) {
      return [];
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const files: SkillFile[] = [];

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      const isMarkdown = entry.name.endsWith(".md");

      const fileNode: SkillFile = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isMarkdown,
      };

      files.push(fileNode);
    }

    return files;
  }

  // 在文件系统中显示文件或文件夹
  async showInFolder(filePath: string): Promise<void> {
    if (!filePath.startsWith(this.skillsDir)) {
      throw new Error("路径必须在 skills 目录下");
    }

    if (!existsSync(filePath)) {
      throw new Error("文件或文件夹不存在");
    }

    const { shell } = await import("electron");
    shell.showItemInFolder(filePath);
    log.info(`Showed in folder: ${filePath}`);
  }

  // 获取 Skill 的树形结构
  async getSkillTree(folderName: string): Promise<string> {
    const skillPath = join(this.skillsDir, folderName);

    if (!existsSync(skillPath)) {
      throw new Error(`Skill "${folderName}" 不存在`);
    }

    const stat = await fs.stat(skillPath);
    if (!stat.isDirectory()) {
      throw new Error(`"${folderName}" 不是一个目录`);
    }

    // 显示根目录名
    let result = `${folderName}/\n`;
    result += await this.buildTreeString(skillPath, "");
    return result;
  }

  private async buildTreeString(
    currentPath: string,
    prefix: string,
  ): Promise<string> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const sortedEntries = entries.sort((a, b) => {
      // 目录优先
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    let result = "";

    for (let i = 0; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      const isLastEntry = i === sortedEntries.length - 1;
      const connector = isLastEntry ? "└── " : "├── ";
      const childPrefix = prefix + (isLastEntry ? "    " : "│   ");

      const displayName = entry.isDirectory() ? `${entry.name}/` : entry.name;
      result += `${prefix}${connector}${displayName}\n`;

      if (entry.isDirectory()) {
        const childPath = join(currentPath, entry.name);
        const childTree = await this.buildTreeString(childPath, childPrefix);
        result += childTree;
      }
    }

    return result;
  }
}

export default new SkillModule();
