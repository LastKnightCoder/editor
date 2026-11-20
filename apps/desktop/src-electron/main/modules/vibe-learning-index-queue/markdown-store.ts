import { promises as fs } from "fs";
import { join, dirname } from "node:path";
import PathUtil from "../../utils/PathUtil";
import databaseModule from "../database";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import { vibeLearningMarkdownDir } from "../vibe-learning-resource-read-utils";

export async function saveMarkdown(
  mainDbName: string,
  projectId: number,
  resourceId: number,
  resourceName: string,
  content: string
): Promise<string> {
  const baseName = getBaseFileName(resourceName);
  const safeBaseName = sanitizeFileName(baseName);
  const fileName = `${safeBaseName}-${resourceId}.md`;
  const relativePath = `${vibeLearningMarkdownDir(mainDbName, projectId)}/${fileName}`;
  const absolutePath = getAbsoluteMarkdownPath(relativePath);

  // 确保目录存在
  await fs.mkdir(dirname(absolutePath), { recursive: true });

  // 写入文件
  await fs.writeFile(absolutePath, content, "utf-8");

  return relativePath;
}

export function getBaseFileName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return fileName;
  }
  return fileName.substring(0, lastDotIndex);
}

export function sanitizeFileName(fileName: string): string {
  // 替换文件系统中不允许的字符
  return fileName.replace(/[<>:"/\\|?*]/g, "_").trim();
}

export function getAbsoluteMarkdownPath(relativePath: string): string {
  const appDir = PathUtil.getAppDir();
  return join(appDir, relativePath);
}

export async function updateResourceMarkdownPath(
  mainDbName: string,
  resourceId: number,
  markdownPath: string
): Promise<void> {
  const db = databaseModule.getDatabase(mainDbName);

  if (!db) {
    throw new Error("Database not found");
  }

  VibeLearningResourceTable.updateMarkdownPath(db, resourceId, markdownPath);
}

export async function checkMarkdownExists(relativePath: string): Promise<boolean> {
  try {
    const absolutePath = getAbsoluteMarkdownPath(relativePath);
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}
