/** 成员列表：活动状态 + 作者标记 + 作者侧移除成员（统一确认） */

import { useState } from "react";
import { UserMinus } from "lucide-react";
import { ConfirmDialog, IconButton, Tooltip, cn, toast } from "@tau/ui";
import type { CollaborationSession, Member } from "@tau/collaboration";
import { removeCollaborationMember } from "@/commands";
import { Avatar } from "./Avatar";
import { errorText, memberActivity, memberActivityKey, sortMembers } from "./model";

export function MemberList({
  session,
  deviceId,
}: {
  session: CollaborationSession;
  deviceId?: string;
}) {
  const [removing, setRemoving] = useState<Member>();
  const manageable =
    session.role === "owner" &&
    session.status === "active" &&
    session.members.some(member => member.role !== "owner");
  return (
    <>
      <ul className="-mx-2 flex flex-col">
        {sortMembers(session.members).map(member => {
          const activity = memberActivityKey(member);
          return (
            <li
              key={member.deviceId}
              className="rounded-tau-sm hover:bg-hover group flex min-h-10 items-center gap-2.5 px-2"
            >
              <Avatar
                id={member.deviceId}
                name={member.nickname}
                activity={activity}
                size={24}
                className="ring-surface group-hover:ring-surface-hover"
              />
              <span className="text-tau-body min-w-0 truncate" title={member.deviceId}>
                {member.nickname}
                {member.deviceId === deviceId && <span className="text-ink-3">（我）</span>}
              </span>
              {member.role === "owner" && (
                <span className="bg-accent-soft text-accent-text rounded-[6px] px-1.5 text-[11.5px] leading-[18px]">
                  作者
                </span>
              )}
              <span
                className={cn(
                  "text-tau-sm ml-auto flex-none",
                  activity === "editing"
                    ? "text-ok"
                    : activity === "viewing"
                      ? "text-info"
                      : "text-ink-3"
                )}
              >
                {memberActivity(member)}
              </span>
              {manageable && (
                // 固定槽位原位淡入：悬停不改变行宽（作者行留空位对齐）；无可移除成员时不占位
                <span className="flex size-6 flex-none items-center justify-center">
                  {member.role !== "owner" && (
                    <Tooltip content={`移除 ${member.nickname}`}>
                      <IconButton
                        aria-label={`移除 ${member.nickname}`}
                        className="enabled:hover:bg-danger-soft enabled:hover:text-danger size-6 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() => setRemoving(member)}
                      >
                        <UserMinus className="size-[13px]" strokeWidth={1.75} />
                      </IconButton>
                    </Tooltip>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={open => !open && setRemoving(undefined)}
        danger
        title={`移除 ${removing?.nickname ?? ""}？`}
        description="该设备会立即断开并失去访问权限；它本机已保存的内容不受影响。"
        confirmText="移除"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeCollaborationMember(session.id, removing.deviceId);
            toast.success(`已移除 ${removing.nickname}`);
          } catch (error) {
            toast.error(errorText(error));
            throw error;
          }
        }}
      />
    </>
  );
}
