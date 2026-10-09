/**
 * 脉络入口：元信息行里的「N 处关联」，点开浮层（KL-015）。没有任何关联时不渲染。
 * 浮层内建「连接」分区（显式连接 ∪ 内联引用，四种内容实体通用）；「相关」里的内容行
 * 可直接添加连接（KL-057，连接动作在脉络域内完成，调用方无需注入）。
 */

import { useState, type ReactNode } from "react";
import { Waypoints } from "lucide-react";
import { Popover, cn, toast } from "@tau/ui";
import type { EntityRef } from "@/entity/ref";
import { openPage } from "@/services/page-navigation";
import type { ContextOpenTarget } from "@/types/entity-context";
import { contextCount } from "../model";
import { openContextTarget } from "../open";
import { useAddContentLink, useEntityContext, useEntityRelated } from "../queries";
import { ContextPopoverContent } from "./ContextPopoverContent";

interface ContextBadgeProps {
  entity: EntityRef | null;
  className?: string;
  /** 浮层末尾宿主补充的一行（如文章的创作白板入口）；不计入关联数 */
  extra?: (close: () => void) => ReactNode;
}

export function ContextBadge({ entity, className, extra }: ContextBadgeProps) {
  const { data: context } = useEntityContext(entity);
  const [open, setOpen] = useState(false);
  const relatedQuery = useEntityRelated(entity, open);
  const addLink = useAddContentLink();
  /** 连接选择器弹窗期间锁定浮层：弹窗挂在 body，点击它会被判为浮层外点而误关 */
  const [linksDialogOpen, setLinksDialogOpen] = useState(false);
  const count = contextCount(context);
  if (count === 0) return null;
  const close = () => setOpen(false);

  const openTarget = (target: ContextOpenTarget) => {
    close();
    openContextTarget(target).catch(error =>
      toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };
  const openRef = (ref: EntityRef) => openTarget({ page: "entity", ref });
  const connect = (ref: EntityRef) => {
    if (!entity) return;
    addLink.mutate(
      { from: entity, to: ref },
      {
        onSuccess: () => void relatedQuery.refetch(),
        onError: error => toast.error(error instanceof Error ? error.message : "添加连接失败"),
      }
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
      locked={linksDialogOpen}
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
        {entity && (
          <ContextPopoverContent
            context={context ?? null}
            self={entity}
            onOpenEntity={openRef}
            onOpenQuestion={openQuestion}
            onOpenTarget={openTarget}
            related={relatedQuery.data}
            onConnect={connect}
            close={close}
            onDialogOpenChange={setLinksDialogOpen}
          />
        )}
        {extra?.(close)}
      </div>
    </Popover>
  );
}
