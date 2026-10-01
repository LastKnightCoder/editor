/**
 * 脉络入口：元信息行里的「N 处关联」，点开浮层（KL-015）。没有任何关联时不渲染。
 */

import { useState } from "react";
import { Waypoints } from "lucide-react";
import { Popover, cn, toast } from "@tau/ui";
import type { EntityRef } from "@/entity/ref";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import { contextCount } from "../model";
import { useEntityContext } from "../queries";
import { ContextPopoverContent } from "./ContextPopoverContent";

interface ContextBadgeProps {
  entity: EntityRef | null;
  className?: string;
}

export function ContextBadge({ entity, className }: ContextBadgeProps) {
  const { data: context } = useEntityContext(entity);
  const [open, setOpen] = useState(false);
  const count = contextCount(context);
  if (!context || count === 0) return null;

  const openRef = (ref: EntityRef) => {
    setOpen(false);
    openEntity(ref).catch(error =>
      toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };
  const openQuestion = (questionId: number) => {
    setOpen(false);
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
          context={context}
          onOpenEntity={openRef}
          onOpenQuestion={openQuestion}
        />
      </div>
    </Popover>
  );
}
