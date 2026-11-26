/** 作者侧协作码块：码 + 复制 + 有效期 + 轮换 */

import { useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { Button, IconButton, Tooltip, cn } from "@tau/ui";
import type { CollaborationSession } from "@tau/collaboration";
import { daysLeft, formatInvitationCode } from "./model";
import { useInvitation } from "./useInvitation";
import { useRoomI18n } from "./room.i18n";

export function InvitationCode({ session }: { session: CollaborationSession }) {
  const { t, locale } = useRoomI18n();
  const { data, loading: isPending, rotating, rotate, copy: copyCode } = useInvitation(session.id);
  const [copied, setCopied] = useState(false);
  const days = data ? daysLeft(data.expiresAt) : undefined;
  const copy = async () => {
    if (!(await copyCode())) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div>
      <div className="border-line-1 bg-surface rounded-tau-md flex h-[46px] items-center gap-2.5 border pr-1.5 pl-3.5">
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
          <Tooltip content={copied ? t("invitation.copied") : t("invitation.copy")}>
            <IconButton aria-label={t("invitation.copy")} onClick={() => void copy()}>
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
            {t("invitation.generate")}
          </Button>
        )}
      </div>
      <div className="text-ink-3 text-tau-sm mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          {data
            ? t("invitation.expires", {
                count: days ?? 0,
                amount: (days ?? 0).toLocaleString(locale),
              })
            : t("invitation.hint")}
        </span>
        {data && (
          <Tooltip content={t("invitation.rotateHint")}>
            <button
              type="button"
              disabled={rotating}
              onClick={() => void rotate()}
              className="text-accent-text inline-flex flex-none cursor-pointer items-center gap-1 font-[500] hover:underline hover:underline-offset-[3px] disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", rotating && "animate-spin")} strokeWidth={1.75} />
              {t("invitation.rotate")}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
