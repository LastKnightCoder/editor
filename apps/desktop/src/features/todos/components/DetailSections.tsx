/**
 * 抽屉详情 · 内容区：打卡（周期任务）/ 子任务 / 关联材料 / 描述。
 * 写卡片复用 CreateCardDialog、关联已有走公共 EntityPicker，材料正文在 ContentEditDialog 里就地编辑；描述用 ContentEditor。
 */

import { useRef, useState, type ReactNode } from "react";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Layers,
  Lightbulb,
  Link2,
  NotebookPen,
  PenLine,
  Plus,
  SkipForward,
  Undo2,
  Unlink,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Button, IconButton, Menu, cn, toast, useRetainedValue } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import { ContentEditDialog } from "@/components/ContentEditDialog";
import { EntityPicker } from "@/components/EntityPicker";
import { ENTITY_KIND_META } from "@/components/EntityPicker/meta";
import ErrorBoundary from "@/components/ErrorBoundary";
import { createArticle } from "@/commands/article";
import { locateEntity } from "@/commands/entity";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";
import { CreateCardDialog } from "@/features/cards/components/CreateCardDialog";
import { usePage } from "@/page/PageProvider";
import { clampText, richTextPlainText } from "@/utils/richTextText";
import useEditContent from "@/hooks/useEditContent";
import { ECardCategory, type EntityCandidate, type EntityKind, type TodoNoteLink } from "@/types";
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
  count,
  children,
}: {
  title: string;
  count?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="text-ink-2 mb-2 mt-[18px] flex min-h-6 items-center gap-2 text-[12px] font-semibold">
      {title}
      {count != null && <span className="text-ink-3 font-normal tabular-nums">{count}</span>}
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
      <SectionTitle title="打卡" />
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
      <SectionTitle
        title="子任务"
        count={children.length > 0 ? `${done}/${children.length}` : undefined}
      />
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

/** 可关联的类型 → todo_note_link.type（沿用全局搜索 IndexType 口径） */
const NOTE_KINDS = ["card", "article", "project_item", "diary"] satisfies EntityKind[];
const LINK_TYPE: Partial<Record<EntityKind, string>> = {
  card: "card",
  article: "article",
  project_item: "project-item",
  diary: "diary-daily",
};

const NOTE_KIND: Record<string, { label: string; icon: LucideIcon }> = {
  card: ENTITY_KIND_META.card,
  article: ENTITY_KIND_META.article,
  "project-item": ENTITY_KIND_META.project_item,
  "diary-daily": ENTITY_KIND_META.diary,
};
const LINK_KIND: Record<string, EntityKind> = {
  card: "card",
  article: "article",
  "project-item": "project_item",
  "diary-daily": "diary",
};
/** 卡片与无主笔记在弹窗里就地编辑，其余打开所在页面 */
const editsInPlace = (link: TodoNoteLink) => link.type === "card" || isOwnNote(link);

/** legacy 从任务里新建的无主笔记（type = custom）：标题只存在关联上，可改 */
const OWN_NOTE = { label: "笔记", icon: NotebookPen };
const isOwnNote = (link: TodoNoteLink) => !link.type || link.type === "custom";
const noteKind = (link: TodoNoteLink | null) => (link && NOTE_KIND[link.type ?? ""]) || OWN_NOTE;
const noteTitle = (link: TodoNoteLink) =>
  link.title || (link.type === "card" ? "无标题卡片" : `无标题${noteKind(link).label}`);

/** 卡片没有标题字段：取首个非空块作列表标题（与实体检索同口径） */
function cardTitle(content: Descendant[]): string {
  for (const block of content) {
    const text = richTextPlainText([block]);
    if (text) return clampText(text, 80);
  }
  return "";
}

export function NoteLinksSection({
  entry,
  mutations,
}: {
  entry: TodoEntry;
  mutations: TodoMutations;
}) {
  const { navigator } = usePage();
  const [selecting, setSelecting] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = entry.noteLinks.find(link => link.id === editingId) ?? null;
  /* 关闭时保留最后一条内容做退场动画 */
  const shown = useRetainedValue(editing);

  const attach = async (picked: EntityCandidate[]) => {
    try {
      for (const c of picked) {
        if (c.contentId == null) continue;
        await mutations.attachNote(entry.id, c.contentId, c.title, LINK_TYPE[c.kind] ?? c.kind);
      }
      toast.success(`已关联 ${picked.length} 项`);
    } catch {
      toast.error("关联失败");
      throw new Error("attach failed");
    }
  };

  const openLink = async (link: TodoNoteLink) => {
    if (editsInPlace(link)) {
      setEditingId(link.id);
      return;
    }
    const target = await locateEntity({
      contentId: link.contentId,
      kind: LINK_KIND[link.type ?? ""],
    }).catch(() => null);
    if (target?.kind === "article") navigator.push("article-detail", { id: target.id });
    else if (target?.kind === "project_item" && target.projectId != null)
      navigator.push("project-detail", { id: target.projectId, itemId: target.id });
    else if (target?.kind === "diary") navigator.push("diary", { date: target.date });
    else toast.info("原内容已不存在，可以取消关联");
  };

  const createArticleForTask = async () => {
    try {
      const title = entry.title.length > 40 ? `${entry.title.slice(0, 40)}…` : entry.title;
      const article = await createArticle({
        title,
        content: DEFAULT_ARTICLE_CONTENT,
        bannerBg: "",
        bannerPosition: "center",
        isTop: false,
        author: "",
        links: [],
        tags: [],
        isDelete: false,
        count: 0,
      });
      await mutations.attachNote(entry.id, article.contentId, article.title, "article");
      navigator.push("article-detail", { id: article.id });
    } catch {
      toast.error("新建文章失败");
    }
  };

  return (
    <>
      <SectionTitle title="关联材料" count={entry.noteLinks.length || undefined} />
      {entry.noteLinks.length === 0 ? (
        <div className="border-line-1 text-ink-3 flex items-start gap-2 rounded-[12px] border border-dashed px-3.5 py-3 text-[12.5px] leading-[1.7]">
          <Lightbulb className="mt-[3px] size-[14px] shrink-0" strokeWidth={1.75} />
          <span>
            做这件事要用到的资料挂在这里：边做边写一张卡片，或者关联已有的卡片、文章、项目文档、日记。
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entry.noteLinks.map(link => (
            <NoteRow
              key={link.id}
              link={link}
              onOpen={() => void openLink(link)}
              onDetach={() => void mutations.detachNote(entry.id, link.id)}
            />
          ))}
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Menu
          trigger={
            <Button variant="secondary" size="sm" icon={Plus}>
              新建
              <ChevronDown className="size-3" strokeWidth={1.75} />
            </Button>
          }
        >
          <Menu.Group>新建并关联到这个任务</Menu.Group>
          <Menu.Item
            icon={<Layers className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => setCardOpen(true)}
          >
            卡片
          </Menu.Item>
          <Menu.Item
            icon={<FileText className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => void createArticleForTask()}
          >
            文章
          </Menu.Item>
        </Menu>
        <Button variant="secondary" size="sm" icon={Link2} onClick={() => setSelecting(true)}>
          关联已有
        </Button>
      </div>

      <CreateCardDialog
        open={cardOpen}
        defaultCategory={ECardCategory.Temporary}
        onClose={() => setCardOpen(false)}
        onCreated={card =>
          void mutations
            .attachNote(entry.id, card.contentId, cardTitle(card.content), "card")
            .catch(() => toast.error("卡片已保存，但关联到任务失败"))
        }
      />
      <EntityPicker
        open={selecting}
        onClose={() => setSelecting(false)}
        title="关联已有材料"
        subtitle={entry.title}
        kinds={NOTE_KINDS}
        isLinked={c => entry.noteLinks.some(link => link.contentId === c.contentId)}
        onConfirm={attach}
      />
      <ContentEditDialog
        open={editing !== null}
        contentId={shown?.contentId ?? null}
        heading={`编辑${noteKind(shown).label}`}
        subtitle={`关联任务：${entry.title}`}
        title={shown?.type === "card" ? undefined : shown ? noteTitle(shown) : ""}
        onTitleChange={
          shown && isOwnNote(shown)
            ? title => void mutations.renameNote(entry.id, shown.id, title)
            : undefined
        }
        onClose={() => setEditingId(null)}
      />
    </>
  );
}

/** 材料行：样式同问题页材料行——点行打开（卡片就地编辑，其余进所在页面），悬停右上角叠加「打开 / 取消关联」 */
function NoteRow({
  link,
  onOpen,
  onDetach,
}: {
  link: TodoNoteLink;
  onOpen(): void;
  onDetach(): void;
}) {
  const kind = noteKind(link);
  const Icon = kind.icon;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "bg-surface border-line-1 group/note hover:border-ink-3 relative flex cursor-pointer items-center gap-[11px] rounded-[12px] border px-3 py-[9px] outline-none",
        "ease-tau-out transition-[border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]"
      )}
    >
      <span className="text-ink-2 grid size-[26px] shrink-0 place-items-center rounded-[8px] shadow-[inset_0_0_0_1px_var(--tau-line-1)]">
        <Icon className="size-[14px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-normal">{noteTitle(link)}</div>
        <div className="text-ink-3 mt-0.5 text-[11.5px]">
          {kind.label} · {monthDay(link.createTime)}关联
        </div>
      </div>
      <div className="bg-surface absolute right-2 top-2 flex gap-0.5 rounded-[8px] opacity-0 transition-opacity duration-150 group-focus-within/note:opacity-100 group-hover/note:opacity-100">
        <IconButton
          title={editsInPlace(link) ? "编辑" : `打开${kind.label}`}
          onClick={e => {
            e.stopPropagation();
            onOpen();
          }}
          className="size-[22px] rounded-[6px]"
        >
          {editsInPlace(link) ? (
            <PenLine className="size-[13px]" strokeWidth={1.75} />
          ) : (
            <ExternalLink className="size-[13px]" strokeWidth={1.75} />
          )}
        </IconButton>
        <IconButton
          title="取消关联（不删除原内容）"
          onClick={e => {
            e.stopPropagation();
            onDetach();
          }}
          className="size-[22px] rounded-[6px]"
        >
          <Unlink className="size-[13px]" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
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
      <SectionTitle title="描述" />
      <div className="border-line-1 focus-within:border-ink-3 min-h-16 rounded-[10px] border px-3 py-1.5 transition-[border-color] duration-150">
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
