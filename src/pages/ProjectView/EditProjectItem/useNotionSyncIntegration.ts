import { useState, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { App } from "antd";
import { Descendant } from "slate";
import { ProjectItem, NotionSync } from "@/types";
import { getNotionSync, updateNotionSync } from "@/commands/notion-sync";
import { updateProjectItem } from "@/commands";
import {
  checkConflict,
  syncToNotion,
  syncFromNotion,
} from "@/utils/notion-sync";
import { useNotionSync } from "@/hooks";
import { generateContentHash } from "@/utils/content-hash";
import useSettingStore from "@/stores/useSettingStore";
import { openExternal } from "@/commands/extra";
import { updateNotionPageTitle } from "@/commands/notion";

export interface NotionSyncIntegrationResult {
  notionSync: NotionSync | null;
  isNotionDocument: boolean;
  syncStatus: "synced" | "syncing" | "error" | "pending";
  conflictModalOpen: boolean;
  localContent: Descendant[] | null;
  notionContent: Descendant[] | null;
  handleManualSync: () => Promise<void>;
  handleSyncFromNotion: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleOpenInNotion: () => void;
  handleUseLocalContent: () => Promise<void>;
  handleUseNotionContent: () => Promise<void>;
  handleCancelConflictModal: () => void;
  useNotionExtensions: boolean;
}

export function useNotionSyncIntegration(
  projectItem: ProjectItem | null,
  setProjectItem?: (item: ProjectItem) => void,
  setEditorValue?: (content: Descendant[]) => void,
): NotionSyncIntegrationResult {
  const { message } = App.useApp();
  const { setting } = useSettingStore((state) => ({ setting: state.setting }));
  const [notionSync, setNotionSync] = useState<NotionSync | null>(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [localContent, setLocalContent] = useState<Descendant[] | null>(null);
  const [notionContent, setNotionContent] = useState<Descendant[] | null>(null);
  const [conflictChecked, setConflictChecked] = useState(false);
  const prevTitleRef = useRef<string>("");

  const isNotionDocument =
    projectItem?.refType === "notion-sync" && !!projectItem?.refId;

  // 加载 NotionSync 配置
  useEffect(() => {
    if (!isNotionDocument || !projectItem) {
      setNotionSync(null);
      setConflictChecked(false);
      return;
    }

    getNotionSync(projectItem.refId)
      .then((sync) => {
        setNotionSync(sync);
      })
      .catch((error) => {
        console.error("加载 Notion 同步配置失败:", error);
        message.error("加载 Notion 同步配置失败");
      });
  }, [isNotionDocument, projectItem, message]);

  // 冲突检测
  useEffect(() => {
    if (!notionSync || !projectItem || conflictChecked) {
      return;
    }

    const token = setting.integration.notion.token;
    if (!token || !setting.integration.notion.enabled) {
      setConflictChecked(true);
      return;
    }

    // 执行冲突检测
    checkConflict(token, projectItem, notionSync)
      .then((result) => {
        if (result.hasConflict) {
          // 有冲突，显示模态框
          setLocalContent(result.localContent || null);
          setNotionContent(result.notionContent || null);
          setConflictModalOpen(true);
        } else if (result.notionContent) {
          // 没有冲突，但 Notion 有更新，使用 Notion 版本
          updateProjectItemContent(result.notionContent);
        }
        // 如果 useLocal 为 true 或无冲突且无更新，继续使用本地版本
        setConflictChecked(true);
      })
      .catch((error) => {
        console.error("冲突检测失败:", error);
        setConflictChecked(true);
      });
  }, [notionSync, projectItem, conflictChecked, setting]);

  // 同步标题到 Notion
  useEffect(() => {
    if (!notionSync || !projectItem || !conflictChecked) {
      return;
    }

    const token = setting.integration.notion.token;
    if (!token || !setting.integration.notion.enabled) {
      return;
    }

    const currentTitle = projectItem.title;

    // 初始化时记录标题
    if (!prevTitleRef.current) {
      prevTitleRef.current = currentTitle;
      return;
    }

    // 标题未改变，不需要同步
    if (prevTitleRef.current === currentTitle) {
      return;
    }

    // 标题已改变，同步到 Notion
    prevTitleRef.current = currentTitle;

    updateNotionPageTitle(token, notionSync.pageId, currentTitle)
      .then((result) => {
        if (result.success) {
          console.log("标题已同步到 Notion:", currentTitle);
        } else {
          console.error("同步标题到 Notion 失败:", result.error);
        }
      })
      .catch((error) => {
        console.error("同步标题到 Notion 失败:", error);
      });
  }, [notionSync, projectItem, conflictChecked, setting]);

  // 使用 useNotionSync Hook
  const { status, sync: manualSync } = useNotionSync({
    token: setting.integration.notion.token,
    projectItem,
    notionSync,
    enabled: isNotionDocument && !!notionSync && conflictChecked,
  });

  // 更新 ProjectItem 内容
  const updateProjectItemContent = useMemoizedFn(
    async (newContent: Descendant[]) => {
      if (!projectItem || !setProjectItem) return;

      // 更新本地 projectItem 状态
      const updatedItem = {
        ...projectItem,
        content: newContent,
      };
      setProjectItem(updatedItem);

      // 由于编辑器是非受控组件，需要通过 setEditorValue 更新
      if (setEditorValue) {
        setEditorValue(newContent);
      }

      if (notionSync) {
        // 更新哈希
        const newHash = generateContentHash(newContent);
        await updateNotionSync(notionSync.id, {
          lastLocalContentHash: newHash,
        });
      }
    },
  );

  // 手动同步到 Notion
  const handleManualSync = useMemoizedFn(async () => {
    await manualSync();
  });

  // 从 Notion 同步到本地
  const handleSyncFromNotion = useMemoizedFn(async () => {
    if (!notionSync || !setProjectItem) return;

    const token = setting.integration.notion.token;
    if (!token) {
      message.error("未配置 Notion Token");
      return;
    }

    try {
      const result = await syncFromNotion(token, notionSync);
      if (result.success && result.content) {
        await updateProjectItemContent(result.content);
        message.success("已从 Notion 同步");
      } else {
        message.error(result.error || "从 Notion 同步失败");
      }
    } catch (error) {
      console.error("从 Notion 同步失败:", error);
      message.error("从 Notion 同步失败");
    }
  });

  // 断开关联
  const handleDisconnect = useMemoizedFn(async () => {
    if (!notionSync || !projectItem || !setProjectItem) return;

    try {
      // 更新 ProjectItem 的 refType
      const updatedItem = await updateProjectItem({
        id: projectItem.id,
        title: projectItem.title,
        children: projectItem.children,
        refType: "",
        refId: 0,
        projectItemType: projectItem.projectItemType,
        contentId: projectItem.contentId,
        whiteBoardContentId: projectItem.whiteBoardContentId,
        parents: projectItem.parents,
        projects: projectItem.projects,
      });

      if (updatedItem) {
        setProjectItem(updatedItem);
        message.success("已断开 Notion 关联");
        setNotionSync(null);
      }
    } catch (error) {
      console.error("断开关联失败:", error);
      message.error("断开关联失败");
    }
  });

  // 在 Notion 中打开（使用外部浏览器）
  const handleOpenInNotion = useMemoizedFn(() => {
    if (!notionSync) return;
    const url = `https://www.notion.so/${notionSync.pageId.replace(/-/g, "")}`;
    openExternal(url);
  });

  // 使用本地版本
  const handleUseLocalContent = useMemoizedFn(async () => {
    if (!projectItem || !notionSync) return;

    const token = setting.integration.notion.token;
    if (!token) {
      message.error("未配置 Notion Token");
      return;
    }

    try {
      // 同步到 Notion
      await syncToNotion(token, projectItem, notionSync);
      message.success("已使用本地版本并同步到 Notion");
      setConflictModalOpen(false);
    } catch (error) {
      console.error("同步失败:", error);
      message.error("同步失败");
    }
  });

  // 使用 Notion 版本
  const handleUseNotionContent = useMemoizedFn(async () => {
    if (!notionContent) return;

    await updateProjectItemContent(notionContent);
    message.success("已使用 Notion 版本");
    setConflictModalOpen(false);
  });

  // 取消冲突模态框
  const handleCancelConflictModal = useMemoizedFn(() => {
    setConflictModalOpen(false);
  });

  // 是否使用 Notion 兼容扩展
  const useNotionExtensions = notionSync?.syncMode === "bidirectional";

  return {
    notionSync,
    isNotionDocument,
    syncStatus: status,
    conflictModalOpen,
    localContent,
    notionContent,
    handleManualSync,
    handleSyncFromNotion,
    handleDisconnect,
    handleOpenInNotion,
    handleUseLocalContent,
    handleUseNotionContent,
    handleCancelConflictModal,
    useNotionExtensions,
  };
}
