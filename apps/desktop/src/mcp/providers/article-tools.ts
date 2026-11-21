import { patchScopedArticle } from "@/commands/article";
import { queryClient } from "@/queryClient";
import { bindDatabaseCommands } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { entityWriteTools } from "./document-write-tools";
import { createEntityMetadataTools } from "./entity-metadata-tools";
import type { MCPProviderDefinition } from "./types";

export const articleToolsProvider: MCPProviderDefinition = {
  id: "article-tools",
  name: "文章工具",
  description: "新建或删除文章，设置置顶状态和标签。",
  defaultEnabled: true,
  tools: () => [
    ...entityWriteTools("article"),
    ...createEntityMetadataTools("article", async (articleId, patch, context) => {
      const { databaseName } = context;
      const commands = bindDatabaseCommands({ patchScopedArticle }, context);
      const article = await commands.patchScopedArticle(databaseName, articleId, patch);
      const activeDatabase = useSettingStore.getState().setting.database.active;
      if (activeDatabase.replace(/\.db$/, "") === databaseName.replace(/\.db$/, "")) {
        queryClient.setQueryData(["articles", "detail", article.id], article);
        void queryClient.invalidateQueries({ queryKey: ["articles"] });
        defaultArticleEventBus.createEditor().publishArticleEvent("article:updated", article);
      }
      return article;
    }),
  ],
};
