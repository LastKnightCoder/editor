import { patchScopedCard } from "@/commands/card";
import { mergeCardIntoCache } from "@/features/cards/cache";
import { queryClient } from "@/queryClient";
import { bindDatabaseCommands } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { createEntityMetadataTools } from "./entity-metadata-tools";
import type { MCPProviderDefinition } from "./types";

export const cardToolsProvider: MCPProviderDefinition = {
  id: "card-tools",
  name: "卡片工具",
  description: "设置或取消卡片置顶，修改卡片标签。",
  defaultEnabled: true,
  tools: () =>
    createEntityMetadataTools("card", async (cardId, patch, context) => {
      const { databaseName } = context;
      const commands = bindDatabaseCommands({ patchScopedCard }, context);
      const originalActiveDatabase = useSettingStore.getState().setting.database.active;
      const cacheDatabase =
        originalActiveDatabase.replace(/\.db$/, "") === databaseName.replace(/\.db$/, "")
          ? originalActiveDatabase
          : databaseName;
      const card = await commands.patchScopedCard(databaseName, cardId, patch);
      const activeDatabase = useSettingStore.getState().setting.database.active;
      const isActive = activeDatabase.replace(/\.db$/, "") === databaseName.replace(/\.db$/, "");
      mergeCardIntoCache(queryClient, cacheDatabase, card, "upsert");
      if (isActive) {
        defaultCardEventBus.createEditor().publishCardEvent("card:updated", card);
      }
      return card;
    }),
};
