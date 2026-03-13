import { memo, useMemo, useState } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import type {
  ColumnDef,
  RowData,
  DatabaseData,
  SelectOption,
} from "@/components/Database/types";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import weReadService from "@/services/weread";
import { useWeReadPersistence } from "./hooks/useWeReadPersistence";
import { useWeReadViews } from "./hooks/useWeReadViews";
import { WeReadToolbar } from "./components/WeReadToolbar";
import { WeReadContent } from "./components/WeReadContent";
import { WeReadFullScreenViewer } from "./components/WeReadFullScreenViewer";

const PUBLISHER_COLORS: Array<
  "red" | "orange" | "yellow" | "green" | "gray" | "blue" | "purple"
> = ["blue", "green", "purple", "orange", "yellow", "red", "gray"];

const WeReadPage: React.FC = memo(() => {
  const { message } = App.useApp();
  const themeColors = useThemeColors();

  const { weread } = useSettingStore((state) => ({
    weread: state.setting.integration.weread,
  }));

  const isConnected =
    weread.sessionStatus === "valid" && weread.cookies.length > 0;

  const {
    rows,
    initializing,
    syncing,
    error,
    lastSyncedAt,
    syncBooks,
    fetchBookDetail,
    databaseRefreshKey,
  } = useWeReadPersistence({
    isConnected,
    onSuccess: (msg) => message.success(msg),
    onError: (msg) => message.error(msg),
  });

  // 根据 rows 动态生成出版社 options
  const publisherOptions = useMemo<SelectOption[]>(() => {
    const publisherSet = new Set<string>();
    rows.forEach((row) => {
      const publisher = row.publisher as string;
      if (publisher && publisher.trim()) {
        publisherSet.add(publisher.trim());
      }
    });

    return Array.from(publisherSet).map((publisher, index) => ({
      id: publisher,
      name: publisher,
      color: PUBLISHER_COLORS[index % PUBLISHER_COLORS.length],
    }));
  }, [rows]);

  // 根据 rows 动态生成书架分类 options
  const archiveOptions = useMemo<SelectOption[]>(() => {
    const archiveSet = new Set<string>();
    rows.forEach((row) => {
      const archive = row.archive as string;
      if (archive && archive.trim()) {
        archiveSet.add(archive.trim());
      }
    });

    return Array.from(archiveSet).map((archive, index) => ({
      id: archive,
      name: archive,
      color: PUBLISHER_COLORS[index % PUBLISHER_COLORS.length],
    }));
  }, [rows]);

  const columns = useMemo<ColumnDef[]>(
    () => [
      {
        id: "title",
        title: "书名",
        type: "text",
        width: 320,
        isPrimary: true,
        readonly: true,
      },
      {
        id: "cover",
        title: "封面",
        type: "image",
        width: 180,
        readonly: true,
      },
      {
        id: "author",
        title: "作者",
        type: "text",
        width: 150,
        readonly: true,
      },
      {
        id: "link",
        title: "链接",
        type: "link",
        width: 120,
        readonly: true,
      },
      {
        id: "reading_status",
        title: "阅读状态",
        type: "select",
        width: 120,
        readonly: true,
        config: {
          options: [
            { id: "not_started", name: "未开始", color: "gray" },
            { id: "reading", name: "进行中", color: "blue" },
            { id: "finished", name: "已完成", color: "green" },
          ],
        },
      },
      {
        id: "archive",
        title: "书架分类",
        type: "select",
        width: 150,
        readonly: true,
        config: {
          options: archiveOptions,
        },
      },
      {
        id: "publisher",
        title: "出版社",
        type: "select",
        width: 150,
        readonly: true,
        config: {
          options: publisherOptions,
        },
      },
      {
        id: "description",
        title: "简介",
        type: "text",
        width: 400,
        readonly: true,
      },
      {
        id: "progress",
        title: "阅读进度",
        type: "progress",
        width: 200,
        readonly: true,
      },
      {
        id: "reading_time",
        title: "阅读时长(分钟)",
        type: "number",
        width: 200,
        readonly: true,
      },
      {
        id: "finished_date",
        title: "完成时间",
        type: "text",
        width: 180,
        readonly: true,
      },
    ],
    [publisherOptions, archiveOptions],
  );

  const columnIds = useMemo(() => columns.map((col) => col.id), [columns]);

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const {
    views,
    activeViewId,
    activeView,
    activeViewConfig,
    setActiveViewId,
    handleViewConfigChange,
    handleCreateView,
    handleDeleteView,
    handleRenameView,
    handleUpdateView,
    handleReorderViews,
  } = useWeReadViews({
    columnIds,
    rowIds,
    onWarning: (msg) => message.warning(msg),
  });

  const [detailState, setDetailState] = useState<{
    row: RowData;
    content: any;
  } | null>(null);

  const rowSignature = useMemo(
    () => rows.map((row) => row.id).join("|"),
    [rows],
  );
  const viewSignature = useMemo(
    () => views.map((view) => view.id).join("|"),
    [views],
  );
  const databaseKey = useMemo(
    () =>
      `${rowSignature}-${viewSignature}-${activeView?.id ?? 0}-${
        lastSyncedAt ?? 0
      }-${databaseRefreshKey}`,
    [rowSignature, viewSignature, activeView, lastSyncedAt, databaseRefreshKey],
  );

  const handleQuickLogin = useMemoizedFn(async () => {
    try {
      await weReadService.loginWithQRCode();
      message.success("微信读书登录成功，请开始同步");
    } catch (err) {
      // 用户取消登录不应该显示错误
      if (err instanceof Error && err.message.includes("取消")) {
        console.log("[WeRead] 用户取消登录");
        return;
      }
      const msg = err instanceof Error ? err.message : "登录失败，请稍后重试";
      message.error(msg);
    }
  });

  const handleRowDetailOpen = useMemoizedFn(async (row: RowData) => {
    // 每次打开详情都实时获取最新的高亮和笔记
    const detail = await fetchBookDetail(row.id);

    if (!detail) {
      message.info("这本书暂时没有同步到详细笔记");
      return;
    }

    setDetailState({
      row,
      content: detail,
    });
  });

  const handleCloseDetail = useMemoizedFn(() => {
    setDetailState(null);
  });

  return (
    <div className="w-full h-full flex flex-col p-6 overflow-hidden">
      <WeReadToolbar
        isConnected={isConnected}
        hasLocalData={rows.length > 0}
        initializing={initializing}
        hasStoredSession={weread.cookies.length > 0}
        userName={weread.userInfo.name}
        lastSyncedAt={lastSyncedAt}
        syncing={syncing}
        onQuickLogin={handleQuickLogin}
        onSync={syncBooks}
        themeColors={themeColors}
      />
      <div
        className={classNames(
          "flex-1 min-h-0 rounded-xl p-4 overflow-hidden shadow-sm border transition-colors",
          themeColors.cardBgClass,
          themeColors.cardBorderClass,
        )}
      >
        <WeReadContent
          isConnected={isConnected}
          initializing={initializing}
          hasStoredSession={weread.cookies.length > 0}
          error={error}
          syncing={syncing}
          rows={rows}
          columns={columns}
          views={views}
          activeViewId={activeViewId}
          activeViewConfig={activeViewConfig}
          databaseKey={databaseKey}
          onQuickLogin={handleQuickLogin}
          onDataChange={(_data: DatabaseData) => {
            // read only mirror
          }}
          onViewConfigChange={handleViewConfigChange}
          onCreateView={handleCreateView}
          onDeleteView={handleDeleteView}
          onRenameView={handleRenameView}
          onUpdateView={handleUpdateView}
          onReorderViews={handleReorderViews}
          onActiveViewIdChange={(viewId) => {
            if (viewId !== null) {
              setActiveViewId(viewId);
            }
          }}
          onRowDetailOpen={handleRowDetailOpen}
          themeColors={themeColors}
        />
      </div>
      <WeReadFullScreenViewer
        open={Boolean(detailState)}
        row={detailState?.row ?? null}
        content={detailState?.content ?? null}
        onClose={handleCloseDetail}
      />
    </div>
  );
});

WeReadPage.displayName = "WeReadPage";

export default WeReadPage;
