/**
 * 协作页里的共享白板：只展示协作信息（协作码、待审批、成员），画布在白板页里编辑和同步。
 * 「打开白板」首次打开时把房间落到当前资料库（已落库直接复用）；结束共享与退出协作在白板页的成员按钮里。
 */

import { useState } from "react";
import { ArrowRight, PenTool } from "lucide-react";
import { Button, FadeScroll, toast } from "@tau/ui";
import type { JoinRequest, SharedWhiteboardInfo } from "@tau/collaboration";
import { SharePanel } from "@/components/CollaborationUI";
import { openSharedWhiteboard } from "@/services/whiteboard-documents/open-shared";
import { remoteFailureText } from "../remoteErrors.i18n";
import { useSharingI18n } from "../sharing.i18n";
import { whiteboardSession } from "@/features/whiteboards/collaboration";

export function WhiteboardRoom({
  room,
  requests,
  deviceId,
}: {
  room: SharedWhiteboardInfo;
  requests: JoinRequest[];
  deviceId?: string;
}) {
  const { t } = useSharingI18n();
  const [opening, setOpening] = useState(false);
  const owner = room.members.find(member => member.role === "owner");
  const origin =
    room.role === "owner"
      ? t("board.mine")
      : owner
        ? t("board.owner", { nickname: owner.nickname })
        : t("board.others");
  const open = () => {
    setOpening(true);
    openSharedWhiteboard(room)
      .catch(error => toast.error(remoteFailureText(error)))
      .finally(() => setOpening(false));
  };
  return (
    <>
      <header className="flex h-[44px] flex-none items-center gap-2 pr-8 pl-8">
        <span className="text-ink-3 text-tau-sm flex min-w-0 items-center gap-1.5">
          <PenTool className="size-3.5 flex-none" strokeWidth={1.75} />
          <span className="truncate">{origin}</span>
        </span>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" loading={opening} onClick={open}>
          {t("board.open")}
          <ArrowRight className="size-3.5" strokeWidth={1.75} />
        </Button>
      </header>
      <FadeScroll className="mb-4 min-h-0 flex-1 pt-7 pr-[34px] pb-10 pl-10">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-tau-title-lg text-ink-1 font-[600] break-words">
              {room.title || t("board.untitled")}
            </h2>
            <p className="text-ink-2 text-tau-meta">
              {room.status === "active" ? t("board.activeHint") : t("board.closedHint")}
            </p>
          </div>
          <SharePanel session={whiteboardSession(room)} requests={requests} deviceId={deviceId} />
        </div>
      </FadeScroll>
    </>
  );
}
