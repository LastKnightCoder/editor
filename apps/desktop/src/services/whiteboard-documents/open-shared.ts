import type { SharedWhiteboardInfo } from "@tau/collaboration";
import { installSharedWhiteboard } from "@/commands/whiteboard-document";
import { queryClient } from "@/queryClient";
import { openPage } from "@/services/page-navigation";
import useSettingStore from "@/stores/useSettingStore";

/** 已加入的共享白板首次打开时落到当前资料库（已落库直接复用），随后在白板页里编辑和同步。 */
export async function openSharedWhiteboard(room: SharedWhiteboardInfo): Promise<void> {
  const databaseName = useSettingStore.getState().setting.database.active;
  const installed = await installSharedWhiteboard(databaseName, room.serverUrl, room.id);
  await queryClient.invalidateQueries({ queryKey: ["whiteboards", "list"] });
  if (installed.boardId !== null) openPage("whiteboard-detail", { id: installed.boardId });
  else openPage("whiteboard-content", { id: installed.contentIds[0] });
}
