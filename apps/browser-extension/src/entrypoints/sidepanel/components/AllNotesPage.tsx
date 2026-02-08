import { useState, useCallback } from "react";
import { ChevronRight, FileText, ArrowLeft, RefreshCw } from "lucide-react";
import { useAllNotes, type UrlNotesGroup } from "../../../hooks/useAllNotes";
import type { NoteMetadata } from "../../../utils/types";

interface AllNotesPageProps {
  onBack: () => void;
  onNoteClick: (url: string, noteId: string) => void;
}

/** 格式化时间戳为相对时间 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;

  const date = new Date(timestamp);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

/** 从 URL 中提取简短的显示文本 */
function getUrlDisplayText(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const display = parsed.hostname + path;
    return display.length > 60 ? display.slice(0, 57) + "..." : display;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + "..." : url;
  }
}

/** 从 URL 中提取域名 */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** 单个网页笔记分组条目 */
function UrlGroupItem({
  group,
  onNoteClick,
}: {
  group: UrlNotesGroup;
  onNoteClick: (url: string, noteId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="border-b border-gray-100 last:border-b-0 dark:border-[#21262d]">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/4 dark:hover:bg-white/8"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 dark:text-[#484f58] ${
            expanded ? "rotate-90" : ""
          }`}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
            {getDomain(group.url)}
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-[#6e7681]">
            {getUrlDisplayText(group.url)}
          </div>
        </div>

        <span className="shrink-0 rounded-full bg-gray-50 px-2 py-0.5 text-xs tabular-nums text-gray-500 dark:bg-[#0d1117] dark:text-[#6e7681]">
          {group.notes.length}
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="pb-1 pl-7 pr-4">
          {group.notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onClick={() => onNoteClick(group.url, note.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 单条笔记条目 */
function NoteItem({
  note,
  onClick,
}: {
  note: NoteMetadata;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/4 dark:hover:bg-white/8"
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-[#484f58]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-gray-900 dark:text-[#e6edf3]">
          {note.title}
        </div>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-gray-400 dark:text-[#484f58]">
        {formatRelativeTime(note.updatedAt)}
      </span>
    </button>
  );
}

/**
 * 全部笔记页面
 * 从右侧滑入的二级页面，展示所有网页的笔记列表
 */
export default function AllNotesPage({
  onBack,
  onNoteClick,
}: AllNotesPageProps) {
  const { groups, isLoading, refresh } = useAllNotes();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const totalNotes = groups.reduce((sum, g) => sum + g.notes.length, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-100 px-4 dark:border-[#21262d]">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-[#e6edf3]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-base font-semibold text-gray-900 dark:text-[#e6edf3]">
          全部笔记
        </span>
        <div className="flex-1" />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-[#e6edf3]"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
        </button>
      </header>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto tau-scrollbar">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <svg
              className="h-6 w-6 animate-spin text-blue-500 dark:text-blue-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="mt-3 text-sm text-gray-500 dark:text-[#6e7681]">
              加载中...
            </p>
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 dark:bg-[#0d1117]">
              <FileText className="h-6 w-6 text-gray-400 dark:text-[#484f58]" />
            </div>
            <h3 className="mb-1 text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
              暂无笔记
            </h3>
            <p className="text-center text-xs text-gray-500 dark:text-[#6e7681]">
              在浏览网页时切换到笔记 Tab 即可创建
            </p>
          </div>
        )}

        {!isLoading && groups.length > 0 && (
          <div className="px-4 py-2.5">
            <span className="text-xs text-gray-400 dark:text-[#484f58]">
              {groups.length} 个网页 · {totalNotes} 条笔记
            </span>
          </div>
        )}

        {!isLoading &&
          groups.map((group) => (
            <UrlGroupItem
              key={group.url}
              group={group}
              onNoteClick={onNoteClick}
            />
          ))}
      </div>
    </div>
  );
}
