// 退出/结束共享的文案与执行单源：owner 结束共享（清空云端数据），
// 成员仅移除自己。编辑页 / 成员 Sheet 共用，避免文案与流程漂移。
import { toast } from "../../components/toast";
import { roomTranslator, type RoomLocale } from "./room.i18n";

export function leaveCollabText(isOwner: boolean, { t }: RoomLocale) {
  const kind = isOwner ? "owner" : "member";
  return {
    title: t(`leave.${kind}.title`),
    description: t(`leave.${kind}.description`),
    confirmText: t(`leave.${kind}.confirm`),
    successToast: t(`leave.${kind}.success`),
    errorTitle: t(`leave.${kind}.error`),
  };
}

/** 执行退出/结束共享：成功 toast，失败抛回调用方（由其呈现错误并保留重试能力）。 */
export async function runLeaveCollab(
  leave: (documentId: string) => Promise<void>,
  documentId: string,
  isOwner: boolean
) {
  await leave(documentId);
  toast.success(roomTranslator.t(isOwner ? "leave.owner.success" : "leave.member.success"));
}
