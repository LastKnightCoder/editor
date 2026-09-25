/**
 * 侧栏「协作」入口的两件（A3 侧栏嵌套）：
 *  - CollaborationNavBadge：待审批加入申请数（离开协作页也看得到；收起为图标列时退化为角点）；
 *  - CollaborationNavSessions：在协作页时于入口下方展开共享内容子项（我发起的 / 我加入的），
 *    点击经页面参数切换当前内容——全局只剩一条侧栏，不再有页内会话目录。
 */

import { cn } from "@tau/ui";
import { sessionStatus, useStableSessionStatus } from "@tau/collaboration/src/view";
import type { CollaborationSession } from "@tau/collaboration";
import useCollaborationStore from "@/stores/useCollaborationStore";
import { StatusDot } from "@/components/CollaborationUI";
import { pendingRequests } from "@/components/CollaborationUI/model";
import { groupSessions, resolveSelected } from "../model";

export function CollaborationNavBadge({ collapsed }: { collapsed: boolean }) {
  const count = useCollaborationStore(state => pendingRequests(state.requests).length);
  if (!count) return null;
  if (collapsed)
    return <i aria-hidden className="bg-accent absolute right-2.5 top-2 size-1.5 rounded-full" />;
  return (
    <span
      aria-label={`${count} 个待审批的加入申请`}
      className="bg-accent text-ink-inverse ml-auto min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] font-[600] tabular-nums leading-[18px]"
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
  const requests = useCollaborationStore(state => state.requests);
  const current = resolveSelected(sessions, selectedId);
  return (
    <div className="mb-1 mt-0.5 space-y-px" role="group" aria-label="共享内容">
      {groupSessions(sessions).map(group => (
        <div key={group.label}>
          {/* 缩进按父项字号（body）折算到父项文字列；flex 让子 span 不继承 body 行高 */}
          <div className="text-tau-body flex pb-0.5 pl-[calc(1.06em+20px)] pt-1.5">
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
        </div>
      ))}
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
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color] duration-[160ms]",
          // 子项选中 = 当前内容：accent 淡底（父项此时降为「所在区」样式，不抢选中态）
          active
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1"
        )}
      >
        <StatusDot tone={status.tone} className="size-1.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {requests > 0 && (
          <span className="bg-accent text-ink-inverse min-w-4 shrink-0 rounded-full px-1 text-center text-[10.5px] font-[600] tabular-nums leading-4">
            {requests}
          </span>
        )}
      </button>
    </div>
  );
}
