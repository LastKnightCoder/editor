import { useState } from "react";
import { BellRing } from "lucide-react";
import { FadeScroll, Popover, Spinner } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import { SubagentInteractions } from "./SubagentInteractions";
import { SubagentAvatar } from "./parts";
import { needsUser } from "./model";
import { useSubagentItems } from "./useSubagentItems";

/**
 * 标题栏：本窗口子 Agent 的待处理项（任何页面都能就地作答）；
 * 不在对话里时（showRunning）额外提示进行中的数量。
 */
export function SubagentAttention({ showRunning }: { showRunning: boolean }) {
  const { items } = useSubagentItems();
  const isDark = useThemeStore(state => state.mode === "dark");
  const [open, setOpen] = useState(false);
  const pending = items.filter(item => needsUser(item.status) && item.interactions);
  const running = items.filter(item => item.status === "running").length;
  return (
    <div className="flex items-center gap-1.5">
      {showRunning && running > 0 && (
        <span className="text-tau-meta text-ink-2 flex h-[30px] items-center gap-[7px] px-2.5">
          <Spinner className="size-3 border-[1.5px]" />
          <span className="tabular-nums">{running}</span> 个子任务进行中
        </span>
      )}
      {pending.length > 0 && (
        <Popover
          open={open}
          onOpenChange={setOpen}
          placement="bottom-end"
          arrow={false}
          className="flex max-h-[min(640px,calc(100vh-80px))] w-[min(420px,calc(100vw-32px))] max-w-none flex-col p-1.5"
          trigger={
            <button
              type="button"
              className="bg-warn-soft text-warn text-tau-meta flex h-[30px] items-center gap-[7px] rounded-full pr-[11px] pl-[9px] font-medium"
            >
              <BellRing size={15} strokeWidth={1.75} />
              待你处理
              <span className="bg-warn text-ink-inverse text-tau-tiny grid h-[18px] min-w-[18px] place-items-center rounded-full px-[5px] tabular-nums">
                {pending.length}
              </span>
            </button>
          }
        >
          <div className="text-tau-sm text-ink-3 px-2.5 pt-2 pb-1.5">
            {pending.length} 项等你处理
          </div>
          <FadeScroll className="flex min-h-0 flex-col border-r-[3px]">
            {pending.map(item => (
              <div
                key={item.view.agent.agentId}
                className="border-line-2 flex flex-col gap-2 border-t p-2.5 first-of-type:border-t-0"
              >
                <div className="text-tau-sm text-ink-2 flex items-center gap-2">
                  <SubagentAvatar view={item.view} size="xs" />
                  <b className="text-ink-1 min-w-0 truncate font-medium">{item.view.agent.title}</b>
                </div>
                {item.interactions && (
                  <SubagentInteractions snapshot={item.interactions} isDark={isDark} />
                )}
              </div>
            ))}
          </FadeScroll>
        </Popover>
      )}
    </div>
  );
}
