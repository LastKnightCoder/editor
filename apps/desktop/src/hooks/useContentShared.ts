import useSettingStore from "@/stores/useSettingStore";
import useCollaborationStore from "@/stores/useCollaborationStore";
import useContentSessionStore, { contentSessionKey } from "@/stores/useContentSessionStore";

/**
 * 内容是否已共享（供「更多」菜单切换「发起协作 / 协作成员」文案；只读 store，不触发会话加载）。
 * 内容会话只在编辑器打开后才有记录；列表行等未打开处按协作会话的来源绑定兜底。
 */
export default function useContentShared(contentId?: number) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const opened = useContentSessionStore(
    state => state.entries[contentSessionKey(databaseName, contentId || 0)]?.mode === "shared"
  );
  const bound = useCollaborationStore(state =>
    state.sessions.some(
      session =>
        session.status === "active" &&
        session.source?.databaseName === databaseName &&
        session.source.contentId === contentId
    )
  );
  return Boolean(contentId) && (opened || bound);
}
