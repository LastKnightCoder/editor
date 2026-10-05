/**
 * 一条碎碎念：时间 · （补记）· 正文 · 标签。
 *
 * 阅读态 / 编辑态分离（D-044，修 legacy 常驻编辑器误触即改）：默认用只读 Editor 渲染
 * （不建协作会话，同卡片墙 CardContentPreview）；点正文才挂 ContentEditor（内容会话、
 * 协作照旧）——会话就绪前继续显示只读渲染、就绪后光标落在点击处，切换不闪不跳；
 * 实时保存（节流落库、退出 / 卸载时补存），⌘↵ / Esc / 点流里别处退出，不设「完成」按钮。
 * 悬停操作（标签 / 更多）占固定槽位原位淡入，不顶开布局。
 */

import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import { getContentKit } from "@/services/editorKit";
import { Editor as SlateEditor, Transforms, type BasePoint, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { useThrottleFn, useUnmount } from "ahooks";
import { Copy, Hash, MoreHorizontal, Trash2 } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import { IconButton, Menu, Tag, cn, toast, type TagColor } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  dayKey,
  formatTime,
  isBackfill,
  plainText,
  shortDate,
  type DiaryMoment,
  type DiaryTag,
} from "../model";
import type { DiaryMutations } from "../queries";
import { TagPicker } from "./TagPicker";
import { parseEntityLocation } from "@/entity/locate";
import { scrollToAndFlash } from "@/utils/flash-element";

const ICON = { className: "size-[14px]", strokeWidth: 1.75 } as const;

export interface MomentItemProps {
  location?: { moment: string; at: string } | null;
  moment: DiaryMoment;
  today: string;
  tags: DiaryTag[];
  counts: Map<string, number>;
  fresh: boolean;
  mutations: DiaryMutations;
  onOpenTag: (name: string) => void;
  onDelete: (moment: DiaryMoment) => void;
  onClearTag: (name: string) => void;
}

export const MomentItem = memo(function MomentItem({
  moment,
  location,
  today,
  tags,
  counts,
  fresh,
  mutations,
  onOpenTag,
  onDelete,
  onClearTag,
}: MomentItemProps) {
  const [editing, setEditing] = useState(false);
  const readerRef = useRef<EditorRef | null>(null);
  const at = location?.moment === String(moment.id) ? location.at : undefined;
  useEffect(() => {
    const target = parseEntityLocation(at);
    if (!target || !("block" in target) || editing) return;
    let markedElement: HTMLElement | null = null;
    const frame = requestAnimationFrame(() => {
      const editor = readerRef.current?.getEditor();
      if (!editor) return;
      const node = editor.children[target.block] ?? editor.children[0];
      if (node) {
        const element = ReactEditor.toDOMNode(editor, node);
        markedElement = element;
        element.setAttribute("data-content-location", "");
        scrollToAndFlash(element);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      markedElement?.removeAttribute("data-content-location");
    };
  }, [at, editing]);
  /** 点进编辑时的落点（阅读态 Slate 坐标），编辑器就绪后把光标放回这里 */
  const caretRef = useRef<BasePoint | null>(null);
  const [flash, setFlash] = useState(fresh);
  const rootRef = useRef<HTMLElement>(null);
  const colorOf = (name: string): TagColor => tags.find(t => t.name === name)?.color ?? "gray";

  useEffect(() => {
    if (fresh) setFlash(true);
  }, [fresh]);
  // 熄灭跟着 flash 走，不跟 fresh：上层清掉 freshIds 时不能把还没到点的熄灭一并取消
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(false), 1200);
    return () => window.clearTimeout(id);
  }, [flash]);

  // 节流落库；未落的最新正文另记一份，卸载时自己补存——ahooks 的 useThrottleFn 卸载时会先
  // cancel 掉尾调用（它的清理先于这里注册的），单靠 flush 会丢最后一段改动（虚拟列表滚出即卸载）
  const unsaved = useRef<Descendant[] | null>(null);
  const saveNow = () => {
    if (!unsaved.current) return;
    void mutations.updateContent(moment.id, unsaved.current);
    unsaved.current = null;
  };
  const { run: throttledSave } = useThrottleFn(saveNow, { wait: 800 });
  const save = (content: Descendant[]) => {
    unsaved.current = content;
    throttledSave();
  };
  const exit = () => {
    saveNow();
    setEditing(false);
  };
  useUnmount(saveNow);

  // 点流里别处退出编辑（浮层在流外的 portal 里，点它们不算离开）
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (rootRef.current?.contains(target)) return;
      if (target.closest("[data-diary-stream]")) exit();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // exit 每次渲染新建但只读 ref，无需进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const backfill = isBackfill(moment);

  return (
    <article
      ref={rootRef}
      data-moment={moment.id}
      className={cn(
        "group/moment ease-tau-out relative -mx-3.5 rounded-[12px] px-3.5 pb-3 pt-2.5 transition-[background] duration-[700ms]",
        flash ? "bg-accent-soft duration-0" : editing ? "bg-transparent" : "hover:bg-hover"
      )}
    >
      {/* 与正文留 10px：编辑框外扩 4px + 焦点环 3px 后仍与时间 / 操作行隔开，阅读 ⇄ 编辑正文不动 */}
      <div className="mb-2.5 flex h-[22px] items-center gap-2">
        <span
          className="text-tau-meta text-ink-3 font-tau-mono font-medium tabular-nums"
          title={`写于 ${shortDate(dayKey(moment.createTime), today)} ${formatTime(moment.createTime)}`}
        >
          {formatTime(moment.createTime)}
        </span>
        {backfill && (
          <span className="text-tau-sm text-ink-3">
            · 补记于 {shortDate(dayKey(moment.createTime), today)}
          </span>
        )}
        <div className="ml-auto flex gap-0.5 opacity-0 transition-opacity duration-[160ms] focus-within:opacity-100 group-hover/moment:opacity-100 has-[[aria-expanded=true]]:opacity-100">
          <TagPicker
            placement="bottom-end"
            selected={moment.tags}
            onChange={next => void mutations.setTags(moment.id, next)}
            tags={tags}
            counts={counts}
            onRecolor={(name, color) => void mutations.recolor(name, color)}
            onClear={onClearTag}
            trigger={
              <IconButton title="标签" className="size-6 rounded-[7px]">
                <Hash {...ICON} />
              </IconButton>
            }
          />
          <Menu
            align="end"
            trigger={
              <IconButton title="更多" className="size-6 rounded-[7px]">
                <MoreHorizontal {...ICON} />
              </IconButton>
            }
          >
            <Menu.Item
              icon={<Copy {...ICON} />}
              onSelect={() => {
                void navigator.clipboard
                  .writeText(plainText(moment.content))
                  .then(() => toast.success("已复制"));
              }}
            >
              复制文本
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item danger icon={<Trash2 {...ICON} />} onSelect={() => onDelete(moment)}>
              删除
            </Menu.Item>
          </Menu>
        </div>
      </div>

      {editing ? (
        <div
          // 负外边距抵消内边距：描边框外扩，正文位置与阅读态逐像素一致
          className="bg-surface -mx-2 -my-1 rounded-[10px] px-2 py-1 shadow-[0_0_0_1px_var(--tau-accent),var(--tau-focus-ring)]"
          onKeyDown={e => {
            if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              exit();
            }
          }}
        >
          <MomentEditor
            moment={moment}
            at={at}
            caret={caretRef}
            onChange={save}
            fallback={<MomentReader content={moment.content} revision={moment.updateTime} />}
          />
        </div>
      ) : (
        <div
          className="cursor-text"
          onClick={e => {
            // 链接 / 图片等交互元素不抢进编辑
            if ((e.target as HTMLElement).closest("a,img,video,button")) return;
            const selection = getSelection();
            if (selection?.toString()) return;
            caretRef.current = readerCaret(readerRef.current, selection);
            setEditing(true);
          }}
        >
          <MomentReader ref={readerRef} content={moment.content} revision={moment.updateTime} />
        </div>
      )}

      {moment.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {moment.tags.map(name => (
            <button
              key={name}
              type="button"
              title={`只看「${name}」`}
              onClick={() => onOpenTag(name)}
              className="rounded-full hover:brightness-[0.97]"
            >
              <Tag color={colorOf(name)}>{name}</Tag>
            </button>
          ))}
        </div>
      )}
    </article>
  );
});

const EDITOR_CLASS = "text-tau-body-lg leading-[1.8]";

/** 点击后浏览器落在只读正文里的光标 → 阅读态 Slate 坐标（两边内容同源，路径可复用） */
function readerCaret(reader: EditorRef | null, selection: Selection | null): BasePoint | null {
  if (!reader || !selection?.anchorNode) return null;
  return ReactEditor.toSlatePoint(
    reader.getEditor(),
    [selection.anchorNode, selection.anchorOffset],
    { exactMatch: false, suppressThrow: true }
  );
}

/** 只读渲染：不建协作会话；正文变化（updateTime）时重建实例（initValue 只在挂载时生效） */
const MomentReader = forwardRef<EditorRef, { content: Descendant[]; revision: number }>(
  function MomentReader({ content, revision }, ref) {
    return (
      <ErrorBoundary>
        <Editor
          kit={getContentKit()}
          ref={ref}
          key={revision}
          readonly
          initValue={content.length ? content : undefined}
          className={EDITOR_CLASS}
        />
      </ErrorBoundary>
    );
  }
);

function MomentEditor({
  moment,
  at,
  caret,
  fallback,
  onChange,
}: {
  moment: DiaryMoment;
  at?: string;
  caret: React.RefObject<BasePoint | null>;
  fallback: React.ReactNode;
  onChange: (content: Descendant[]) => void;
}) {
  const editorRef = useRef<EditorRef | null>(null);
  // initValue 只在挂载时生效：编辑期间缓存回写不重建
  const initValue = useMemo(() => moment.content, [moment.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ErrorBoundary>
      <ContentEditor
        at={at}
        ref={editorRef}
        contentId={moment.contentId}
        initValue={initValue}
        readonly={false}
        fallback={fallback}
        onInit={() => requestAnimationFrame(() => placeCaret(editorRef.current, caret.current))}
        onChange={onChange}
        source={{ sourceType: "content", sourceId: moment.contentId }}
        editingContext={{ entityType: "diary", entityId: moment.id }}
        className={EDITOR_CLASS}
      />
    </ErrorBoundary>
  );
}

/** 光标放回点击处；落点失效（协作内容已与阅读态不同）则退回末尾 */
function placeCaret(ref: EditorRef | null, point: BasePoint | null) {
  if (!ref) return;
  if (!point) return ref.focus();
  const editor = ref.getEditor();
  try {
    const [leaf] = SlateEditor.leaf(editor, point.path);
    if (point.offset > leaf.text.length) throw new Error("stale caret");
    ReactEditor.focus(editor);
    Transforms.select(editor, point);
  } catch {
    ref.focus();
  }
}
