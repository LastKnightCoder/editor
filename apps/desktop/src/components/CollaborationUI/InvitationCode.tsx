/** 作者侧协作码块：码 + 复制 + 有效期 + 轮换 */

import { useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { Button, IconButton, Tooltip, cn } from "@tau/ui";
import type { CollaborationSession } from "@tau/collaboration";
import { daysLeft, formatInvitationCode } from "./model";
import { useInvitation } from "./useInvitation";

export function InvitationCode({ session }: { session: CollaborationSession }) {
  const { data, loading: isPending, rotating, rotate, copy: copyCode } = useInvitation(session.id);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!(await copyCode())) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div>
      <div className="border-line-1 bg-surface rounded-tau-md flex h-[46px] items-center gap-2.5 border pl-3.5 pr-1.5">
        <code
          data-testid="collaboration-code"
          className={cn(
            "font-tau-mono flex-1 truncate text-[17px] font-[500] tabular-nums tracking-[0.08em]",
            data ? "text-ink-1" : "text-ink-3"
          )}
        >
          {data ? formatInvitationCode(data.code) : "————-————-————"}
        </code>
        {data ? (
          <Tooltip content={copied ? "已复制" : "复制协作码"}>
            <IconButton aria-label="复制协作码" onClick={() => void copy()}>
              {copied ? (
                <Check className="text-ok size-[15px]" strokeWidth={1.75} />
              ) : (
                <Copy className="size-[15px]" strokeWidth={1.75} />
              )}
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            size="sm"
            variant="soft"
            icon={KeyRound}
            loading={rotating}
            disabled={isPending}
            onClick={() => void rotate()}
          >
            生成协作码
          </Button>
        )}
      </div>
      <div className="text-ink-3 text-tau-sm mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          {data
            ? `${daysLeft(data.expiresAt)} 天后过期 · 对方在「加入协作」里输入`
            : "协作码 7 天有效，发给对方即可申请加入"}
        </span>
        {data && (
          <Tooltip content="旧码立即失效，已加入的成员不受影响">
            <button
              type="button"
              disabled={rotating}
              onClick={() => void rotate()}
              className="text-accent-text inline-flex flex-none cursor-pointer items-center gap-1 font-[500] hover:underline hover:underline-offset-[3px] disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", rotating && "animate-spin")} strokeWidth={1.75} />
              轮换
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
