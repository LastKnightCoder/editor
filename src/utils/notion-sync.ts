/**
 * Notion 同步核心逻辑
 */

import { Descendant } from "slate";
import { NotionSync, ProjectItem } from "@/types";
import { generateContentHash } from "./content-hash";
import { slateToNotionBlocks, notionBlocksToSlate } from "./notion-converter";
import {
  getNotionPageBlocks,
  updateNotionPageBlocks,
  appendNotionBlock,
  updateNotionBlock,
} from "@/commands/notion";
import { updateNotionSync } from "@/commands/notion-sync";

// ==================== 类型定义 ====================

export interface ConflictCheckResult {
  hasConflict: boolean;
  useLocal?: boolean;
  localContent?: Descendant[];
  notionContent?: Descendant[];
}

export interface SyncResult {
  success: boolean;
  error?: string;
}

// ==================== 冲突检测 ====================

/**
 * 实时冲突检测
 *
 * 通过比较三个哈希值判断冲突：
 * 1. lastLocalContentHash: 上次同步时的本地内容哈希
 * 2. 当前本地内容哈希
 * 3. 实时获取的 Notion 内容哈希
 */
export async function checkConflict(
  token: string,
  projectItem: ProjectItem,
  notionSync: NotionSync,
): Promise<ConflictCheckResult> {
  try {
    // 1. 获取本地内容哈希
    const localHash = generateContentHash(projectItem.content);

    // 2. 实时从 Notion 获取内容
    const notionContent = await getNotionContent(token, notionSync);
    const notionHash = generateContentHash(notionContent);

    // 3. 比较哈希值
    if (notionSync.lastLocalContentHash === localHash) {
      // 本地未修改
      if (notionHash === notionSync.lastLocalContentHash) {
        // Notion 也未修改，无冲突
        return { hasConflict: false };
      } else {
        // Notion 有更新，可以安全使用 Notion 版本
        return { hasConflict: false, notionContent };
      }
    }

    if (notionHash === notionSync.lastLocalContentHash) {
      // Notion 未修改，可以安全使用本地版本
      return { hasConflict: false, useLocal: true };
    }

    // 两边都修改了，需要用户选择
    return {
      hasConflict: true,
      localContent: projectItem.content,
      notionContent,
    };
  } catch (error) {
    console.error("冲突检测失败:", error);
    // 出错时默认使用本地版本
    return { hasConflict: false, useLocal: true };
  }
}

// ==================== 同步到 Notion ====================

/**
 * 从 Notion 同步到本地
 */
export async function syncFromNotion(
  token: string,
  notionSync: NotionSync,
): Promise<{
  success: boolean;
  content?: Descendant[];
  error?: string;
}> {
  try {
    const content = await getNotionContent(token, notionSync);
    const newHash = generateContentHash(content);

    // 更新哈希值
    await updateNotionSync(notionSync.id, {
      lastLocalContentHash: newHash,
    });

    return { success: true, content };
  } catch (error: any) {
    console.error("从 Notion 同步失败:", error);
    return {
      success: false,
      error: error.message || "从 Notion 同步失败",
    };
  }
}

/**
 * 同步本地内容到 Notion
 */
export async function syncToNotion(
  token: string,
  projectItem: ProjectItem,
  notionSync: NotionSync,
): Promise<SyncResult> {
  try {
    if (notionSync.syncMode === "bidirectional") {
      // 双向编辑模式：转换为 Notion blocks 并更新
      const blocks = slateToNotionBlocks(projectItem.content);
      const result = await updateNotionPageBlocks(
        token,
        notionSync.pageId,
        blocks,
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || "更新 Notion 页面失败",
        };
      }
    } else {
      // JSON 模式：更新代码块
      const jsonContent = JSON.stringify(projectItem.content, null, 2);

      if (notionSync.codeBlockId) {
        // 更新现有代码块
        const result = await updateNotionBlock(token, notionSync.codeBlockId, {
          code: {
            rich_text: [
              {
                type: "text",
                text: { content: jsonContent },
              },
            ],
            language: "javascript",
          },
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || "更新代码块失败",
          };
        }
      } else {
        // 创建新代码块
        const result = await appendNotionBlock(token, notionSync.pageId, {
          type: "code",
          code: {
            rich_text: [
              {
                type: "text",
                text: { content: jsonContent },
              },
            ],
            language: "javascript",
          },
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || "创建代码块失败",
          };
        }

        // 更新 codeBlockId
        if (result.blockId) {
          await updateNotionSync(notionSync.id, {
            codeBlockId: result.blockId,
          });
        }
      }
    }

    // 更新本地哈希
    const newHash = generateContentHash(projectItem.content);
    await updateNotionSync(notionSync.id, {
      lastLocalContentHash: newHash,
      pendingSync: false,
      syncError: undefined,
      lastSyncAttempt: Date.now(),
    });

    return { success: true };
  } catch (error: any) {
    console.error("同步到 Notion 失败:", error);

    // 标记为待同步
    await updateNotionSync(notionSync.id, {
      pendingSync: true,
      syncError: error.message || "同步失败",
      lastSyncAttempt: Date.now(),
    });

    return {
      success: false,
      error: error.message || "同步失败",
    };
  }
}

// ==================== 从 Notion 获取 ====================

/**
 * 从 Notion 获取内容
 */
export async function getNotionContent(
  token: string,
  notionSync: NotionSync,
): Promise<Descendant[]> {
  try {
    if (notionSync.syncMode === "bidirectional") {
      // 双向编辑模式：获取并转换 blocks
      const result = await getNotionPageBlocks(token, notionSync.pageId);

      if (!result.success || !result.blocks) {
        throw new Error(result.error || "获取 Notion 内容失败");
      }

      return notionBlocksToSlate(result.blocks);
    } else {
      // JSON 模式：从代码块读取
      if (!notionSync.codeBlockId) {
        return [];
      }

      // 获取页面所有块，找到对应的代码块
      const result = await getNotionPageBlocks(token, notionSync.pageId);

      if (!result.success || !result.blocks) {
        throw new Error(result.error || "获取 Notion 内容失败");
      }

      // 查找代码块
      const codeBlock = result.blocks.find(
        (block: any) => block.id === notionSync.codeBlockId,
      );

      if (!codeBlock || codeBlock.type !== "code") {
        return [];
      }

      // 提取 JSON 内容
      const jsonText = codeBlock.code.rich_text
        .map((rt: any) => (rt.type === "text" ? rt.text.content : ""))
        .join("");

      try {
        return JSON.parse(jsonText);
      } catch (error) {
        console.error("解析 JSON 失败:", error);
        return [];
      }
    }
  } catch (error) {
    console.error("获取 Notion 内容失败:", error);
    throw error;
  }
}

// ==================== 离线同步支持 ====================

/**
 * 尝试同步所有待同步的项目
 * 用于网络恢复后的自动同步
 */
export async function syncPendingItems(
  token: string,
  getPendingSyncsFunc: () => Promise<NotionSync[]>,
  getProjectItemFunc: (refId: number) => Promise<ProjectItem | null>,
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  try {
    const pendingSyncs = await getPendingSyncsFunc();

    for (const notionSync of pendingSyncs) {
      // 需要通过 refId 找到对应的 ProjectItem
      // 这里假设有一个方法可以通过 notion-sync 的 id 找到对应的 ProjectItem
      // 实际实现时需要查询数据库
      const projectItem = await getProjectItemFunc(notionSync.id);

      if (!projectItem) {
        failed++;
        continue;
      }

      const result = await syncToNotion(token, projectItem, notionSync);

      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }
  } catch (error) {
    console.error("批量同步失败:", error);
  }

  return { success, failed };
}
