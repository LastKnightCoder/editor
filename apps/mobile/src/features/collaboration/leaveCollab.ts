// 退出/结束共享的文案与执行单源（设计稿 03/05）：owner 结束共享（清空云端数据），
// 成员仅移除自己。编辑页 / 成员 Sheet 共用，避免文案与流程漂移。
import { toast } from "../../components/toast";

export function leaveCollabText(isOwner: boolean) {
  return isOwner
    ? {
        title: "结束共享并清空云端数据？",
        description:
          "所有成员将立即失去访问权限，云端快照与附件会被清空；本地内容不受影响。",
        confirmText: "结束共享",
        successToast: "已结束共享",
        errorTitle: "结束共享失败",
      }
    : {
        title: "退出该协作？",
        description: "退出后需要重新申请才能再次加入；你在本机保留的内容不受影响。",
        confirmText: "退出协作",
        successToast: "已退出协作",
        errorTitle: "退出协作失败",
      };
}

/** 执行退出/结束共享：成功 toast，失败抛回调用方（由其呈现错误并保留重试能力）。 */
export async function runLeaveCollab(
  leave: (documentId: string) => Promise<void>,
  documentId: string,
  isOwner: boolean
) {
  await leave(documentId);
  toast.success(leaveCollabText(isOwner).successToast);
}
