/** 结束共享 / 退出协作 / 清理本地记录的确认对话框（意图文案由 model.leaveIntent 判定） */

import { ConfirmDialog, toast } from "@tau/ui";
import type { CollaborationSession } from "@tau/collaboration";
import { discardLocalCollaboration, leaveCollaboration } from "@/commands";
import { leaveIntent } from "./model";
import { useRoomI18n, roomErrorText } from "./room.i18n";

export function LeaveDialog({
  session,
  open,
  onOpenChange,
  onLeft,
}: {
  session: CollaborationSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft?: () => void;
}) {
  const { t } = useRoomI18n();
  const intent = leaveIntent(session);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      danger
      title={t(`leave.${intent.kind}.title`)}
      context={session.title || t("untitled.content")}
      description={t(`leave.${intent.kind}.description`)}
      confirmText={t(`leave.${intent.kind}.confirm`)}
      loadingText={t("leave.processing")}
      confirmDisabled={intent.blocked}
      onConfirm={async () => {
        try {
          if (intent.action === "discard") await discardLocalCollaboration(session.id);
          else await leaveCollaboration(session.id, session.pending);
          onLeft?.();
        } catch (error) {
          toast.error(roomErrorText(error));
          throw error;
        }
      }}
    />
  );
}
