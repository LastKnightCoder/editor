/**
 * 问题详情抽屉（非模态 Drawer，盖在列表右侧；不压暗列表，Esc 经页面浮层仲裁关闭）。
 * 头部：标题（即改即存）→ 分组 Menu + 提出时间 · 更多菜单；正文：状态三段 → 背景（富文本）→ 我的答案 →
 * 探究材料 → 探究对话 → 动作（写卡片 / 新建 ▾ / 关联已有）→ 探究轨迹。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Descendant } from "slate";
import {
  ChevronDown,
  FileText,
  FlaskConical,
  FolderKanban,
  Layers,
  Lightbulb,
  Link2,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Plus,
  Presentation,
} from "lucide-react";
import { Button, Drawer, IconButton, Loading, Menu, cn, toast, useRetainedValue } from "@tau/ui";
import type { EditorRef } from "@tau/editor";
import ContentEditor from "@/components/ContentEditor";
import { ErrorBoundary } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { QuestionGroupDTO } from "@/commands/question-group";
import type {
  QuestionChat,
  QuestionDetail as Detail,
  QuestionMaterial,
  QuestionStatus,
} from "@/types";
import { STATUS_META, STATUS_STEPS, relativeDay, trajectoryStats } from "../model";
import { questionMutations, type CreatableKind } from "../queries";
import { ChatList } from "./ChatList";
import { MaterialList } from "./MaterialList";
import { Composition, GroupDot, StatusRing } from "./QuestionBits";
import { Trajectory } from "./Trajectory";
import { getDescriptionKit } from "@/services/editorKit";

const EMPTY_DESC: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Descendant,
];

type DetailQuestion = Detail["question"];

export function QuestionDrawer({
  open,
  detail,
  groups,
  hiddenMaterials,
  now,
  onSetStatus,
  onMove,
  onOpenMaterial,
  onClickMaterial,
  onUnlink,
  hiddenChats,
  onOpenChat,
  onOpenChatPage,
  onUnlinkChat,
  onOpenNotebook,
  onDiscuss,
  onWriteCard,
  onWriteAnswer,
  onCreate,
  onLink,
  renderMenu,
  onClose,
}: {
  /** 有选中问题即打开（详情可能还在加载） */
  open: boolean;
  /** 选中问题的详情；加载中为 null */
  detail: Detail | null;
  groups: QuestionGroupDTO[];
  /** 解除关联暂存中的材料（撤销窗口内先从视图隐藏） */
  hiddenMaterials: ReadonlySet<number>;
  now: number;
  onSetStatus(question: DetailQuestion, status: QuestionStatus): void;
  onMove(question: DetailQuestion, groupId: number): void;
  onOpenMaterial(material: QuestionMaterial): void;
  /** 点材料行：可预览的弹窗预览，其余同「打开」 */
  onClickMaterial(material: QuestionMaterial): void;
  onUnlink(material: QuestionMaterial): void;
  /** 解除关联暂存中的对话 */
  hiddenChats: ReadonlySet<number>;
  /** 在右侧停靠栏打开对话 */
  onOpenChat(chat: QuestionChat): void;
  /** 在对话页打开（定位到转出问题的那条消息） */
  onOpenChatPage(chat: QuestionChat): void;
  onUnlinkChat(chat: QuestionChat): void;
  onOpenNotebook(id: number): void;
  /** 围绕这个问题开一次新对话 */
  onDiscuss(): void;
  onWriteCard(): void;
  onWriteAnswer(): void;
  onCreate(kind: CreatableKind): void;
  onLink(): void;
  renderMenu(question: DetailQuestion): ReactNode;
  onClose(): void;
}) {
  useOverlayDismiss(onClose, open);
  /* 关闭时保留最后一条内容做退场动画；打开中切换问题时不沿用旧内容（避免对着旧问题操作） */
  const retained = useRetainedValue(detail);
  const current = open ? detail : retained;
  const question = current?.question;
  const group = question ? groups.find(g => g.id === question.groupId) : undefined;

  return (
    <Drawer
      modal={false}
      open={open}
      onOpenChange={next => !next && onClose()}
      size="md"
      label="问题详情"
      className="top-0"
      title={
        question && (
          <TitleEditor
            key={question.id}
            questionId={question.id}
            value={question.questionContent}
          />
        )
      }
      subtitle={
        question && (
          <span className="flex items-center gap-2 text-[11.5px]">
            <Menu
              trigger={
                <button
                  type="button"
                  className="text-ink-2 hover:bg-hover -ml-1 flex h-[22px] items-center gap-1.5 rounded-[6px] px-1 outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
                >
                  <GroupDot color={group?.color} />
                  {group?.title ?? "未分组"}
                  <ChevronDown className="text-ink-3 size-3" strokeWidth={1.75} />
                </button>
              }
            >
              <Menu.Group>移动到分组</Menu.Group>
              {groups.map(g => (
                <Menu.Item
                  key={g.id}
                  icon={<GroupDot color={g.color} />}
                  onSelect={() => g.id !== question.groupId && onMove(question, g.id)}
                >
                  {g.title}
                </Menu.Item>
              ))}
            </Menu>
            <span>{relativeDay(question.createTime, now)}提出</span>
          </span>
        )
      }
      actions={
        question && (
          <Menu
            align="end"
            trigger={
              <IconButton title="更多">
                <MoreHorizontal className="size-[15px]" strokeWidth={1.75} />
              </IconButton>
            }
          >
            {renderMenu(question)}
          </Menu>
        )
      }
    >
      {current ? (
        // 按问题 id 重挂：背景编辑器等非受控区块切换问题时必须重置
        <DetailBody
          key={current.question.id}
          detail={current}
          hiddenMaterials={hiddenMaterials}
          now={now}
          onSetStatus={status => onSetStatus(current.question, status)}
          onOpenMaterial={onOpenMaterial}
          onClickMaterial={onClickMaterial}
          onUnlink={onUnlink}
          hiddenChats={hiddenChats}
          onOpenChat={onOpenChat}
          onOpenChatPage={onOpenChatPage}
          onUnlinkChat={onUnlinkChat}
          onOpenNotebook={onOpenNotebook}
          onDiscuss={onDiscuss}
          onWriteCard={onWriteCard}
          onWriteAnswer={onWriteAnswer}
          onCreate={onCreate}
          onLink={onLink}
        />
      ) : (
        <Loading />
      )}
    </Drawer>
  );
}

function DetailBody({
  detail,
  hiddenMaterials,
  now,
  onSetStatus,
  onOpenMaterial,
  onClickMaterial,
  onUnlink,
  hiddenChats,
  onOpenChat,
  onOpenChatPage,
  onUnlinkChat,
  onOpenNotebook,
  onDiscuss,
  onWriteCard,
  onWriteAnswer,
  onCreate,
  onLink,
}: {
  detail: Detail;
  hiddenMaterials: ReadonlySet<number>;
  now: number;
  onSetStatus(status: QuestionStatus): void;
  onOpenMaterial(material: QuestionMaterial): void;
  onClickMaterial(material: QuestionMaterial): void;
  onUnlink(material: QuestionMaterial): void;
  hiddenChats: ReadonlySet<number>;
  /** 在右侧停靠栏打开对话 */
  onOpenChat(chat: QuestionChat): void;
  /** 在对话页打开（定位到转出问题的那条消息） */
  onOpenChatPage(chat: QuestionChat): void;
  onUnlinkChat(chat: QuestionChat): void;
  onOpenNotebook(id: number): void;
  /** 围绕这个问题开一次新对话 */
  onDiscuss(): void;
  onWriteCard(): void;
  onWriteAnswer(): void;
  onCreate(kind: CreatableKind): void;
  onLink(): void;
}) {
  const { question, events } = detail;
  const materials = detail.materials.filter(m => !hiddenMaterials.has(m.id));
  const answers = materials.filter(m => m.targetType === "answer");
  const refs = materials.filter(m => m.targetType !== "answer");
  const chats = detail.chats.filter(c => !hiddenChats.has(c.id));
  const refCounts: Partial<Record<QuestionMaterial["targetType"], number>> = {};
  refs.forEach(m => (refCounts[m.targetType] = (refCounts[m.targetType] ?? 0) + 1));

  return (
    <>
      <div role="radiogroup" aria-label="状态" className="grid grid-cols-3 gap-1">
        {STATUS_STEPS.map((status, idx) => {
          const on = question.status === status;
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={on}
              title={`${STATUS_META[status].label}（${idx + 1}）`}
              onClick={() => !on && onSetStatus(status)}
              className={cn(
                "ease-tau-out flex h-8 items-center gap-[7px] rounded-[9px] border px-2.5 text-[12.5px] outline-none transition-[background,color,border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                !on && "border-line-1 text-ink-3 hover:bg-hover hover:text-ink-1",
                on && "border-transparent font-semibold",
                on && status === "not_started" && "bg-hover text-ink-1",
                on && status === "in_progress" && "bg-accent-soft text-accent-text",
                on && status === "resolved" && "bg-ok-soft text-ok"
              )}
            >
              <StatusRing status={status} size="sm" />
              {STATUS_META[status].label}
            </button>
          );
        })}
      </div>

      {detail.notebook && (
        <button
          type="button"
          onClick={() => onOpenNotebook(detail.notebook!.id)}
          className="text-ink-2 hover:text-ink-1 hover:bg-hover mt-2.5 flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-[12.5px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
        >
          <FlaskConical className="size-[14px] shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate">已立项 · Notebook「{detail.notebook.title}」</span>
        </button>
      )}

      <SectionTitle>背景</SectionTitle>
      <DescriptionEditor
        key={question.id}
        questionId={question.id}
        title={question.questionContent}
        value={question.description}
      />

      <SectionTitle
        action={
          answers.length === 0 ? (
            <Button variant="ghost" size="sm" icon={PenLine} onClick={onWriteAnswer}>
              写答案
            </Button>
          ) : (
            <Button variant="ghost" size="sm" icon={Plus} onClick={onWriteAnswer}>
              再写一段
            </Button>
          )
        }
      >
        我的答案
      </SectionTitle>
      {answers.length ? (
        <MaterialList
          materials={answers}
          now={now}
          onClick={onClickMaterial}
          onOpen={onOpenMaterial}
          onUnlink={onUnlink}
        />
      ) : (
        <Hint>
          {question.status === "resolved"
            ? "已标为解答，但还没有用自己的话写下结论。"
            : refs.length >= 2
              ? `已经积累了 ${refs.length} 份材料。试着不看材料，用自己的话写下答案——写不出来的地方，就是还没弄懂的地方。`
              : "材料够了，就用自己的话把答案写下来。"}
        </Hint>
      )}

      <SectionTitle action={<Composition counts={refCounts} />} count={refs.length || undefined}>
        探究材料
      </SectionTitle>
      {refs.length ? (
        <MaterialList
          materials={refs}
          now={now}
          onClick={onClickMaterial}
          onOpen={onOpenMaterial}
          onUnlink={onUnlink}
        />
      ) : (
        <Hint icon>
          从这里开始探究：读到什么、想到什么，写成一张卡片挂上来；或者关联已有的卡片、文章、划线、对话。
        </Hint>
      )}
      {chats.length > 0 && (
        <>
          <SectionTitle count={chats.length}>探究对话</SectionTitle>
          <ChatList
            chats={chats}
            now={now}
            onOpen={onOpenChat}
            onOpenPage={onOpenChatPage}
            onUnlink={onUnlinkChat}
          />
        </>
      )}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button variant="secondary" size="sm" icon={Layers} onClick={onWriteCard}>
          写一张卡片
        </Button>
        <Menu
          trigger={
            <Button variant="secondary" size="sm" icon={Plus}>
              新建
              <ChevronDown className="size-3" strokeWidth={1.75} />
            </Button>
          }
        >
          <Menu.Group>新建并挂到这个问题</Menu.Group>
          <Menu.Item
            icon={<FileText className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => onCreate("article")}
          >
            文章
          </Menu.Item>
          <Menu.Item
            icon={<Presentation className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => onCreate("white_board")}
          >
            白板
          </Menu.Item>
          <Menu.Item
            icon={<FolderKanban className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => onCreate("project")}
          >
            项目
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item
            icon={<PenLine className="size-[15px]" strokeWidth={1.75} />}
            onSelect={onWriteAnswer}
          >
            独立答案
          </Menu.Item>
        </Menu>
        <Button variant="secondary" size="sm" icon={MessageCircle} onClick={onDiscuss}>
          围绕它聊
        </Button>
        <Button variant="secondary" size="sm" icon={Link2} onClick={onLink}>
          关联已有
          <kbd className="bg-hover text-ink-2 ml-0.5 rounded-[4px] px-1 font-mono text-[10px]">
            L
          </kbd>
        </Button>
      </div>

      <SectionTitle
        action={
          <span className="text-ink-3 text-[11.5px] font-normal">
            {trajectoryStats(question, materials.length, events, now)}
          </span>
        }
      >
        探究轨迹
      </SectionTitle>
      <Trajectory
        events={events}
        chats={detail.chats}
        now={now}
        onOpenChat={onOpenChat}
        onAddNote={async text => {
          await questionMutations.addNote(question.id, text);
        }}
      />
    </>
  );
}

function SectionTitle({
  children,
  action,
  count,
}: {
  children: ReactNode;
  action?: ReactNode;
  count?: number;
}) {
  return (
    <div className="text-ink-2 mb-2 mt-[18px] flex min-h-6 items-center gap-2 text-[12px] font-semibold">
      {children}
      {count != null && <span className="text-ink-3 font-normal tabular-nums">{count}</span>}
      <span className="flex-1" />
      {action}
    </div>
  );
}

function Hint({ children, icon = false }: { children: ReactNode; icon?: boolean }) {
  return (
    <div className="border-line-1 text-ink-3 flex items-start gap-2 rounded-[12px] border border-dashed px-3.5 py-3 text-[12.5px] leading-[1.7]">
      {icon && <Lightbulb className="mt-[3px] size-[14px] shrink-0" strokeWidth={1.75} />}
      <span>{children}</span>
    </div>
  );
}

/** 标题即改即存：失焦或回车提交，Esc 放弃 */
function TitleEditor({ questionId, value }: { questionId: number; value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const commit = () => {
    const next = text.trim();
    if (!next) {
      setText(value);
      return;
    }
    if (next !== value)
      questionMutations.rename(questionId, next).catch(() => toast.error("保存标题失败"));
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={text}
      spellCheck={false}
      aria-label="问题"
      onChange={e => setText(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          setText(value);
          requestAnimationFrame(() => ref.current?.blur());
        }
      }}
      className="block min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-[16px] font-semibold leading-[1.5] tracking-[-0.005em] outline-none"
    />
  );
}

/** 问题背景：存于 questions.description（不是独立 content），停笔 800ms 后保存，切走时立即保存 */
function DescriptionEditor({
  questionId,
  title,
  value,
}: {
  questionId: number;
  title: string;
  value?: Descendant[];
}) {
  const editorRef = useRef<EditorRef>(null);
  const pending = useRef<Descendant[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef(title);
  titleRef.current = title;
  // 选区变化也会触发 onChange：与上次落库内容相同则跳过
  const saved = useRef(JSON.stringify(value ?? EMPTY_DESC));

  const flush = () => {
    window.clearTimeout(timer.current);
    const content = pending.current;
    pending.current = null;
    if (!content) return;
    const serialized = JSON.stringify(content);
    if (serialized === saved.current) return;
    saved.current = serialized;
    questionMutations
      .rename(questionId, titleRef.current, content)
      .catch(() => toast.error("保存背景失败"));
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  return (
    <div className="border-line-1 focus-within:border-ink-3 min-h-16 rounded-[10px] border px-3 py-1.5 transition-[border-color] duration-150">
      <ErrorBoundary>
        <ContentEditor
          ref={editorRef}
          kit={getDescriptionKit()}
          initValue={value?.length ? value : EMPTY_DESC}
          readonly={false}
          onChange={content => {
            pending.current = content;
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => flushRef.current(), 800);
          }}
          placeHolder="问题背景：在哪里遇到的、已经知道什么、卡在哪一步…"
          className="text-tau-body min-h-12"
        />
      </ErrorBoundary>
    </div>
  );
}
