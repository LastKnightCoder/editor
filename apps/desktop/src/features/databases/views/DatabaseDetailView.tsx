/**
 * 数据库详情视图（原 features/projects/components/ProjectView/DataTableProjectView）：
 * 薄壳，装载共享的 DatabaseWorkspace 骨架，标题行右侧带同模块的切换下拉。
 */

import { memo, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { useState } from "react";
import { Menu, cn, Loading } from "@tau/ui";
import { usePage, usePageParams, usePageBreadcrumb } from "@/page/PageProvider";
import DatabaseWorkspace from "@/features/shared/database/DatabaseWorkspace";
import {
  useDatabaseDetail,
  useDatabasesSnapshot,
  useDatabaseMutations,
  useRecordDatabaseOpen,
} from "../queries";

const DatabaseDetailView = memo(() => {
  const { id } = usePageParams<{ id: number }>();
  const { navigator } = usePage();
  const { item, loading } = useDatabaseDetail(id);
  useRecordDatabaseOpen(id, !!item);
  const { items } = useDatabasesSnapshot();
  const mutations = useDatabaseMutations();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  /* 标题输入是非受控的 EditText，编辑期间只暂存草稿，提交时才落库 */
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const breadcrumbNode = useMemo(
    () => (
      <span className="text-tau-meta text-ink-2 min-w-0 truncate px-1.5 py-0.5">
        {item?.title || `数据库 #${id}`}
      </span>
    ),
    [item?.title, id]
  );
  usePageBreadcrumb("database-detail", breadcrumbNode);

  const onTitleCommit = useMemoizedFn(async () => {
    if (!item || titleDraft === null) return;
    await mutations.updateInfo(item.id, titleDraft, item.desc);
    setTitleDraft(null);
  });

  if (loading) return <Loading />;
  if (!item) return null;

  return (
    <DatabaseWorkspace
      tableId={item.dataTableId || undefined}
      titleKey={item.id}
      title={item.title}
      onTitleChange={setTitleDraft}
      onTitleCommit={onTitleCommit}
      headerExtra={
        <Menu
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          align="end"
          className="w-[240px]"
          trigger={
            <button
              type="button"
              title="切换数据库"
              className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-8 shrink-0 place-items-center rounded-[8px] transition-colors duration-[160ms]"
            >
              <ChevronDown
                className={cn(
                  "ease-tau-out size-4 transition-transform duration-150",
                  switcherOpen && "rotate-180"
                )}
                strokeWidth={1.75}
              />
            </button>
          }
        >
          {items.map(candidate => (
            <Menu.Item
              key={candidate.id}
              onSelect={() => navigator.push("database-detail", { id: candidate.id })}
              className={candidate.id === item.id ? "text-accent-text font-medium" : undefined}
            >
              {candidate.title}
            </Menu.Item>
          ))}
        </Menu>
      }
    />
  );
});

export default DatabaseDetailView;
