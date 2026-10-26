/**
 * 侧栏「协作」入口的两件（A3 侧栏嵌套）：
 *  - CollaborationNavBadge：待审批加入申请数（离开协作页也看得到；收起为图标列时退化为角点）；
 *  - CollaborationNavSessions：在协作页时于入口下方展开共享内容子项（我发起的 / 我加入的，
 *    正文与白板同组），点击经页面参数切换当前内容——全局只剩一条侧栏，不再有页内会话目录。
 */

import { PenTool } from "lucide-react";
import { cn } from "@tau/ui";
import { sessionStatus, useStableSessionStatus } from "@tau/collaboration/src/view";
import type { CollaborationSession, SharedWhiteboardInfo } from "@tau/collaboration";
import useCollaborationStore from "@/stores/useCollaborationStore";
import { StatusDot } from "@/components/CollaborationUI";
import { pendingRequests } from "@/components/CollaborationUI/model";
import { groupShared, resolveShared } from "../model";

export function CollaborationNavBadge({ collapsed }: { collapsed: boolean }) {
  const count = useCollaborationStore(state => pendingRequests(state.requests).length);
  if (!count) return null;
  if (collapsed)
    return <i aria-hidden className="bg-accent absolute top-2 right-2.5 size-1.5 rounded-full" />;
  return (
    <span
      aria-label={`${count} 个待审批的加入申请`}
      className="bg-accent text-ink-inverse ml-auto min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] leading-[18px] font-[600] tabular-nums"
    >
      {count}
    </span>
  );
}

export function CollaborationNavSessions({
  selectedId,
  onSelect,
}: {
  /** 协作页当前的页面参数 id（缺省时与页面同规则落到第一份） */
  selectedId?: string;
  onSelect: (documentId: string) => void;
}) {
  const sessions = useCollaborationStore(state => state.sessions);
  const whiteboards = useCollaborationStore(state => state.whiteboards ?? EMPTY_BOARDS);
  const requests = useCollaborationStore(state => state.requests);
  const current = resolveShared(sessions, whiteboards, selectedId);
  return (
    <div className="mt-0.5 mb-1 space-y-px" role="group" aria-label="共享内容">
      {groupShared(sessions, whiteboards).map(group => (
        <div key={group.label}>
          {/* 缩进按父项字号（body）折算到父项文字列；flex 让子 span 不继承 body 行高 */}
          <div className="text-tau-body flex pt-1.5 pb-0.5 pl-[calc(1.06em+20px)]">
            <span className="text-tau-tiny text-ink-3">{group.label}</span>
          </div>
          {group.sessions.map(session => (
            <SessionItem
              key={session.id}
              session={session}
              active={session.id === current?.id}
              requests={pendingRequests(requests, session.id).length}
              onClick={() => onSelect(session.id)}
            />
          ))}
          {group.whiteboards.map(room => (
            <WhiteboardItem
              key={`${room.serverUrl}/${room.id}`}
              room={room}
              active={room.id === current?.id}
              requests={pendingRequests(requests, room.id).length}
              onClick={() => onSelect(room.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const EMPTY_BOARDS: SharedWhiteboardInfo[] = [];

/** 子项选中 = 当前内容：accent 淡底（父项此时降为「所在区」样式，不抢选中态） */
const childClass = (active: boolean) =>
  cn(
    "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color] duration-[160ms]",
    active ? "bg-selected text-ink-1 font-medium" : "text-ink-2 hover:bg-hover hover:text-ink-1"
  );

/** 白板与正文在同一组里列出；点开在协作页展示协作信息，编辑仍在白板页。 */
function WhiteboardItem({
  room,
  active,
  requests,
  onClick,
}: {
  room: SharedWhiteboardInfo;
  active: boolean;
  requests: number;
  onClick: () => void;
}) {
  const title = room.title || "未命名白板";
  return (
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={`${title} · 白板`}
        className={childClass(active)}
      >
        <PenTool className="text-ink-3 size-3 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {requests > 0 && (
          <span className="bg-accent text-ink-inverse min-w-4 shrink-0 rounded-full px-1 text-center text-[10.5px] leading-4 font-[600] tabular-nums">
            {requests}
          </span>
        )}
      </button>
    </div>
  );
}

function SessionItem({
  session,
  active,
  requests,
  onClick,
}: {
  session: CollaborationSession;
  active: boolean;
  requests: number;
  onClick: () => void;
}) {
  const status = useStableSessionStatus(session) ?? sessionStatus(session);
  const title = session.title || "未命名内容";
  return (
    // 让出父项图标列（按 body 字号折算）放在按钮外：高亮只盖状态点起的一段；
    // 状态点落在父项文字列、与分组标题对齐，标题再缩一级
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={`${title} · ${status.label}`}
        className={childClass(active)}
      >
        <StatusDot tone={status.tone} className="size-1.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {requests > 0 && (
          <span className="bg-accent text-ink-inverse min-w-4 shrink-0 rounded-full px-1 text-center text-[10.5px] leading-4 font-[600] tabular-nums">
            {requests}
          </span>
        )}
      </button>
    </div>
  );
}
