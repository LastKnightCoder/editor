import { DataTableEditor as Database } from "./DataTableEditor";
import { memo, useRef } from "react";
import {
  RowData,
  ColumnDef,
  TableViewConfig,
  DatabaseProps,
  CreateDatabaseView,
} from "@tau/database";
import { EditText, EditTextHandle } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import { useEditDatabaseWithContext } from "@tau/shared";
import { sourceFieldKey } from "@/features/databases/data-sources";
import { DataSourcePill } from "./DataSourcePill";

export interface DatabaseWorkspaceProps {
  tableId?: number;
  /** 实体 id：切换实体时重建标题输入框 */
  titleKey: React.Key;
  title: string;
  onTitleChange(title: string): void;
  /** 回车提交（保存实体）；失焦由组件内处理 */
  onTitleCommit(): Promise<void>;
  /** 标题行右侧插槽（如项目切换触发器） */
  headerExtra?: React.ReactNode;
}

/** 数据表格工作台骨架：一整张纸，纸顶标题行 + 纸内 Database 视图区。
 *  数据库模块（DatabaseDetailView）与文档树表格条目（TableProjectItemView）共用，
 *  实体加载与保存差异由两个薄壳各自承担 */
const DatabaseWorkspace = memo(
  ({
    tableId,
    titleKey,
    title,
    onTitleChange,
    onTitleCommit,
    headerExtra,
  }: DatabaseWorkspaceProps) => {
    const {
      activeViewId,
      views,
      table,
      onDataChange,
      onViewConfigChange,
      onCreateView,
      onDeleteView,
      onRenameView,
      onUpdateView,
      onReorderViews,
      onActiveViewIdChange,
      reload,
    } = useEditDatabaseWithContext(tableId) || {};
    const titleRef = useRef<EditTextHandle>(null);
    const source = table?.source;
    const activeView = views?.find(view => view.id === activeViewId);

    const handleTitleCommit = useMemoizedFn(async () => {
      titleRef.current?.blur();
      await onTitleCommit();
    });

    const handleActiveViewIdChange = useMemoizedFn(async (viewId: number | null) => {
      if (onActiveViewIdChange) {
        await Promise.resolve(onActiveViewIdChange(viewId));
      }
    });

    const handleViewConfigChange = useMemoizedFn((config: TableViewConfig) => {
      // 两处 TableViewConfig 同名异源（database 表格插件与共享协议），按回调参数类型断言桥接
      onViewConfigChange?.(config as Parameters<NonNullable<typeof onViewConfigChange>>[0]);
    });

    const handleCreateView = useMemoizedFn((view: CreateDatabaseView) => {
      if (!table || !onCreateView) return Promise.resolve(null);
      return onCreateView({ ...view, tableId: table.id });
    });

    const handleUpdateView = useMemoizedFn(
      async (
        viewId: number,
        updates: Parameters<NonNullable<DatabaseProps["onUpdateView"]>>[1]
      ) => {
        if (onUpdateView) {
          return await onUpdateView(viewId, updates);
        }
        return null;
      }
    );

    if (!table || !activeView || !views) return null;

    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] min-w-0 flex-col px-4 pt-1 pb-4">
        {/* 一整张纸：标题行在纸顶，Database 去掉自身卡片外壳，页签条与视图直接铺在纸上 */}
        <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mt-5 flex h-10 flex-none items-center gap-2 pr-7 pl-8">
            <EditText
              key={titleKey}
              ref={titleRef}
              className="text-tau-title-lg min-w-0 flex-1 truncate font-semibold tracking-[-0.01em] outline-none"
              defaultValue={title}
              onChange={onTitleChange}
              contentEditable={true}
              onPressEnter={handleTitleCommit}
            />
            {source && (
              <DataSourcePill
                tableId={table.id}
                source={source}
                customColumns={
                  (table.columns as ColumnDef[]).filter(
                    column => sourceFieldKey(column.id) === null
                  ).length
                }
                onChanged={() => reload?.()}
              />
            )}
            {headerExtra}
          </div>
          <Database
            source={source}
            reload={reload}
            tableId={table.id}
            bare
            className="min-h-0 flex-1"
            key={table.id}
            columns={table.columns as ColumnDef[]}
            data={table.rows as RowData[]}
            views={views}
            activeViewId={activeView.id}
            viewConfig={activeView.config as TableViewConfig}
            onActiveViewIdChange={handleActiveViewIdChange}
            onViewConfigChange={handleViewConfigChange}
            onDataChange={onDataChange}
            onCreateView={handleCreateView}
            onDeleteView={onDeleteView}
            onRenameView={onRenameView}
            onUpdateView={handleUpdateView}
            onReorderViews={onReorderViews}
          />
        </div>
      </div>
    );
  }
);

export default DatabaseWorkspace;
