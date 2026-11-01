/**
 * 视频笔记 · 右栏「笔记」：一个视频可有多篇笔记（video_note_item → content），
 * 栏头胶囊切换 / 新建，正文为协同编辑器，挂时间戳与截帧扩展（快捷键 + 工具按钮）。
 * 对外暴露 insertQuote（转录摘录插到光标处），并汇报全部笔记里的时间点（进度条刻度）。
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Camera, Clock3, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useLocalStorageState, useMemoizedFn, useThrottleFn } from "ahooks";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor";
import { Button, ConfirmDialog, IconButton, Loading, Menu, Tooltip, cn, toast } from "@tau/ui";
import Editor from "@/components/ContentEditor";
import {
  createContent,
  createVideoNoteItem,
  deleteVideoNoteItem,
  getContentById,
  getVideoNoteItemsByVideoNoteId,
  updateVideoNoteItem,
} from "@/commands";
import type { VideoNoteItem } from "@/types";
import {
  createVideoTimestampExtension,
  insertTranscriptQuote,
  insertVideoTimestamp,
} from "@/components/VideoNotePanel/extensions/VideoTimestamp";
import {
  createVideoScreenshotExtension,
  insertVideoScreenshot,
} from "@/components/VideoNotePanel/extensions/VideoScreenshot";
import type { VideoController } from "@/components/VideoNotePanel/VideoController";
import { extractNoteMarkers, type NoteMarker } from "./noteMarkers";

const emptyContent = (): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Descendant,
];

const noteTitle = (item: VideoNoteItem, index: number) => item.title || `笔记 ${index + 1}`;

interface NotesStageProps {
  videoNoteId: number;
  videoController: VideoController;
  /** 全部笔记里的时间点变化（按时间升序） */
  onMarkersChange?: (markers: NoteMarker[]) => void;
}

export interface NotesStageHandle {
  /** 转录摘录插到当前笔记光标处；还没有笔记时新建一篇 */
  insertQuote: (text: string, timeSec: number) => void;
}

const quoteContent = (text: string, timeSec: number): Descendant[] => [
  {
    type: "blockquote",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "" },
          { type: "video-timestamp", time: timeSec, children: [{ type: "formatted", text: "" }] },
          { type: "formatted", text: ` ${text}` },
        ],
      },
    ],
  } as Descendant,
  ...emptyContent(),
];

export const NotesStage = forwardRef<NotesStageHandle, NotesStageProps>(function NotesStage(
  { videoNoteId, videoController, onMarkersChange },
  ref
) {
  const editorRef = useRef<EditorRef>(null);

  const [items, setItems] = useState<VideoNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useLocalStorageState<number | null>(
    `video-note-active-note-${videoNoteId}`,
    { defaultValue: null }
  );
  const [initValue, setInitValue] = useState<Descendant[] | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<VideoNoteItem | null>(null);

  const activeIndex = items.findIndex(item => item.id === activeId);
  const active = activeIndex >= 0 ? items[activeIndex] : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVideoNoteItemsByVideoNoteId(videoNoteId)
      .then(list => {
        if (cancelled) return;
        setItems(list);
        setActiveId(current =>
          current != null && list.some(item => item.id === current)
            ? current
            : (list[0]?.id ?? null)
        );
      })
      .catch(error => {
        console.error("Failed to load video note items:", error);
        toast.error("加载笔记失败");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoNoteId]);

  // 切换笔记：取正文作编辑器初值，标题草稿同步
  const activeContentId = active?.contentId;
  useEffect(() => {
    setInitValue(null);
    if (activeContentId == null) return;
    let cancelled = false;
    getContentById(activeContentId)
      .then(content => !cancelled && setInitValue(content?.content || emptyContent()))
      .catch(() => !cancelled && setInitValue(emptyContent()));
    return () => {
      cancelled = true;
    };
  }, [activeContentId]);

  useEffect(() => {
    setTitleDraft(active?.title ?? "");
  }, [active?.id, active?.title]);

  const extensions = useMemo(
    () => [
      createVideoTimestampExtension(videoController),
      createVideoScreenshotExtension(videoController),
    ],
    [videoController]
  );

  // 全部笔记的正文快照（当前笔记随编辑更新，其余取加载时内容），用于汇报时间点
  const contentsRef = useRef(new Map<number, Descendant[]>());
  const reportMarkers = useMemoizedFn(() => {
    onMarkersChange?.(
      items
        .flatMap((item, index) =>
          extractNoteMarkers(contentsRef.current.get(item.id), {
            id: item.id,
            title: noteTitle(item, index),
          })
        )
        .sort((a, b) => a.time - b.time)
    );
  });
  const { run: reportMarkersSoon } = useThrottleFn(reportMarkers, { wait: 500 });

  useEffect(() => {
    let cancelled = false;
    const missing = items.filter(item => !contentsRef.current.has(item.id));
    void Promise.all(
      missing.map(item =>
        getContentById(item.contentId)
          .then(content => contentsRef.current.set(item.id, content?.content || []))
          .catch(() => contentsRef.current.set(item.id, []))
      )
    ).then(() => !cancelled && reportMarkers());
    return () => {
      cancelled = true;
    };
  }, [items, reportMarkers]);

  const createNote = useMemoizedFn(async (initial?: Descendant[]) => {
    try {
      const content = initial ?? emptyContent();
      const contentId = await createContent(content, 0);
      if (!contentId) throw new Error("Failed to create content");
      const item = await createVideoNoteItem({ videoNoteId, contentId, title: "" });
      contentsRef.current.set(item.id, content);
      setItems(prev => [...prev, item]);
      setActiveId(item.id);
    } catch (error) {
      console.error("Failed to create note item:", error);
      toast.error("创建笔记失败");
    }
  });

  useImperativeHandle(ref, () => ({
    insertQuote: (text, timeSec) => {
      const editor = active && initValue ? editorRef.current?.getEditor() : null;
      if (editor) insertTranscriptQuote(editor, text, timeSec);
      else if (!active) void createNote(quoteContent(text, timeSec));
      else toast.info("笔记还在加载，稍后再试");
    },
  }));

  const saveTitle = useMemoizedFn(async () => {
    if (!active) return;
    const title = titleDraft.trim();
    if (title === active.title) return;
    try {
      const updated = await updateVideoNoteItem({ id: active.id, title });
      setItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    } catch (error) {
      console.error("Failed to update note title:", error);
      toast.error("保存标题失败");
    }
  });

  const confirmDelete = useMemoizedFn(async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      await deleteVideoNoteItem(target.id);
      contentsRef.current.delete(target.id);
      setItems(prev => {
        const next = prev.filter(item => item.id !== target.id);
        if (activeId === target.id) setActiveId(next[0]?.id ?? null);
        return next;
      });
    } catch (error) {
      console.error("Failed to delete note item:", error);
      toast.error("删除失败");
    }
  });

  const insertAtCursor = useMemoizedFn(async (kind: "timestamp" | "screenshot") => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    if (kind === "timestamp") await insertVideoTimestamp(editor, videoController);
    else await insertVideoScreenshot(editor, videoController);
  });

  if (loading) return <Loading minHeight={0} />;

  if (!active) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-tau-title text-ink-1 font-semibold">还没有笔记</p>
        <p className="text-tau-meta text-ink-3">边看边记，时间戳和截帧都能一键插入</p>
        <Button size="sm" variant="primary" icon={Plus} onClick={() => void createNote()}>
          新建笔记
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-1 pr-3 pl-4">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === active.id}
              onClick={() => setActiveId(item.id)}
              title={noteTitle(item, index)}
              className={cn(
                "text-tau-sm ease-tau-out h-[26px] max-w-[180px] shrink-0 cursor-pointer truncate rounded-full px-2.5 transition-colors duration-[160ms]",
                item.id === active.id
                  ? "bg-selected text-ink-1 font-medium"
                  : "text-ink-2 hover:bg-hover hover:text-ink-1"
              )}
            >
              {noteTitle(item, index)}
            </button>
          ))}
          <Tooltip content="新建笔记" placement="bottom">
            <IconButton
              aria-label="新建笔记"
              className="size-[26px] shrink-0"
              onClick={() => void createNote()}
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
        </div>
        <Tooltip content="插入当前时间戳（⌘⇧T）" placement="bottom">
          <IconButton aria-label="插入时间戳" onClick={() => void insertAtCursor("timestamp")}>
            <Clock3 className="size-4" strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
        <Tooltip content="截取当前帧（⌘⇧S）" placement="bottom">
          <IconButton aria-label="截取当前帧" onClick={() => void insertAtCursor("screenshot")}>
            <Camera className="size-4" strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
        <Menu
          align="end"
          trigger={
            <button
              type="button"
              title="笔记操作"
              aria-label="笔记操作"
              className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid size-[30px] cursor-pointer place-items-center transition-colors"
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          }
        >
          <Menu.Item
            danger
            icon={<Trash2 className="size-4" strokeWidth={1.75} />}
            onSelect={() => setPendingDelete(active)}
          >
            删除笔记
          </Menu.Item>
        </Menu>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[720px] px-7 pt-2 pb-16">
          <input
            type="text"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                editorRef.current?.focus();
              }
            }}
            placeholder="无标题笔记"
            className="text-tau-title-lg text-ink-1 placeholder:text-ink-3 mb-3 w-full border-none bg-transparent p-0 font-semibold outline-none"
          />
          {initValue ? (
            <Editor
              key={`video-note-item-${active.id}`}
              contentId={active.contentId}
              ref={editorRef}
              initValue={initValue}
              extensions={extensions}
              readonly={false}
              editingContext={{ entityType: "project-item", entityId: videoNoteId }}
              onChange={value => {
                contentsRef.current.set(active.id, value);
                reportMarkersSoon();
              }}
              placeHolder="边看边记…"
            />
          ) : (
            <Loading minHeight={120} />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={open => !open && setPendingDelete(null)}
        danger
        title="删除笔记"
        description={`确定删除「${pendingDelete ? noteTitle(pendingDelete, items.indexOf(pendingDelete)) : ""}」吗？`}
        confirmText="删除"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
});
