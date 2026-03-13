import { memo } from "react";
import classNames from "classnames";
import {
  AiOutlineLogin,
  AiOutlineInfoCircle,
  AiOutlineWarning,
} from "react-icons/ai";
import { HiOutlineBookOpen } from "react-icons/hi";
import { CgSpinner } from "react-icons/cg";
import Database from "@/components/Database";
import type {
  ColumnDef,
  RowData,
  DatabaseData,
} from "@/components/Database/types";
import type { DataTableView } from "@/types";
import useTheme from "@/hooks/useTheme";

interface ThemeColors {
  hoverClass: string;
  activeClass: string;
  textClass: string;
  secondaryTextClass: string;
  activeTextClass: string;
  tagBgClass: string;
  tagTextClass: string;
  buttonBg: string;
  buttonTextClass: string;
  cardBgClass: string;
  cardBorderClass: string;
  [key: string]: string;
}

interface WeReadContentProps {
  isConnected: boolean;
  initializing: boolean;
  hasStoredSession: boolean;
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
  themeColors: ThemeColors;
}

export const WeReadContent: React.FC<WeReadContentProps> = memo((props) => {
  const {
    isConnected,
    initializing,
    hasStoredSession,
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
    themeColors,
  } = props;

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const hasCachedRows = rows.length > 0;

  if (initializing) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <CgSpinner
          className={classNames(
            "text-5xl animate-spin",
            themeColors.activeTextClass,
          )}
        />
        <p className={classNames("text-sm mt-4", themeColors.textClass)}>
          {hasStoredSession
            ? "正在恢复微信读书状态..."
            : "正在加载微信读书数据..."}
        </p>
      </div>
    );
  }

  // 未连接且无本地缓存
  if (!isConnected && !hasCachedRows && !syncing) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center py-12">
        <div
          className={classNames(
            "w-16 h-16 rounded-full flex items-center justify-center mb-4",
            themeColors.tagBgClass,
          )}
        >
          <AiOutlineInfoCircle
            className={classNames("text-3xl", themeColors.tagTextClass)}
          />
        </div>
        <h3
          className={classNames(
            "text-lg font-medium mb-2",
            themeColors.activeTextClass,
          )}
        >
          尚未连接微信读书
        </h3>
        <p
          className={classNames(
            "text-sm mb-6 text-center",
            themeColors.textClass,
          )}
        >
          请先登录微信读书账号以同步书籍和笔记信息
        </p>
        <button
          onClick={onQuickLogin}
          className={classNames(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
            themeColors.buttonBg,
            themeColors.buttonTextClass,
          )}
        >
          <AiOutlineLogin />
          扫码登录
        </button>
      </div>
    );
  }

  // 空状态
  if (!hasCachedRows && !syncing) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center py-12">
        <div
          className={classNames(
            "w-20 h-20 rounded-full flex items-center justify-center mb-4",
            themeColors.tagBgClass,
          )}
        >
          <HiOutlineBookOpen
            className={classNames("text-4xl", themeColors.secondaryTextClass)}
          />
        </div>
        <p className={classNames("text-sm text-center", themeColors.textClass)}>
          暂无微信读书数据，请点击上方按钮同步
        </p>
      </div>
    );
  }

  // 加载状态
  if (syncing) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <CgSpinner
          className={classNames(
            "text-5xl animate-spin",
            themeColors.activeTextClass,
          )}
        />
        <p className={classNames("text-sm mt-4", themeColors.textClass)}>
          正在同步...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full" style={{ minHeight: 0 }}>
      {error && (
        <div
          className={classNames(
            "flex items-start gap-3 p-4 rounded-lg border mb-4",
            "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50",
          )}
        >
          <AiOutlineWarning className="text-xl text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-red-700 dark:text-red-300">
              同步失败
            </div>
            <div className="text-sm text-red-600 dark:text-red-400 mt-1">
              {error}
            </div>
          </div>
        </div>
      )}
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
