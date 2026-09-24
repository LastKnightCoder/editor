/**
 * 抽屉详情 · 内容区：打卡（周期任务）/ 子任务 / 关联笔记 / 描述。
 * 关联笔记与描述复用 legacy 共享件（§6.1 共存期复用，04 清单 §todos「明确保留」登记）：
 * ContentSelectorModal（选已有内容）、RichTextEditModal（编辑笔记正文）、ContentEditor（描述）。
 */

import { useRef, useState, type ReactNode } from "react";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import {
  BookOpen,
  CalendarDays,
  FileText,
  FolderKanban,
  NotebookPen,
  Plus,
  SkipForward,
  SquarePen,
  Undo2,
  X,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Button, IconButton, Menu, cn, toast } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import ErrorBoundary from "@/components/ErrorBoundary";
import RichTextEditModal from "@/components/RichTextEditModal";
import useEditContent from "@/hooks/useEditContent";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import type { IndexType, SearchResult, TodoNoteLink } from "@/types";
import {
  doneToday,
  habitCells,
  habitStats,
  monthDay,
  nextOccurrence,
  scheduledToday,
  startOfDay,
  streakOf,
  dayWord,
} from "../model";
import type { TodoMutations } from "../queries";
import type { TodoEntry, TodoSnapshot } from "../types";
import { CELL_CLASS, CELL_TITLE } from "./habitCellStyle";
import { TodoCheck } from "./TodoBits";

export function SectionTitle({
  title,
  en,
  children,
}: {
  title: string;
  en: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-2 mt-[18px] flex items-center gap-2">
      <span className="text-ink-2 text-[12px] font-semibold">{title}</span>
      <span className="text-ink-3 font-mono text-[11px]">{en}</span>
      <span className="flex-1" />
      {children}
    </div>
  );
}

/* ---------- 打卡 ---------- */

export function HabitSection({
  entry,
  now,
  mutations,
}: {
  entry: TodoEntry;
  now: number;
  mutations: TodoMutations;
}) {
  if (entry.type !== "recurring" || !entry.recurrence) return null;
  const cells = habitCells(entry, now);
  const stats = habitStats(entry, now);
  const isToday = scheduledToday(entry, now);
  const checked = doneToday(entry, now);
  const skipped = entry.occurrences.get(startOfDay(now)) === "skip";
  const next = nextOccurrence(entry.recurrence, now, 1);

  return (
    <>
      <SectionTitle title="打卡" en="habit" />
      <div className="bg-page flex flex-col gap-3 rounded-[12px] px-3.5 py-3">
        <div className="flex gap-[22px]">
          <Stat value={streakOf(entry, now)} label="连续打卡" />
          <Stat value={`${stats.rate}%`} label="近 12 周完成率" />
          <Stat value={stats.total} label="近一年打卡" />
        </div>
        <div
          className="grid grid-flow-col grid-rows-[repeat(7,11px)] justify-start gap-[3px]"
          aria-label="近 12 周打卡记录"
        >
          {cells.map(cell => {
            // 过去的计划日可补打卡 / 撤销（legacy 热力格同款能力）
            const editable =
              cell.state === "done" || cell.state === "miss" || cell.state === "skip";
            return (
              <button
                key={cell.day}
                type="button"
                disabled={!editable}
                title={`${monthDay(cell.day)} ${CELL_TITLE[cell.state]}${editable ? " · 点击切换" : ""}`}
                onClick={() =>
                  void mutations.setOccurrence(
                    entry,
                    cell.day,
                    cell.state === "done" ? null : "done"
                  )
                }
                className={cn(
                  "block size-[11px] rounded-[3px] disabled:cursor-default",
                  CELL_CLASS[cell.state],
                  editable && "hover:brightness-95"
                )}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          {isToday ? (
            <>
              <Button
                size="sm"
                variant={checked ? "secondary" : "primary"}
                icon={checked ? Undo2 : Check}
                onClick={() => void mutations.setOccurrence(entry, now, checked ? null : "done")}
              >
                {checked ? "撤销今日打卡" : "今日打卡"}
              </Button>
              {!checked && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={skipped ? Undo2 : SkipForward}
                  onClick={() => void mutations.setOccurrence(entry, now, skipped ? null : "skip")}
                >
                  {skipped ? "取消跳过" : "跳过今天"}
                </Button>
              )}
            </>
          ) : (
            <span className="text-ink-3 text-[12px]">
              今天不是计划日{next != null && ` · 下次 ${dayWord(next, now)}`}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex flex-col">
      <b className="text-[19px] font-semibold tabular-nums leading-[1.2]">{value}</b>
      <span className="text-ink-3 text-[11.5px]">{label}</span>
    </div>
  );
}

/* ---------- 子任务 ---------- */

export function SubtaskSection({
  entry,
  snapshot,
  mutations,
  onOpen,
}: {
  entry: TodoEntry;
  snapshot: TodoSnapshot;
  mutations: TodoMutations;
  onOpen(entry: TodoEntry): void;
}) {
  const [draft, setDraft] = useState("");
  const children = entry.childIds
    .map(id => snapshot.byId.get(id))
    .filter((c): c is TodoEntry => Boolean(c));
  const done = children.filter(c => c.isCompleted).length;

  return (
    <>
      <SectionTitle title="子任务" en="subtasks">
        {children.length > 0 && (
          <span className="text-ink-3 text-[11.5px] tabular-nums">
            {done}/{children.length}
          </span>
        )}
      </SectionTitle>
      {children.map(child => (
        <div
          key={child.id}
          className="hover:bg-hover -mx-1.5 flex min-h-[30px] items-center gap-2.5 rounded-[8px] px-1.5"
        >
          <TodoCheck
            size="sm"
            checked={child.isCompleted}
            label={child.isCompleted ? "标记未完成" : "完成"}
            onToggle={() => void mutations.setCompleted(child, !child.isCompleted)}
          />
          <button
            type="button"
            onClick={() => onOpen(child)}
            className={cn(
              "text-tau-meta min-w-0 flex-1 truncate text-left",
              child.isCompleted && "text-ink-3 line-through"
            )}
          >
            {child.title || "未命名任务"}
          </button>
        </div>
      ))}
      <label className="text-ink-3 hover:bg-hover hover:text-ink-2 -mx-1.5 flex min-h-[30px] items-center gap-2.5 rounded-[8px] px-1.5">
        <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing || !draft.trim()) return;
            const title = draft.trim();
            setDraft("");
            mutations.addSubtask(entry, title).catch(() => toast.error("添加子任务失败"));
          }}
          placeholder="添加子任务，回车确认"
          className="text-tau-meta text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
    </>
  );
}

/* ---------- 关联笔记 ---------- */

const NOTE_TYPES = [
  "card",
  "article",
  "project-item",
  "document-item",
  "diary-daily",
] satisfies IndexType[];

const NOTE_KIND: Record<string, { label: string; icon: LucideIcon }> = {
  card: { label: "卡片", icon: SquarePen },
  article: { label: "文章", icon: FileText },
  "project-item": { label: "项目", icon: FolderKanban },
  "document-item": { label: "文档", icon: BookOpen },
  "diary-daily": { label: "日记", icon: CalendarDays },
};

export function NoteLinksSection({
  entry,
  mutations,
}: {
  entry: TodoEntry;
  mutations: TodoMutations;
}) {
  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const [selecting, setSelecting] = useState(false);
  const [editing, setEditing] = useState<{
    link: TodoNoteLink | null;
    contentId: number;
    title: string;
  } | null>(null);

  const attach = async (picked: SearchResult | SearchResult[]) => {
    const first = Array.isArray(picked) ? picked[0] : picked;
    if (!first) return;
    try {
      await mutations.attachNote(entry.id, first.contentId, first.title || "", first.type);
      toast.success("已关联");
      setSelecting(false);
    } catch {
      toast.error("关联失败");
    }
  };

  const create = async () => {
    try {
      const { link, contentId } = await mutations.createNote(entry.id);
      setEditing({ link, contentId, title: link.title || "未命名文档" });
    } catch {
      toast.error("新建笔记失败");
    }
  };

  return (
    <>
      <SectionTitle title="关联笔记" en="notes">
        <Menu
          align="end"
          trigger={
            <IconButton title="关联笔记" className="size-[22px] rounded-[6px]">
              <Plus className="size-[13px]" strokeWidth={1.75} />
            </IconButton>
          }
        >
          <Menu.Item
            icon={<BookOpen className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => setSelecting(true)}
          >
            关联已有内容…
          </Menu.Item>
          <Menu.Item
            icon={<NotebookPen className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => void create()}
          >
            新建笔记并关联
          </Menu.Item>
        </Menu>
      </SectionTitle>
      {entry.noteLinks.length === 0 ? (
        <p className="text-ink-3 text-[12px]">暂无关联——可关联卡片、文章、项目条目、文档或日记</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entry.noteLinks.map(link => {
            const kind = NOTE_KIND[link.type ?? ""] ?? { label: "笔记", icon: NotebookPen };
            const Icon = kind.icon;
            return (
              <span
                key={link.id}
                className="border-line-1 bg-surface hover:border-ink-3 group/note inline-flex h-7 max-w-full items-center gap-1.5 rounded-[8px] border pl-2 pr-1 text-[12px]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      link,
                      contentId: link.contentId,
                      title: link.title || "未命名文档",
                    })
                  }
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <Icon className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
                  <span className="text-ink-3 text-[10.5px]">{kind.label}</span>
                  <span className="truncate">{link.title || "未命名文档"}</span>
                </button>
                <button
                  type="button"
                  aria-label="取消关联"
                  title="取消关联（不删除原内容）"
                  onClick={() => void mutations.detachNote(entry.id, link.id)}
                  className="text-ink-3 hover:bg-hover hover:text-ink-1 grid size-5 place-items-center rounded-[5px] opacity-0 focus-visible:opacity-100 group-hover/note:opacity-100"
                >
                  <X className="size-3" strokeWidth={2} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <ContentSelectorModal
        open={selecting}
        onCancel={() => setSelecting(false)}
        onSelect={picked => void attach(picked)}
        contentType={NOTE_TYPES}
        extensions={extensions}
        title="选择要关联的内容"
        emptyDescription="未找到相关内容"
        multiple={false}
        excludeContentIds={entry.noteLinks.map(link => link.contentId)}
      />
      {editing && (
        <RichTextEditModal
          visible
          contentId={editing.contentId}
          title={editing.title}
          onClose={() => setEditing(null)}
          onTitleChange={title => {
            if (editing.link) void mutations.renameNote(entry.id, editing.link.id, title);
          }}
        />
      )}
    </>
  );
}

/* ---------- 描述 ---------- */

const EMPTY_DESC: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Descendant,
];

/** 空文档判定：只有空段落（图片、代码块等非段落节点算有内容） */
function isEmptyContent(content: Descendant[]): boolean {
  return content.every(node => {
    const el = node as { type?: string; children?: { text?: unknown }[] };
    // 段落内只有空文本叶子才算空（行内图片 / 公式等非文本叶子没有 text 字段）
    return el.type === "paragraph" && (el.children ?? []).every(child => child.text === "");
  });
}

export function DescriptionSection({
  entry,
  mutations,
}: {
  entry: TodoEntry;
  mutations: TodoMutations;
}) {
  const editorRef = useRef<EditorRef>(null);
  const creating = useRef(false);
  const { throttleHandleEditorContentChange } = useEditContent(
    entry.descriptionContentId ?? undefined,
    content => editorRef.current?.setEditorValue(content)
  );

  const handleChange = (content: Descendant[]) => {
    if (isEmptyContent(content) && !entry.descriptionContentId) return;
    if (entry.descriptionContentId) {
      throttleHandleEditorContentChange(content);
    } else if (!creating.current) {
      // 首次写入非空内容才建 content（legacy 同口径，避免空描述占库）
      creating.current = true;
      mutations
        .attachDescription(entry, content)
        .catch(() => toast.error("保存描述失败"))
        .finally(() => (creating.current = false));
    }
  };

  return (
    <>
      <SectionTitle title="描述" en="description" />
      <div className="hover:bg-hover focus-within:bg-surface -mx-2.5 min-h-16 rounded-[10px] px-2.5 py-1.5 focus-within:shadow-[inset_0_0_0_1px_var(--tau-line-1)]">
        <ErrorBoundary>
          <ContentEditor
            key={entry.id}
            ref={editorRef}
            contentId={entry.descriptionContentId ?? undefined}
            initValue={entry.descriptionContent?.length ? entry.descriptionContent : EMPTY_DESC}
            onChange={handleChange}
            readonly={false}
            placeHolder="添加描述…（/ 唤起块菜单）"
            className="text-tau-body min-h-12"
          />
        </ErrorBoundary>
      </div>
    </>
  );
}
