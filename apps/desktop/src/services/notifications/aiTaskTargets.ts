import { useSettingsStore } from "@/app/settingsStore";
import { locateEntity } from "@/commands/entity";
import { getProjectItemByRef } from "@/commands/project";
import { normalizeEntityRefKind } from "@/entity/ref";
import { bindDatabaseCommands } from "@/services/command-context";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import { assertCurrentDatabase, currentDatabaseName } from "./aiNotify";
import { aiNotifyText } from "./ai.i18n";

export async function openChatTarget(
  chatScope: string,
  chatId: string,
  databaseName = currentDatabaseName()
): Promise<void> {
  assertCurrentDatabase(databaseName);
  useSettingsStore.getState().closeSettings();
  const [scope, ref] = chatScope.split(":");
  if (scope === "pdf-chat" && ref) {
    openPage("pdf-detail", { pdfId: Number(ref), chatId });
  } else if (scope === "vibe-learning-chat" && ref) {
    openPage("vibe-learning-detail", { id: Number(ref), chatId });
  } else if (scope === "video-note-chat" && ref) {
    const commands = bindDatabaseCommands({ getProjectItemByRef }, { databaseName });
    const items = await commands.getProjectItemByRef("video-note", Number(ref));
    assertCurrentDatabase(databaseName);
    const item = items.find(item => item.projects.length > 0);
    if (!item) throw new Error(aiNotifyText("error.targetUnavailable"));
    openPage("project-detail", { id: item.projects[0], itemId: item.id, chatId });
  } else {
    openPage("chat", chatId ? { id: chatId } : undefined);
  }
}

export async function openContentById(contentId: number, databaseName: string): Promise<void> {
  assertCurrentDatabase(databaseName);
  useSettingsStore.getState().closeSettings();
  const commands = bindDatabaseCommands({ locateEntity }, { databaseName });
  const location = await commands.locateEntity({ contentId });
  assertCurrentDatabase(databaseName);
  const kind = location && normalizeEntityRefKind(location.kind);
  if (!location || !kind) throw new Error(aiNotifyText("error.targetUnavailable"));
  await openEntity({ kind, id: location.id });
}
