import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import { Descendant } from "slate";
import { createNotionPage, appendNotionBlock } from "@/commands/notion";
import { createNotionSync, updateNotionSync } from "@/commands/notion-sync";
import { generateContentHash } from "@/utils/content-hash";
import { CreateProjectItem, EProjectItemType } from "@/types";
import { ModalKey } from "../constants/modalKeys";
import type { NotionSyncConfig } from "@/components/NotionSyncModal";

/**
 * Notion Sync 添加策略接口
 */
export interface NotionSyncAddStrategy {
  addProjectItem: (createItem: CreateProjectItem) => Promise<void>;
}

export interface UseNotionSyncHandlersOptions {
  closeModal: (key: ModalKey) => void;
  strategy: NotionSyncAddStrategy;
  getSetting: () => {
    integration: {
      notion: {
        token?: string;
        enabled: boolean;
      };
    };
  };
}

/**
 * Notion Sync 处理的共享 hook
 */
export const useNotionSyncHandlers = (
  options: UseNotionSyncHandlersOptions,
) => {
  const { closeModal, strategy, getSetting } = options;

  /**
   * 处理 Notion Sync 模态框提交
   */
  const handleNotionSyncModalOk = useMemoizedFn(
    async (config: NotionSyncConfig) => {
      const setting = getSetting();
      const token = setting.integration.notion.token;

      if (!token || !setting.integration.notion.enabled) {
        message.error("请先在设置中配置 Notion 集成");
        return;
      }

      try {
        let pageId = config.pageId;
        const pageTitle = config.pageTitle || "新文档";

        // 如果需要创建新页面
        if (config.createNew && config.parentId) {
          const result = await createNotionPage(
            token,
            config.parentId,
            pageTitle,
            [],
          );

          if (!result.success || !result.pageId) {
            message.error(result.error || "创建 Notion 页面失败");
            return;
          }

          pageId = result.pageId;
        }

        // 创建初始内容
        const initialContent: Descendant[] = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
        ];

        // 计算内容哈希
        const contentHash = generateContentHash(initialContent);

        // 创建 NotionSync 记录
        const notionSync = await createNotionSync({
          pageId,
          syncMode: config.syncMode,
          lastLocalContentHash: contentHash,
          pendingSync: false,
        });

        // 立即同步初始内容到 Notion，避免创建后检测到冲突
        try {
          if (config.syncMode === "json") {
            // JSON 模式：创建代码块
            const jsonContent = JSON.stringify(initialContent, null, 2);
            const result = await appendNotionBlock(token, pageId, {
              type: "code",
              code: {
                rich_text: [
                  {
                    type: "text",
                    text: { content: jsonContent },
                  },
                ],
                language: "JavaScript",
              },
            });

            // 如果创建成功，更新 codeBlockId
            if (result.success && result.blockId) {
              await updateNotionSync(notionSync.id, {
                codeBlockId: result.blockId,
              });
            }
          }
          // 双向模式下，空内容不需要同步
        } catch (syncError) {
          console.warn("初始同步失败，将在编辑时重试:", syncError);
        }

        // 创建 ProjectItem
        const createProjectItem: CreateProjectItem = {
          title: pageTitle,
          content: initialContent,
          children: [],
          refType: "notion-sync",
          refId: notionSync.id,
          projectItemType: EProjectItemType.Document,
          count: 0,
          whiteBoardContentId: 0,
        };

        await strategy.addProjectItem(createProjectItem);
        closeModal(ModalKey.NotionSync);
        message.success("Notion 文档创建成功！");
      } catch (error: unknown) {
        console.error("创建 Notion 文档失败:", error);
        message.error(error instanceof Error ? error.message : "创建失败");
      }
    },
  );

  return {
    handleNotionSyncModalOk,
  };
};
