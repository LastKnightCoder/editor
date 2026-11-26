import { searchTranslator } from "./i18n";
import type { Navigator } from "@/page/PageProvider";
import type { CatalogSearchResult, DocumentTaskSearchResult } from "@/types/search";
import { openEntity } from "@/services/open-content";
import { getChatDatabase } from "@/services/chatDatabase";

export async function openSearchResult(
  result: CatalogSearchResult | DocumentTaskSearchResult,
  navigator: Pick<Navigator, "push">
) {
  switch (result.type) {
    case "document-task":
      return openEntity(result.sourceRef, { at: { taskId: result.taskId } });
    case "todo":
      return navigator.push("todos", { id: "", selectedId: result.id });
    case "calendar-event":
      return navigator.push("schedule", { eventId: result.id });
    case "project":
      return navigator.push("project-detail", { id: result.id });
    case "whiteboard":
      return navigator.push("whiteboard-detail", { id: result.id });
    case "notebook":
      return navigator.push("vibe-learning-detail", { id: result.id });
    case "pdf":
      return navigator.push("pdf-detail", { pdfId: result.id });
    case "database":
      return navigator.push("database-detail", { id: result.id });
    case "flashcard":
      return navigator.push("review", { cardId: result.id });
    case "chat-session": {
      if (!result.sessionId) throw new Error(searchTranslator.t("open.chatMissing"));
      const database = getChatDatabase();
      const { default: useChatSessionStore } = await import("@/stores/useChatSessionStore");
      if (getChatDatabase() !== database)
        throw new Error(searchTranslator.t("open.databaseChanged"));
      if (!result.chatScope) throw new Error(searchTranslator.t("open.chatFailed"));
      const bucket = {
        scope: result.chatScope,
        domainRef: result.domainId == null ? null : String(result.domainId),
      };
      await useChatSessionStore.getState().loadBucket(bucket);
      if (getChatDatabase() !== database)
        throw new Error(searchTranslator.t("open.databaseChanged"));
      const chat = await useChatSessionStore.getState().openChat(result.sessionId);
      if (getChatDatabase() !== database)
        throw new Error(searchTranslator.t("open.databaseChanged"));
      if (!chat) throw new Error(searchTranslator.t("open.chatMissing"));
      useChatSessionStore.getState().setCurrent(bucket, result.sessionId);
      if (result.chatScope === "main-chat") return navigator.push("chat", { id: result.sessionId });
      if (result.domainId == null) throw new Error(searchTranslator.t("open.domainMissing"));
      if (result.chatScope === "pdf-chat")
        return navigator.push("pdf-detail", { pdfId: result.domainId, chatId: result.sessionId });
      if (result.chatScope === "vibe-learning-chat")
        return navigator.push("vibe-learning-detail", {
          id: result.domainId,
          chatId: result.sessionId,
        });
      throw new Error(searchTranslator.t("open.chatFailed"));
    }
  }
}
