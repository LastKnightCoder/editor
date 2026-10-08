import { DesktopDatabase as Database } from "@/features/shared/database/DesktopDatabase";
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
    } = useEditDatabaseWithContext(tableId) || {};
    const titleRef = useRef<EditTextHandle>(null);
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
      onViewConfigChange?.(config as any);
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
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-[1760px] flex-col px-4 pb-4 pt-1">
        {/* 一整张纸：标题行在纸顶，Database 去掉自身卡片外壳，页签条与视图直接铺在纸上 */}
        <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mt-5 flex h-10 flex-none items-center gap-2 pl-8 pr-7">
            <EditText
              key={titleKey}
              ref={titleRef}
              className="text-tau-title-lg min-w-0 flex-1 truncate font-semibold tracking-[-0.01em] outline-none"
              defaultValue={title}
              onChange={onTitleChange}
              contentEditable={true}
              onPressEnter={handleTitleCommit}
            />
            {headerExtra}
          </div>
          <Database
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
