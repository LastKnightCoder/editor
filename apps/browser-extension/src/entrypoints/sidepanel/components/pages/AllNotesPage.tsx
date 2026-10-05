import { useState, useCallback } from "react";
import { ChevronRight, FileText, RefreshCw } from "lucide-react";
import { IconButton, Spinner, cn } from "@tau/ui";
import { useAllNotes, type UrlNotesGroup } from "../../../../hooks/useAllNotes";
import type { NoteMetadata } from "../../../../utils/types";
import { SubpageHeader } from "../SubpageHeader";

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
    setExpanded(prev => !prev);
  }, []);

  return (
    <div className="border-line-2 border-b last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        className="hover:bg-hover flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors"
      >
        <ChevronRight
          size={14}
          strokeWidth={1.75}
          className={cn(
            "text-ink-3 shrink-0 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="text-tau-body text-ink-1 truncate font-medium">
            {getDomain(group.url)}
          </div>
          <div className="text-tau-micro text-ink-3 mt-0.5 truncate">
            {getUrlDisplayText(group.url)}
          </div>
        </div>
        <span className="bg-hover text-tau-tiny text-ink-2 shrink-0 rounded-full px-2 py-0.5 tabular-nums">
          {group.notes.length}
        </span>
      </button>
      {expanded && (
        <div className="pb-1.5 pl-7 pr-2">
          {group.notes.map(note => (
            <NoteItem key={note.id} note={note} onClick={() => onNoteClick(group.url, note.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 单条笔记条目 */
function NoteItem({ note, onClick }: { note: NoteMetadata; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-hover flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors"
    >
      <FileText size={14} strokeWidth={1.75} className="text-ink-3 shrink-0" />
      <span className="text-tau-body text-ink-1 min-w-0 flex-1 truncate">{note.title}</span>
      <span className="text-tau-tiny text-ink-3 shrink-0 tabular-nums">
        {formatRelativeTime(note.updatedAt)}
      </span>
    </button>
  );
}

/**
 * 全部笔记页面
 * 从右侧滑入的二级页面，展示所有网页的笔记列表
 */
export default function AllNotesPage({ onBack, onNoteClick }: AllNotesPageProps) {
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
      <SubpageHeader
        title="全部笔记"
        onBack={onBack}
        actions={
          <IconButton
            aria-label="刷新"
            title="刷新"
            className="size-8"
            disabled={refreshing}
            onClick={handleRefresh}
          >
            <RefreshCw size={15} strokeWidth={1.75} className={cn(refreshing && "animate-spin")} />
          </IconButton>
        }
      />
      <div className="tau-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {isLoading ? (
          <div className="flex justify-center pt-16">
            <Spinner />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-8 pt-20 text-center">
            <FileText size={22} strokeWidth={1.75} className="text-ink-3" />
            <p className="text-tau-title text-ink-1 font-semibold">还没有笔记</p>
            <p className="text-tau-sm text-ink-2">在网页的本页里点「新建笔记」开始记录</p>
          </div>
        ) : (
          <>
            <p className="text-tau-sm text-ink-3 px-1.5 pb-1.5 pt-3">
              {groups.length} 个网页 · {totalNotes} 条笔记
            </p>
            <div className="border-line-1 bg-surface rounded-tau-md overflow-hidden border">
              {groups.map(group => (
                <UrlGroupItem key={group.url} group={group} onNoteClick={onNoteClick} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
