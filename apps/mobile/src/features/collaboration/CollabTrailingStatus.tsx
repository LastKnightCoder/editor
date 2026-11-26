// 「查看协作」菜单项的尾部状态：在线人数 / 离线标记。
// 数据来源依赖详情页原地挂载 CollaborativeEditor 已启动协作 runtime 的隐式耦合；
// runtime 未运行说明该假设被打破——直接抛错暴露，不做静默降级。
import { useCollaborationStore } from "./core/store";
import { useRoomI18n } from "./room.i18n";

export function CollabTrailingStatus({ documentId }: { documentId: string }) {
  const { t, locale } = useRoomI18n();
  const runtimeStatus = useCollaborationStore(state => state.status);
  const session = useCollaborationStore(state =>
    state.sessions.find(item => item.id === documentId)
  );

  if (runtimeStatus === "idle") {
    throw new Error(
      `CollabTrailingStatus: 协作 runtime 未运行（documentId: ${documentId}），详情页可能已不再挂载 CollaborativeEditor`
    );
  }
  // runtime 已启动但 session 尚未广播到位：正常的异步连接窗口，如实呈现
  if (!session) {
    return <span>{t("connection.starting")}</span>;
  }
  if (session.connection === "offline" || session.connection === "error") {
    return <span className="text-warn">{t("connection.offline")}</span>;
  }
  const onlineCount = session.members.filter(member => member.online).length;
  return (
    <span className="flex items-center gap-1">
      <span className="bg-ok h-1.5 w-1.5 rounded-full" />
      {t("connection.online", { count: onlineCount, amount: onlineCount.toLocaleString(locale) })}
    </span>
  );
}

export default CollabTrailingStatus;
