import { useMemo, useEffect, useState, type ComponentProps } from "react";
import { App as AntdApp } from "antd";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, EditorServicesProvider } from "@tau/editor/src";
import {
  BilibiliVideoDepsProvider,
  EditDatabaseDepsProvider,
  NotionVideoDepsProvider,
  RemoteVideoDepsProvider,
  YoutubeVideoDepsProvider,
  type DataTable,
  type DataTableView,
  type UseBilibiliVideoDeps,
  type UseEditDatabaseDeps,
  type UseNotionVideoDeps,
  type UseRemoteVideoDeps,
  type UseYoutubeVideoDeps,
} from "@tau/shared";
import { createMobileEditorServices } from "../../services/editorServices";
import type { CardDetailResponse } from "../../types";
import { mobileCardPreviewExtensions } from "./editorExtensions";

const EMPTY_EDITOR_CONTENT: EditorDocument = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

type EditorDocument = ComponentProps<typeof Editor>["initValue"];

const EMPTY_VIEW_CONFIG = {
  columnOrder: [],
  rowOrder: [],
  sorts: [],
};

function buildUnsupportedMessage(scope: string): string {
  return `MOBILE_UNSUPPORTED: ${scope} - 移动端当前仅支持只读预览`;
}

const bilibiliDeps: UseBilibiliVideoDeps = {
  getCredentials: async () => ({ SESSDATA: "", enabled: true }),
  getPlayUrl: async () => {
    throw new Error(buildUnsupportedMessage("bilibili.getPlayUrl"));
  },
  checkStreamAvailability: async () => ({
    videoAvailable: false,
    audioAvailable: false,
  }),
  cacheVideo: async () => {
    throw new Error(buildUnsupportedMessage("bilibili.cacheVideo"));
  },
  getCacheStatus: async () => false,
  showError: (message) => {
    console.warn("[mobile-bilibili]", message);
  },
};

const youtubeDeps: UseYoutubeVideoDeps = {
  getProxy: async () => ({ enabled: false }),
  getCacheStatus: async () => null,
  cacheVideo: async () => {
    throw new Error(buildUnsupportedMessage("youtube.cacheVideo"));
  },
  convertFileSrc: (path) => path,
  showError: (message) => {
    console.warn("[mobile-youtube]", message);
  },
};

const notionDeps: UseNotionVideoDeps = {
  getToken: async () => ({ token: "", enabled: false }),
  getBlockInfo: async () => ({
    success: false,
    error: buildUnsupportedMessage("notion.getBlockInfo"),
  }),
  getCacheStatus: async () => null,
  cacheVideo: async () => {
    throw new Error(buildUnsupportedMessage("notion.cacheVideo"));
  },
  showError: (message) => {
    console.warn("[mobile-notion]", message);
  },
};

const remoteVideoDeps: UseRemoteVideoDeps = {
  cacheVideo: async ({ url }) => ({
    localUrl: url,
    fileSize: 0,
    cached: true,
  }),
  getCacheStatus: async () => null,
  showError: (message) => {
    console.warn("[mobile-remote-video]", message);
  },
  isRemoteUrl: () => false,
};

const editDatabaseDeps: UseEditDatabaseDeps = {
  getDataTableDetail: async (tableId) => {
    const table: DataTable = {
      id: tableId,
      createTime: 0,
      updateTime: 0,
      columns: [],
      rows: [],
      activeViewId: tableId * 1000 + 1,
    };
    const view: DataTableView = {
      id: tableId * 1000 + 1,
      tableId,
      name: "默认视图",
      type: "table",
      order: 0,
      config: EMPTY_VIEW_CONFIG,
      createTime: 0,
      updateTime: 0,
    };
    return { table, views: [view] };
  },
  updateDataTable: async (data) => ({
    id: data.id,
    createTime: 0,
    updateTime: Date.now(),
    columns: data.columns,
    rows: data.rows,
    activeViewId: data.activeViewId ?? null,
  }),
  updateDataTableView: async (view) => view,
  createDataTableView: async (view) => ({
    id: Date.now(),
    tableId: view.tableId,
    name: view.name,
    type: view.type,
    order: view.order,
    config: {
      ...EMPTY_VIEW_CONFIG,
      ...(view.config ?? {}),
    },
    createTime: Date.now(),
    updateTime: Date.now(),
  }),
  deleteDataTableView: async (viewId) => viewId,
  setActiveDataTableView: async () => true,
  reorderDataTableViews: async () => undefined,
};

function normalizeTimestamp(value: number): number {
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

function formatTimeLabel(value: number): string {
  if (!value) {
    return "--";
  }
  return new Date(normalizeTimestamp(value)).toLocaleString();
}

function normalizeEditorContent(
  content: unknown[] | undefined,
): EditorDocument {
  if (!Array.isArray(content) || content.length === 0) {
    return EMPTY_EDITOR_CONTENT;
  }
  return content as EditorDocument;
}

function IconExpand() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function IconMinimize() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

type CardPreviewSheetProps = {
  open: boolean;
  fullscreen: boolean;
  loading: boolean;
  cardId: number | null;
  cardDetail: CardDetailResponse | null;
  onClose: () => void;
  onToggleFullscreen: () => void;
};

export function CardPreviewSheet(props: CardPreviewSheetProps) {
  const services = useMemo(() => createMobileEditorServices(), []);
  const content = useMemo(
    () => normalizeEditorContent(props.cardDetail?.content),
    [props.cardDetail?.content],
  );

  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (props.open) {
      setShouldRender(true);
    } else if (shouldRender) {
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [props.open, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* 遮罩层 */}
      <button
        type="button"
        aria-label="关闭预览"
        className={`absolute inset-0 bg-black/50 dark:bg-black/70 ${props.open ? "mask-enter" : "mask-exit"}`}
        onClick={props.onClose}
      />

      {/* 底部抽屉 */}
      <section
        className={`absolute left-0 right-0 flex flex-col bg-white dark:bg-gray-900 ${
          props.fullscreen
            ? "top-0 bottom-0 rounded-none"
            : "bottom-0 max-h-[85dvh] rounded-t-2xl"
        } ${props.open ? "sheet-enter" : "sheet-exit"}`}
      >
        {/* 拖拽指示条 */}
        {!props.fullscreen && (
          <div className="flex justify-center py-3">
            <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {/* 头部 */}
        <header
          className={`flex items-start justify-between gap-3 border-b border-gray-100 px-4 dark:border-gray-800 ${props.fullscreen ? "py-4 pt-safe" : "pb-3"}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
              {`卡片 #${props.cardDetail?.id ?? props.cardId ?? "-"}`}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {`创建: ${formatTimeLabel(props.cardDetail?.createTime ?? 0)}`}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {`更新: ${formatTimeLabel(props.cardDetail?.updateTime ?? 0)}`}
            </p>
            {props.cardDetail?.category && (
              <p className="mt-1 text-xs font-medium text-blue-500 dark:text-blue-400">
                {props.cardDetail.category}
              </p>
            )}
          </div>

          {/* 放大/缩小按钮 */}
          <button
            type="button"
            onClick={props.onToggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors active:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:active:bg-gray-700"
            aria-label={props.fullscreen ? "缩小" : "放大"}
          >
            {props.fullscreen ? <IconMinimize /> : <IconExpand />}
          </button>
        </header>

        {/* 内容区域 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe pt-4">
          {props.loading ? (
            <div className="space-y-3">
              <div className="h-5 w-32 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="mt-4 h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
            </div>
          ) : props.cardDetail ? (
            <div className="space-y-4">
              {/* 标签 */}
              {props.cardDetail.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {props.cardDetail.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 关联 */}
              {props.cardDetail.links.length > 0 && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                  <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                    关联卡片
                  </p>
                  <div className="space-y-1.5">
                    {props.cardDetail.links.slice(0, 6).map((link) => (
                      <p
                        key={link}
                        className="truncate text-xs text-gray-600 dark:text-gray-300"
                        title={link}
                      >
                        {link}
                      </p>
                    ))}
                    {props.cardDetail.links.length > 6 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        还有 {props.cardDetail.links.length - 6} 个关联...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 编辑器内容 */}
              <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-800">
                <AntdApp>
                  <EditorServicesProvider services={services}>
                    <BilibiliVideoDepsProvider deps={bilibiliDeps}>
                      <YoutubeVideoDepsProvider deps={youtubeDeps}>
                        <NotionVideoDepsProvider deps={notionDeps}>
                          <RemoteVideoDepsProvider deps={remoteVideoDeps}>
                            <EditDatabaseDepsProvider deps={editDatabaseDeps}>
                              <DndProvider backend={HTML5Backend}>
                                <Editor
                                  key={props.cardDetail.id}
                                  initValue={content}
                                  readonly
                                  extensions={mobileCardPreviewExtensions}
                                />
                              </DndProvider>
                            </EditDatabaseDepsProvider>
                          </RemoteVideoDepsProvider>
                        </NotionVideoDepsProvider>
                      </YoutubeVideoDepsProvider>
                    </BilibiliVideoDepsProvider>
                  </EditorServicesProvider>
                </AntdApp>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
              <p className="text-4xl">📄</p>
              <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">
                无可预览内容
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default CardPreviewSheet;
