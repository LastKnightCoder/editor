import { basename } from "node:path";
import log from "electron-log";
import databaseModule from "../database";
import ContentTable from "../tables/content";
import { type MaterialSourceMeta, type NoteSourceMeta } from "@/types/vibe-learning";
import { onlineVideoRef } from "@/types/online-video";
import { getMarkdownText } from "../../services/content-conversion";
import { buildMaterialResourceMarkdown } from "../vl-material-resource";
import { ensureOnlineVideo, getOnlineVideoCacheStatus } from "../online-video-cache";
import type { VibeLearningIndexQueue } from "./index";

export async function processMaterialResource(
  manager: VibeLearningIndexQueue,
  resourceId: number,
  sourceMetaInfo: string,
  mainDbName: string
): Promise<string> {
  let meta: MaterialSourceMeta;
  try {
    meta = JSON.parse(sourceMetaInfo) as MaterialSourceMeta;
  } catch {
    throw new Error("无效的材料资源元信息");
  }
  manager.processingStatus.set(resourceId, "converting");
  manager.emit("status-change", resourceId, "converting");
  const db = databaseModule.getDatabase(mainDbName);
  if (!db) throw new Error("数据库连接不存在");
  const markdown = await buildMaterialResourceMarkdown(db, meta);
  if (!markdown) throw new Error("材料都已不存在");
  return markdown;
}

export async function processNoteResource(
  manager: VibeLearningIndexQueue,
  resourceId: number,
  sourceMetaInfo: string,
  mainDbName: string
): Promise<string> {
  // 解析来源元信息
  let meta: NoteSourceMeta;
  try {
    meta = JSON.parse(sourceMetaInfo) as NoteSourceMeta;
  } catch (e) {
    throw new Error("无效的笔记资源元信息");
  }

  const { contentId, title, type } = meta;
  log.info(
    `[VibeLearningIndexQueue] Processing note resource: contentId=${contentId}, type=${type}, title=${title}`
  );

  manager.processingStatus.set(resourceId, "converting");
  manager.emit("status-change", resourceId, "converting");

  // 从数据库获取内容
  const db = databaseModule.getDatabase(mainDbName);
  if (!db) {
    throw new Error("数据库连接不存在");
  }

  const content = ContentTable.getContentById(db, contentId);
  if (!content) {
    throw new Error(`未找到内容 ID: ${contentId}`);
  }

  // 将 Slate 内容转换为 Markdown
  const markdown = await getMarkdownText(content.content);

  if (!markdown || markdown.trim().length === 0) {
    throw new Error("笔记内容为空");
  }

  log.info(
    `[VibeLearningIndexQueue] Note resource processed successfully: resourceId=${resourceId}, contentLength=${markdown.length}`
  );

  return markdown;
}

/**
 * 处理在线视频：经提供方插件取源并缓存到本地，然后走统一媒体处理管线
 */
export async function processOnlineVideo(
  manager: VibeLearningIndexQueue,
  resourceId: number,
  providerId: string,
  sourceMetaInfo: string,
  resourceName: string,
  mainDbName: string,
  pageUrl?: string
): Promise<string> {
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(sourceMetaInfo) as Record<string, unknown>;
  } catch {
    throw new Error("无效的在线视频元信息");
  }
  const title = typeof meta.title === "string" && meta.title ? meta.title : resourceName;
  const target = { providerId, ref: onlineVideoRef(meta), title };
  log.info(`[VibeLearningIndexQueue] Processing online video: ${providerId}`);
  const cached = await getOnlineVideoCacheStatus(target);
  if (!cached) {
    manager.processingStatus.set(resourceId, "downloading");
    manager.emit("status-change", resourceId, "downloading");
  }
  const { localPath } = cached ?? (await ensureOnlineVideo(target));
  log.info(`[VibeLearningIndexQueue] Online video ready: ${localPath}`);
  return manager.processMediaResource(
    localPath,
    resourceId,
    title,
    mainDbName,
    `online:${providerId}:${basename(localPath)}`,
    pageUrl
  );
}
