import { memo, useRef } from "react";
import Database, {
  RowData,
  ColumnDef,
  TableViewConfig,
  DatabaseProps,
} from "@/components/Database";
import EditText, { EditTextHandle } from "@/components/EditText";
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

/** 数据表格工作台骨架：标题行 + Database 视图区。
 *  数据表格型项目（DataTableProjectView）与文档树表格条目（TableProjectItemView）共用，
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
      <div className="mx-auto flex h-full w-full max-w-[1080px] flex-col">
        <div className="mb-2 flex items-center gap-2 px-4 pb-1 pt-3">
          <div className="flex-1">
            <EditText
              key={titleKey}
              ref={titleRef}
              defaultValue={title}
              onChange={onTitleChange}
              contentEditable={true}
              onPressEnter={handleTitleCommit}
            />
          </div>
          {headerExtra}
        </div>

        <div className="min-h-0 flex-1 px-4 pb-4">
          <Database
            key={`${table.id}-${activeView.id}`}
            columns={table.columns as ColumnDef[]}
            data={table.rows as RowData[]}
            views={views}
            activeViewId={activeView.id}
            viewConfig={activeView.config as TableViewConfig}
            onActiveViewIdChange={handleActiveViewIdChange}
            onViewConfigChange={handleViewConfigChange}
            onDataChange={onDataChange}
            onCreateView={onCreateView}
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
