/**
 * 脉络入口：元信息行里的「N 处关联」，点开浮层（KL-015）。没有任何关联时不渲染。
 * 调用方可经 leading 在浮层最前加入自己域的分区（如卡片的「连接」，KL-018），其数量计入总数。
 */

import { useState, type ReactNode } from "react";
import { Waypoints } from "lucide-react";
import { Popover, cn, toast } from "@tau/ui";
import type { EntityRef } from "@/entity/ref";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import { contextCount } from "../model";
import { useEntityContext } from "../queries";
import { ContextPopoverContent } from "./ContextPopoverContent";

export interface ContextLeading {
  count: number;
  /** close：分区内的导航操作先关闭浮层 */
  render: (close: () => void) => ReactNode;
}

interface ContextBadgeProps {
  entity: EntityRef | null;
  leading?: ContextLeading;
  className?: string;
}

export function ContextBadge({ entity, leading, className }: ContextBadgeProps) {
  const { data: context } = useEntityContext(entity);
  const [open, setOpen] = useState(false);
  const count = contextCount(context) + (leading?.count ?? 0);
  if (count === 0) return null;
  const close = () => setOpen(false);

  const openRef = (ref: EntityRef) => {
    close();
    openEntity(ref).catch(error =>
      toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };
  const openQuestion = (questionId: number) => {
    close();
    openPage("questions", { selectedId: questionId });
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      arrow={false}
      className="w-[380px]"
      trigger={
        <button
          type="button"
          title="查看与其他内容的关联"
          className={cn(
            "text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2 tabular-nums transition-colors",
            open && "bg-hover text-ink-1",
            className
          )}
        >
          <Waypoints className="size-[13px]" strokeWidth={1.75} />
          {count} 处关联
        </button>
      }
    >
      <div className="max-h-[460px] overflow-y-auto">
        <ContextPopoverContent
          context={context ?? null}
          leading={leading && leading.count > 0 ? leading.render(close) : undefined}
          onOpenEntity={openRef}
          onOpenQuestion={openQuestion}
        />
      </div>
    </Popover>
  );
}
