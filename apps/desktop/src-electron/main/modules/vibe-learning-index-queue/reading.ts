import { promises as fs } from "fs";
import log from "electron-log";
import databaseModule from "../database";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import { readMarkdownLines } from "../vibe-learning-resource-read-utils";
import { smartChunkWithRanges } from "../../utils/smart-chunk";
import { getAbsoluteMarkdownPath, checkMarkdownExists } from "./markdown-store";
import { clampRange, MAX_RESOURCE_READ_CHARS } from "./utils";

const MAX_HIT_CONTEXT_RADIUS = 3;

/**
 * 根据资源名称查找资源
 */
export async function findResourceByName(
  mainDbName: string,
  projectId: number,
  resourceName: string
): Promise<{
  id: number;
  markdownPath: string | null;
  name: string;
} | null> {
  const db = databaseModule.getDatabase(mainDbName);

  if (!db) {
    return null;
  }

  const resources = VibeLearningResourceTable.getResourcesByProjectId(db, projectId);

  // 精确匹配或模糊匹配
  const exactMatch = resources.find(r => r.name === resourceName);
  if (exactMatch) {
    return {
      id: exactMatch.id,
      markdownPath: exactMatch.markdownPath,
      name: exactMatch.name,
    };
  }

  // 模糊匹配：忽略大小写和扩展名
  const normalizedName = resourceName.toLowerCase().replace(/\.[^.]+$/, "");
  const fuzzyMatch = resources.find(r => {
    const rName = r.name.toLowerCase().replace(/\.[^.]+$/, "");
    return rName === normalizedName || rName.includes(normalizedName);
  });

  if (fuzzyMatch) {
    return {
      id: fuzzyMatch.id,
      markdownPath: fuzzyMatch.markdownPath,
      name: fuzzyMatch.name,
    };
  }

  return null;
}

export async function resolveResource(params: {
  mainDbName: string;
  projectId: number;
  resourceId?: number;
  resourceName?: string;
}): Promise<{
  id: number;
  markdownPath: string | null;
  name: string;
} | null> {
  const db = databaseModule.getDatabase(params.mainDbName);
  if (!db) {
    return null;
  }

  if (typeof params.resourceId === "number") {
    const resource = VibeLearningResourceTable.getResourceById(db, params.resourceId);
    if (resource && resource.projectId === params.projectId) {
      return {
        id: resource.id,
        markdownPath: resource.markdownPath,
        name: resource.name,
      };
    }
  }

  if (params.resourceName) {
    return findResourceByName(params.mainDbName, params.projectId, params.resourceName);
  }

  return null;
}

export async function resolveReadableMarkdown(params: {
  mainDbName: string;
  projectId: number;
  resourceId?: number;
  resourceName?: string;
}): Promise<{
  resource: {
    id: number;
    markdownPath: string;
    name: string;
  };
  absolutePath: string;
}> {
  const resource = await resolveResource(params);
  const label = params.resourceId ?? params.resourceName ?? "unknown";

  if (!resource) {
    throw new Error(`未找到资源 "${label}"`);
  }

  if (!resource.markdownPath) {
    throw new Error(`资源 "${resource.name}" 尚未转换为 Markdown`);
  }

  const absolutePath = getAbsoluteMarkdownPath(resource.markdownPath);
  const exists = await checkMarkdownExists(resource.markdownPath);
  if (!exists) {
    throw new Error("Markdown 文件不存在，可能需要重新转换");
  }

  return {
    resource: {
      id: resource.id,
      markdownPath: resource.markdownPath,
      name: resource.name,
    },
    absolutePath,
  };
}

export async function readMarkdownContent(params: {
  projectId: number;
  resourceName: string;
  mainDbName: string;
}): Promise<{
  success: boolean;
  content?: string;
  totalLines?: number;
  resourceName?: string;
  error?: string;
}> {
  const { projectId, resourceName, mainDbName } = params;

  try {
    const { resource, absolutePath } = await resolveReadableMarkdown({
      mainDbName,
      projectId,
      resourceName,
    });

    const content = await fs.readFile(absolutePath, "utf-8");
    const lines = content.split("\n");
    const truncatedContent =
      content.length > MAX_RESOURCE_READ_CHARS
        ? content.slice(0, MAX_RESOURCE_READ_CHARS) +
          "\n\n... [内容已截断，请使用 read_resource_lines 或 read_resource_range 工具分段读取]"
        : content;

    return {
      success: true,
      content: truncatedContent,
      totalLines: lines.length,
      resourceName: resource.name,
    };
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error reading markdown: ${error}`);
    return {
      success: false,
      error: `读取失败: ${(error as Error).message}`,
    };
  }
}

export async function readMarkdownRange(params: {
  projectId: number;
  resourceName: string;
  mainDbName: string;
  startLine: number;
  endLine: number;
}): Promise<{
  success: boolean;
  content?: string;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  resourceName?: string;
  error?: string;
}> {
  const { projectId, resourceName, mainDbName, startLine, endLine } = params;
  return readResourceLines({
    mainDbName,
    projectId,
    resourceName,
    startLine,
    endLine,
  });
}

export async function readResourceLines(params: {
  projectId: number;
  resourceId?: number;
  resourceName?: string;
  mainDbName: string;
  startLine: number;
  endLine: number;
}): Promise<{
  success: boolean;
  content?: string;
  resourceId?: number;
  resourceName?: string;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  truncated?: boolean;
  error?: string;
}> {
  const { startLine, endLine } = params;

  try {
    const { resource, absolutePath } = await resolveReadableMarkdown({
      mainDbName: params.mainDbName,
      projectId: params.projectId,
      resourceId: params.resourceId,
      resourceName: params.resourceName,
    });
    const requestedStartLine = Math.max(1, Math.floor(startLine));
    const requestedEndLine = Math.max(requestedStartLine, Math.floor(endLine));
    const range = await readMarkdownLines(absolutePath, {
      startLine: requestedStartLine,
      endLine: requestedEndLine,
      maxChars: MAX_RESOURCE_READ_CHARS,
    });

    return {
      success: true,
      resourceId: resource.id,
      resourceName: resource.name,
      startLine: range.startLine,
      endLine: range.endLine,
      totalLines: range.totalLines,
      truncated: range.truncated,
      content: range.content,
    };
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error reading resource lines: ${error}`);
    return {
      success: false,
      error: `读取失败: ${(error as Error).message}`,
    };
  }
}

export async function readResourceRange(params: {
  projectId: number;
  resourceId?: number;
  resourceName?: string;
  mainDbName: string;
  startOffset: number;
  endOffset: number;
}): Promise<{
  success: boolean;
  content?: string;
  resourceId?: number;
  resourceName?: string;
  startOffset?: number;
  endOffset?: number;
  totalChars?: number;
  truncated?: boolean;
  error?: string;
}> {
  try {
    const { resource, absolutePath } = await resolveReadableMarkdown({
      mainDbName: params.mainDbName,
      projectId: params.projectId,
      resourceId: params.resourceId,
      resourceName: params.resourceName,
    });
    const content = await fs.readFile(absolutePath, "utf-8");
    const range = clampRange(params.startOffset, params.endOffset, content.length);

    return {
      success: true,
      resourceId: resource.id,
      resourceName: resource.name,
      startOffset: range.start,
      endOffset: range.end,
      totalChars: content.length,
      truncated: range.truncated,
      content: content.slice(range.start, range.end),
    };
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error reading resource range: ${error}`);
    return {
      success: false,
      error: `读取失败: ${(error as Error).message}`,
    };
  }
}

export async function readSearchHitContext(params: {
  projectId: number;
  resourceName: string;
  mainDbName: string;
  chunkIndex: number;
  radius?: number;
}): Promise<{
  success: boolean;
  resourceName?: string;
  chunkIndex?: number;
  startChunkIndex?: number;
  endChunkIndex?: number;
  chunkStartLine?: number;
  chunkEndLine?: number;
  startOffset?: number;
  endOffset?: number;
  content?: string;
  error?: string;
}> {
  const { projectId, resourceName, mainDbName, chunkIndex } = params;
  const radius = Math.min(MAX_HIT_CONTEXT_RADIUS, Math.max(1, Math.floor(params.radius || 1)));

  try {
    const { resource, absolutePath } = await resolveReadableMarkdown({
      mainDbName,
      projectId,
      resourceName,
    });
    const content = await fs.readFile(absolutePath, "utf-8");
    const chunks = smartChunkWithRanges(content, {
      minLength: 1000,
      maxLength: 2000,
      overlap: 0,
      splitter: "sentence",
    });
    const targetIndex = Math.min(Math.max(chunkIndex, 0), Math.max(0, chunks.length - 1));
    const startChunkIndex = Math.max(0, targetIndex - radius);
    const endChunkIndex = Math.min(chunks.length - 1, targetIndex + radius);
    const selected = chunks.slice(startChunkIndex, endChunkIndex + 1);

    return {
      success: true,
      resourceName: resource.name,
      chunkIndex,
      startChunkIndex,
      endChunkIndex,
      chunkStartLine: selected[0]?.startLine,
      chunkEndLine: selected[selected.length - 1]?.endLine,
      startOffset: selected[0]?.startOffset,
      endOffset: selected[selected.length - 1]?.endOffset,
      content: selected.map(chunk => chunk.text).join("\n\n---\n\n"),
    };
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error reading search hit context: ${error}`);
    return {
      success: false,
      error: `读取命中上下文失败: ${(error as Error).message}`,
    };
  }
}
