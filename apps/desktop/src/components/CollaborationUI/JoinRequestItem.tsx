/** 加入申请行：头像 + 说明 + 同意 / 拒绝（紧凑态收为图标按钮） */

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button, IconButton, Tooltip, cn, toast } from "@tau/ui";
import type { JoinRequest } from "@tau/collaboration";
import { decideJoinRequest } from "@/commands";
import { Avatar } from "./Avatar";
import { daysLeft, errorText } from "./model";

export function JoinRequestItem({
  request,
  description,
  compact = false,
  className,
}: {
  request: JoinRequest;
  /** 第二行说明，默认「申请加入 · N 天内有效」 */
  description?: string;
  /** 紧凑：同意 / 拒绝收成图标按钮 */
  compact?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState<"approve" | "reject">();
  const decide = async (approve: boolean) => {
    setBusy(approve ? "approve" : "reject");
    try {
      await decideJoinRequest(request.id, approve);
      toast.success(
        approve ? `已同意 ${request.nickname} 加入` : `已拒绝 ${request.nickname} 的申请`
      );
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <div
      className={cn(
        "rounded-tau-md relative flex items-center gap-2.5 py-2 pl-3 pr-2",
        // 签条：左缘 accent 竖标（同 Notification 卡片语言）
        "before:bg-accent before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[3px] before:rounded-r-[3px] before:content-['']",
        className
      )}
    >
      <Avatar id={request.deviceId} name={request.nickname} size={26} className="ring-0" />
      <div className="min-w-0 flex-1">
        <div className="text-tau-body truncate font-[500]">{request.nickname}</div>
        <div className="text-ink-3 text-tau-sm truncate">
          {description ?? `申请加入 · ${daysLeft(request.expiresAt)} 天内有效`}
        </div>
      </div>
      {compact ? (
        <span className="flex flex-none gap-0.5">
          <Tooltip content="拒绝">
            <IconButton
              aria-label={`拒绝 ${request.nickname}`}
              disabled={busy !== undefined}
              className="enabled:hover:bg-danger-soft enabled:hover:text-danger size-7"
              onClick={() => void decide(false)}
            >
              <X className="size-[14px]" strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
          <Tooltip content="同意">
            <IconButton
              aria-label={`同意 ${request.nickname}`}
              disabled={busy !== undefined}
              className="text-ok enabled:hover:bg-ok-soft enabled:hover:text-ok size-7"
              onClick={() => void decide(true)}
            >
              <Check className="size-[14px]" strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
        </span>
      ) : (
        <span className="flex flex-none gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "reject"}
            disabled={busy === "approve"}
            onClick={() => void decide(false)}
          >
            拒绝
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={busy === "approve"}
            disabled={busy === "reject"}
            onClick={() => void decide(true)}
          >
            同意
          </Button>
        </span>
      )}
    </div>
  );
}
