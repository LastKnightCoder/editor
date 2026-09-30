/**
 * 视频笔记 · 中栏「我的笔记」：一个视频可有多篇笔记（video_note_item → content），
 * 顶行切换 / 新建 / 删除，正文为协同编辑器，挂时间戳与截帧扩展（快捷键 + 工具按钮）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, Clock3, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import { Button, ConfirmDialog, IconButton, Loading, Menu, Tooltip, toast } from "@tau/ui";
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
  insertVideoTimestamp,
} from "@/components/VideoNotePanel/extensions/VideoTimestamp";
import {
  createVideoScreenshotExtension,
  insertVideoScreenshot,
} from "@/components/VideoNotePanel/extensions/VideoScreenshot";
import type { VideoController } from "@/components/VideoNotePanel/VideoController";

const emptyContent = (): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Descendant,
];

const noteTitle = (item: VideoNoteItem, index: number) => item.title || `笔记 ${index + 1}`;

interface NotesStageProps {
  videoNoteId: number;
  videoController: VideoController;
}

export function NotesStage({ videoNoteId, videoController }: NotesStageProps) {
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

  const createNote = useMemoizedFn(async () => {
    try {
      const contentId = await createContent(emptyContent(), 0);
      if (!contentId) throw new Error("Failed to create content");
      const item = await createVideoNoteItem({ videoNoteId, contentId, title: "" });
      setItems(prev => [...prev, item]);
      setActiveId(item.id);
    } catch (error) {
      console.error("Failed to create note item:", error);
      toast.error("创建笔记失败");
    }
  });

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
      <div className="flex h-[52px] shrink-0 items-center gap-1 pl-4 pr-3">
        <Menu
          trigger={
            <button
              type="button"
              className="text-tau-body text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm flex h-[30px] max-w-[260px] cursor-pointer items-center gap-1 px-2 transition-colors"
            >
              <span className="truncate">{noteTitle(active, activeIndex)}</span>
              <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
            </button>
          }
        >
          {items.map((item, index) => (
            <Menu.Item
              key={item.id}
              icon={
                item.id === active.id ? (
                  <Check className="size-4" strokeWidth={1.75} />
                ) : (
                  <span className="size-4" />
                )
              }
              onSelect={() => setActiveId(item.id)}
            >
              {noteTitle(item, index)}
            </Menu.Item>
          ))}
          <Menu.Separator />
          <Menu.Item icon={<Plus className="size-4" strokeWidth={1.75} />} onSelect={createNote}>
            新建笔记
          </Menu.Item>
        </Menu>
        <span className="flex-1" />
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
        <div className="mx-auto max-w-[760px] px-10 pb-16 pt-2">
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
}
