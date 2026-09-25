/**
 * 一条碎碎念：时间 · （补记）· 正文 · 标签。
 *
 * 阅读态 / 编辑态分离（D-044，修 legacy 常驻编辑器误触即改）：默认用只读 Editor 渲染
 * （不建协作会话，同卡片墙 CardContentPreview）；点正文才挂 ContentEditor（内容会话、
 * 协作照旧）——会话就绪前继续显示只读渲染、就绪后光标落在点击处，切换不闪不跳；
 * 实时保存（节流落库、退出时 flush），⌘↵ / Esc / 点流里别处退出，不设「完成」按钮。
 * 悬停操作（标签 / 更多）占固定槽位原位淡入，不顶开布局。
 */

import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import { Editor as SlateEditor, Transforms, type BasePoint, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { useThrottleFn, useUnmount } from "ahooks";
import { Copy, Hash, MoreHorizontal, Trash2 } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor/src";
import { IconButton, Menu, Tag, cn, toast, type TagColor } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
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

const ICON = { className: "size-[14px]", strokeWidth: 1.75 } as const;

export interface MomentItemProps {
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
  /** 点进编辑时的落点（阅读态 Slate 坐标），编辑器就绪后把光标放回这里 */
  const caretRef = useRef<BasePoint | null>(null);
  const [flash, setFlash] = useState(fresh);
  const rootRef = useRef<HTMLElement>(null);
  const colorOf = (name: string): TagColor => tags.find(t => t.name === name)?.color ?? "gray";

  useEffect(() => {
    if (!fresh) return;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 1200);
    return () => window.clearTimeout(id);
  }, [fresh]);

  const { run: save, flush } = useThrottleFn(
    (content: Descendant[]) => void mutations.updateContent(moment.id, content),
    { wait: 800 }
  );
  const exit = () => {
    flush();
    setEditing(false);
  };
  useUnmount(flush);

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
    // exit 每次渲染新建但只读 ref 与稳定的 flush，无需进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const backfill = isBackfill(moment);

  return (
    <article
      ref={rootRef}
      data-moment={moment.id}
      className={cn(
        "group/moment ease-tau-out relative -mx-3.5 rounded-[12px] px-3.5 pb-3 pt-2.5 transition-[background] duration-[700ms]",
        "[contain-intrinsic-size:auto_120px] [content-visibility:auto]",
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
            caret={caretRef}
            onChange={save}
            fallback={<MomentReader eager content={moment.content} revision={moment.updateTime} />}
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

/**
 * 只读渲染：不建协作会话；正文变化（updateTime）时重建实例（initValue 只在挂载时生效）。
 * 编辑器实例挂载昂贵：离视口一屏以外先出纯文本占位，靠近才挂、挂上不再卸——
 * 否则跳转到几百条之后（那年今日 / 月份刻度）会一次同步挂几百个编辑器，卡住近一秒。
 */
const MomentReader = forwardRef<
  EditorRef,
  /** eager：直接挂编辑器（编辑态占位用，本就在视口里，不能先闪纯文本） */
  { content: Descendant[]; revision: number; eager?: boolean }
>(function MomentReader({ content, revision, eager = false }, ref) {
  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const [holder, setHolder] = useState<HTMLDivElement | null>(null);
  const [near, setNear] = useState(eager);
  useEffect(() => {
    if (!holder || near) return;
    const io = new IntersectionObserver(
      entries => entries.some(e => e.isIntersecting) && setNear(true),
      { root: holder.closest("[data-diary-stream]"), rootMargin: "100% 0px" }
    );
    io.observe(holder);
    return () => io.disconnect();
  }, [holder, near]);
  if (!near)
    return (
      <div ref={setHolder} className={cn(EDITOR_CLASS, "whitespace-pre-wrap break-words")}>
        {plainText(content)}
      </div>
    );
  return (
    <ErrorBoundary>
      <Editor
        ref={ref}
        key={revision}
        readonly
        initValue={content.length ? content : undefined}
        extensions={extensions}
        className={EDITOR_CLASS}
      />
    </ErrorBoundary>
  );
});

function MomentEditor({
  moment,
  caret,
  fallback,
  onChange,
}: {
  moment: DiaryMoment;
  caret: React.RefObject<BasePoint | null>;
  fallback: React.ReactNode;
  onChange: (content: Descendant[]) => void;
}) {
  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const editorRef = useRef<EditorRef | null>(null);
  // initValue 只在挂载时生效：编辑期间缓存回写不重建
  const initValue = useMemo(() => moment.content, [moment.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ErrorBoundary>
      <ContentEditor
        ref={editorRef}
        contentId={moment.contentId}
        initValue={initValue}
        extensions={extensions}
        readonly={false}
        fallback={fallback}
        onInit={() => requestAnimationFrame(() => placeCaret(editorRef.current, caret.current))}
        onChange={onChange}
        source={{ sourceType: "content", sourceId: moment.contentId }}
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
