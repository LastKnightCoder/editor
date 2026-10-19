/** 标题栏面包屑（摘自 CardDetailView 的 usePageBreadcrumb 注入） */
export function CardCrumb({ title, section = "卡片库" }: { title: string; section?: string }) {
  return (
    <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
      <span className="rounded-tau-sm px-1.5 py-0.5">{section}</span>
      <span className="text-ink-3">/</span>
      <span className="text-ink-1 flex min-w-0 items-center gap-1.5 font-medium">
        <span className="max-w-[44ch] truncate">{title}</span>
      </span>
    </span>
  );
}
