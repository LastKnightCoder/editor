/**
 * 脉络入口：元信息行里的「N 处关联」，点开浮层（KL-015）。没有任何关联时不渲染。
 * 调用方可经 leading 在浮层最前加入自己域的分区（如卡片的「连接」，KL-018），其数量计入总数。
 * 浮层打开时才取「相关」（KL-057，不计入总数）；传 onConnect 时卡片行可直接添加连接。
 */

import { useState, type ReactNode } from "react";
import { Waypoints } from "lucide-react";
import { Popover, cn, toast } from "@tau/ui";
import type { EntityRef } from "@/entity/ref";
import { openPage } from "@/services/page-navigation";
import type { ContextOpenTarget } from "@/types/entity-context";
import { contextCount } from "../model";
import { openContextTarget } from "../open";
import { useEntityContext, useEntityRelated } from "../queries";
import { ContextPopoverContent } from "./ContextPopoverContent";

export interface ContextLeading {
  count: number;
  /** close：分区内的导航操作先关闭浮层 */
  render: (close: () => void) => ReactNode;
}

interface ContextBadgeProps {
  entity: EntityRef | null;
  leading?: ContextLeading;
  /** 不显示也不计入「引用了」：调用方的前置分区已包含出链（卡片的「连接」） */
  hideOutlinks?: boolean;
  /** 与「相关」里的卡片建立连接；成功后该条从「相关」移除 */
  onConnect?: (ref: EntityRef) => Promise<void>;
  className?: string;
}

export function ContextBadge({
  entity,
  leading,
  hideOutlinks,
  onConnect,
  className,
}: ContextBadgeProps) {
  const { data: context } = useEntityContext(entity);
  const [open, setOpen] = useState(false);
  const relatedQuery = useEntityRelated(entity, open);
  const count = contextCount(context, { hideOutlinks }) + (leading?.count ?? 0);
  if (count === 0) return null;
  const close = () => setOpen(false);

  const openTarget = (target: ContextOpenTarget) => {
    close();
    openContextTarget(target).catch(error =>
      toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };
  const openRef = (ref: EntityRef) => openTarget({ page: "entity", ref });
  const connect = onConnect
    ? (ref: EntityRef) => {
        onConnect(ref)
          .then(() => relatedQuery.refetch())
          .catch(error => toast.error(error instanceof Error ? error.message : "添加连接失败"));
      }
    : undefined;
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
          hideOutlinks={hideOutlinks}
          onOpenEntity={openRef}
          onOpenQuestion={openQuestion}
          onOpenTarget={openTarget}
          related={relatedQuery.data}
          onConnect={connect}
        />
      </div>
    </Popover>
  );
}
