import { memo } from "react";
import { Button, Result, Empty, Alert } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import Database from "@/components/Database";
import type {
  ColumnDef,
  RowData,
  DatabaseData,
} from "@/components/Database/types";
import type { DataTableView } from "@/types";
import useTheme from "@/hooks/useTheme";

interface WeReadContentProps {
  isConnected: boolean;
  error: string | null;
  syncing: boolean;
  rows: RowData[];
  columns: ColumnDef[];
  views: DataTableView[];
  activeViewId: number;
  activeViewConfig: any;
  databaseKey: string;
  onQuickLogin: () => void;
  onDataChange: (data: DatabaseData) => void;
  onViewConfigChange: (config: any) => void;
  onCreateView: (viewData: any) => Promise<DataTableView | null>;
  onDeleteView: (viewId: number) => Promise<number | null>;
  onRenameView: (viewId: number, name: string) => Promise<DataTableView | null>;
  onUpdateView: (
    viewId: number,
    updates: Partial<DataTableView>,
  ) => Promise<DataTableView | null>;
  onReorderViews: (orderedIds: number[]) => Promise<void>;
  onActiveViewIdChange: (viewId: number | null) => void;
  onRowDetailOpen: (row: RowData) => void;
}

export const WeReadContent: React.FC<WeReadContentProps> = memo((props) => {
  const {
    isConnected,
    error,
    syncing,
    rows,
    columns,
    views,
    activeViewId,
    activeViewConfig,
    databaseKey,
    onQuickLogin,
    onDataChange,
    onViewConfigChange,
    onCreateView,
    onDeleteView,
    onRenameView,
    onUpdateView,
    onReorderViews,
    onActiveViewIdChange,
    onRowDetailOpen,
  } = props;

  const { theme } = useTheme();
  const isDark = theme === "dark";

  if (!isConnected) {
    return (
      <Result
        status="info"
        title="尚未连接微信读书"
        subTitle="请先登录微信读书账号以同步书籍和笔记信息。"
        extra={
          <Button type="primary" onClick={onQuickLogin}>
            扫码登录
          </Button>
        }
      />
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="同步失败"
        description={error}
        className="mb-4"
        showIcon
      />
    );
  }

  if (rows.length === 0 && !syncing) {
    return (
      <Empty
        description="暂无微信读书数据，请点击上方按钮同步"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  if (syncing) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <LoadingOutlined style={{ fontSize: 48 }} />
      </div>
    );
  }

  return (
    <div className="w-full h-full" style={{ minHeight: 0 }}>
      <Database
        key={databaseKey}
        columns={columns}
        data={rows}
        views={views}
        activeViewId={activeViewId}
        viewConfig={activeViewConfig}
        config={{
          allowAddColumn: false,
          allowDeleteColumn: false,
          allowAddRow: false,
          allowDeleteRow: false,
        }}
        onDataChange={onDataChange}
        onViewConfigChange={onViewConfigChange}
        onCreateView={onCreateView}
        onDeleteView={onDeleteView}
        onRenameView={onRenameView}
        onUpdateView={onUpdateView}
        onReorderViews={onReorderViews}
        onActiveViewIdChange={async (viewId) => {
          if (viewId) {
            onActiveViewIdChange(viewId);
          }
        }}
        onRowDetailOpen={onRowDetailOpen}
        theme={isDark ? "dark" : "light"}
      />
    </div>
  );
});

WeReadContent.displayName = "WeReadContent";
