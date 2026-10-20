import { ChevronDown, Filter, Image, ScrollText, VenetianMask, X } from "lucide-react";
import { Button, FilterPill, IconButton, Loading, Menu, cn } from "@tau/ui";
import type { AppFeedbackFilter, AppFeedbackSummary } from "../../../../contracts";
import { formatRelative } from "../../components/format";
import { ErrorState } from "../../components/states";
import { KIND_LABELS, STATUSES, STATUS_LABELS, platformLabel } from "./labels";
import { useAppFeedbackList } from "./queries";

const KIND_FILTER_LABELS: Record<AppFeedbackFilter["kind"], string> = {
  all: "全部类型",
  ...KIND_LABELS,
};
const DOT_CLASSES: Record<AppFeedbackSummary["kind"], string> = {
  bug: "bg-danger",
  idea: "bg-info",
  other: "bg-ink-3",
};
const KIND_TEXT_CLASSES: Record<AppFeedbackSummary["kind"], string> = {
  bug: "text-danger",
  idea: "text-info",
  other: "text-ink-2",
};

function Row({
  item,
  active,
  onSelect,
}: {
  item: AppFeedbackSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active || undefined}
      className={cn(
        "rounded-tau-md ease-tau-out flex w-full gap-2.5 px-3 py-2.5 text-left transition-[background,box-shadow] duration-150",
        active ? "bg-surface shadow-card" : "hover:bg-hover"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[7px] size-[7px] shrink-0 rounded-full",
          item.status === "new" ? DOT_CLASSES[item.kind] : "bg-transparent"
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-tau-body text-ink-1 line-clamp-2 break-words">{item.message}</span>
        <span className="text-tau-micro text-ink-3 flex flex-wrap items-center gap-x-2">
          <span className={cn("font-medium", KIND_TEXT_CLASSES[item.kind])}>
            {KIND_LABELS[item.kind]}
          </span>
          {item.appVersion && (
            <span>
              {item.appVersion}
              {item.platform && ` · ${platformLabel(item.platform)}`}
            </span>
          )}
          <span>{formatRelative(item.createdAt)}</span>
          {item.imageCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Image size={12} />
              {item.imageCount}
            </span>
          )}
          {item.hasLogs && <ScrollText size={12} aria-label="附带日志" />}
        </span>
      </span>
    </button>
  );
}

export function FeedbackList({
  filter,
  onFilterChange,
  selectedId,
  onSelect,
}: {
  filter: AppFeedbackFilter;
  onFilterChange: (filter: AppFeedbackFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const list = useAppFeedbackList(filter);
  const counts = list.data?.pages[0]?.counts;
  const items = [
    ...new Map(
      list.data?.pages.flatMap(page => page.items).map(item => [item.id, item]) ?? []
    ).values(),
  ];
  return (
    <section className="border-line-1 flex w-[380px] shrink-0 flex-col gap-3 border-r pr-4">
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map(status => (
          <FilterPill
            key={status}
            active={filter.status === status}
            label={STATUS_LABELS[status]}
            count={counts?.[status]}
            onClick={() => onFilterChange({ ...filter, status })}
          />
        ))}
        <FilterPill
          active={filter.status === "all"}
          label="全部"
          onClick={() => onFilterChange({ ...filter, status: "all" })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Menu
          trigger={
            <Button size="sm" icon={Filter}>
              {KIND_FILTER_LABELS[filter.kind]}
              <ChevronDown size={13} className="text-ink-3" />
            </Button>
          }
        >
          <Menu.RadioGroup
            value={filter.kind}
            onValueChange={kind =>
              onFilterChange({ ...filter, kind: kind as AppFeedbackFilter["kind"] })
            }
          >
            {(Object.keys(KIND_FILTER_LABELS) as AppFeedbackFilter["kind"][]).map(kind => (
              <Menu.RadioItem key={kind} value={kind}>
                {KIND_FILTER_LABELS[kind]}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu>
        {filter.visitorId && (
          <span className="bg-accent-soft text-accent-text text-tau-sm inline-flex h-7 items-center gap-1.5 rounded-full pl-2.5 pr-1">
            <VenetianMask size={13} />
            只看 <span className="font-tau-mono">{filter.visitorId.slice(0, 10)}</span>
            <IconButton
              aria-label="清除身份筛选"
              className="size-5"
              onClick={() => onFilterChange({ ...filter, visitorId: "" })}
            >
              <X size={12} />
            </IconButton>
          </span>
        )}
      </div>
      {list.isPending ? (
        <Loading minHeight={200} />
      ) : list.isError && !list.data ? (
        <ErrorState
          icon={Filter}
          title="反馈读取失败"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : !items.length ? (
        <p className="text-tau-sm text-ink-3 py-12 text-center">没有匹配的反馈。</p>
      ) : (
        <div className="-mx-1 flex flex-col gap-0.5">
          {items.map(item => (
            <Row
              key={item.id}
              item={item}
              active={item.id === selectedId}
              onSelect={() => onSelect(item.id)}
            />
          ))}
          {list.hasNextPage && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 self-center"
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              加载更多
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
