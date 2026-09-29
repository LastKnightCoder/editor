import { useEffect } from "react";

import useSettingStore from "@/stores/useSettingStore";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { closeArticleWindow } from "@/commands/article";

// 文章删除后关闭还开着的编辑器窗口（旧 Tab 清理已随 /legacy 退役）
const useArticleDeletedCleanup = () => {
  useEffect(() => {
    return defaultArticleEventBus.subscribe("article:deleted", data => {
      const databaseName = useSettingStore.getState().setting.database.active;
      closeArticleWindow(databaseName, data.article.id).catch(error => {
        console.error("关闭文章窗口失败", error);
      });
    });
  }, []);
};

export default useArticleDeletedCleanup;
