import { useEffect } from "react";

import useTabStore from "@/stores/useTabStore";
import useSettingStore from "@/stores/useSettingStore";
import { TabType, TabParams } from "@/types/tab";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { closeArticleWindow } from "@/commands/article";

// 文章删除后统一清理：关闭所有打开该文章的详情 Tab 与独立窗口
const useArticleDeletedCleanup = () => {
  useEffect(() => {
    return defaultArticleEventBus.subscribe("article:deleted", (data) => {
      const { panes, closeTab } = useTabStore.getState();
      panes.forEach((pane) => {
        pane.tabs.forEach((tab) => {
          if (tab.type !== TabType.ArticleDetail) {
            return;
          }
          const params = tab.params as
            | TabParams[TabType.ArticleDetail]
            | undefined;
          if (params?.id === data.article.id) {
            closeTab(pane.id, tab.id);
          }
        });
      });

      const databaseName = useSettingStore.getState().setting.database.active;
      closeArticleWindow(databaseName, data.article.id).catch((error) => {
        console.error("关闭文章窗口失败", error);
      });
    });
  }, []);
};

export default useArticleDeletedCleanup;
