/**
 * 目录「产物」组：生成的笔记（大纲 / 重点 / 文章 / 导图 / PPT / 报告 / 播客）、手写笔记与测验集，
 * 按更新时间合成一列。＋ 菜单 = 新建笔记 + 8 个生成应用；测验集点行即开始测验。
 */

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import {
  CircleHelp,
  History,
  Import,
  Loader2,
  Pencil,
  PenLine,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { ConfirmDialog, Dialog, DialogBody, IconButton, Menu, toast } from "@tau/ui";

import {
  useQuizBestScores,
  useQuizMutations,
  useQuizRecords,
  useQuizSets,
} from "../../../quizQueries";
import { ErrorState } from "@/components/ErrorState";
import type { VLNote } from "@/types/vibe-learning";
import type { VLQuizSet, VLQuizRecord } from "@/types";
import { deleteVLNote, ensureVLNoteResource } from "@/commands/vibe-learning";
import { formatDate } from "@/utils";
import QuizTestModal from "../generate/apps/QuizTestModal";
import QuizEditModal from "../generate/apps/QuizEditModal";
import { GENERATE_APPS, NOTE_ICONS, type GenerateAppKey } from "../appMeta";
import { TreeGroupHeader, TreeRow } from "./TreeRow";
import { useNoteTask, useQuizTask, type VLTask } from "../tasks/store";

/** 任务状态标记：进行中 accent、失败 danger、停止 ink-3；完成不标 */
function taskFlag(task: VLTask | undefined) {
  if (!task) return undefined;
  const editing = task.kind === "ppt_edit" || task.kind === "report_edit";
  if (task.status === "running")
    return <span className="text-accent-text">{editing ? "改写中" : "生成中"}</span>;
  if (task.status === "failed") return <span className="text-danger">失败</span>;
  if (task.status === "cancelled") return <span className="text-ink-3">已停止</span>;
  return undefined;
}

const spinner = (
  <Loader2 className="text-accent-text size-[15px] animate-spin" strokeWidth={1.75} />
);

type OutputItem =
  { kind: "note"; time: number; note: VLNote } | { kind: "quiz"; time: number; quizSet: VLQuizSet };

interface OutputGroupProps {
  projectId: number;
  mainDbName: string;
  notes: VLNote[];
  activeNoteId: number | null;
  onOpenNote: (note: VLNote) => void;
  onCreateNote: () => void;
  onGenerate: (key: GenerateAppKey) => void;
  onEditPPT: (note: VLNote) => void;
  onEditReport: (note: VLNote) => void;
  onNotesChange: () => void;
  onNoteDeleted: (noteId: number) => void;
  onResourcesChange: () => void;
  /** 阅读区正在看的任务（测验生成过程） */
  activeTaskId: string | null;
  onOpenTask: (taskId: string) => void;
}

function NoteRow({
  note,
  active,
  onOpen,
  onAddToResources,
  onDelete,
  onAIEdit,
}: {
  note: VLNote;
  active: boolean;
  onOpen: () => void;
  onAddToResources: () => void;
  onDelete: () => void;
  onAIEdit?: () => void;
}) {
  const task = useNoteTask(note.id);
  const generating = task?.status === "running";
  const Icon = NOTE_ICONS[note.type] ?? PenLine;
  return (
    <TreeRow
      icon={generating ? spinner : <Icon className="size-[15px]" strokeWidth={1.75} />}
      title={task && generating ? task.title : note.title || "无标题笔记"}
      active={active}
      flag={taskFlag(task)}
      onClick={onOpen}
      menu={
        generating ? undefined : (
          <>
            {onAIEdit && (
              <Menu.Item
                icon={<Sparkles className="size-4" strokeWidth={1.75} />}
                onSelect={onAIEdit}
              >
                AI 编辑
              </Menu.Item>
            )}
            <Menu.Item
              icon={<Import className="size-4" strokeWidth={1.75} />}
              onSelect={onAddToResources}
            >
              加入资料
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
              danger
              icon={<Trash2 className="size-4" strokeWidth={1.75} />}
              onSelect={onDelete}
            >
              删除
            </Menu.Item>
          </>
        )
      }
    />
  );
}

function QuizRow({
  quizSet,
  best,
  activeTaskId,
  onOpenTask,
  onStart,
  onRecords,
  onEdit,
  onDelete,
}: {
  quizSet: VLQuizSet;
  best: number | null;
  activeTaskId: string | null;
  onOpenTask: (taskId: string) => void;
  onStart: () => void;
  onRecords: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const task = useQuizTask(quizSet.id);
  const busy = task?.status === "running";
  // 生成中 / 失败时点行看生成过程；完成后点行即开始测验
  const showTask = task && task.status !== "succeeded" && quizSet.itemCount === 0;
  return (
    <TreeRow
      icon={busy ? spinner : <CircleHelp className="size-[15px]" strokeWidth={1.75} />}
      title={quizSet.name}
      active={!!task && task.id === activeTaskId}
      flag={
        taskFlag(task) ?? (
          <span className="text-ink-3">
            {quizSet.itemCount} 题{best !== null && ` · ${best.toFixed(0)}%`}
          </span>
        )
      }
      onClick={() => (task && (showTask || busy) ? onOpenTask(task.id) : onStart())}
      menu={
        busy ? undefined : (
          <>
            <Menu.Item
              icon={<Play className="size-4" strokeWidth={1.75} />}
              disabled={quizSet.itemCount === 0}
              onSelect={onStart}
            >
              开始测验
            </Menu.Item>
            {task && (
              <Menu.Item
                icon={<Sparkles className="size-4" strokeWidth={1.75} />}
                onSelect={() => onOpenTask(task.id)}
              >
                生成过程
              </Menu.Item>
            )}
            <Menu.Item
              icon={<History className="size-4" strokeWidth={1.75} />}
              onSelect={onRecords}
            >
              测验记录
            </Menu.Item>
            <Menu.Item icon={<Pencil className="size-4" strokeWidth={1.75} />} onSelect={onEdit}>
              编辑题目
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
              danger
              icon={<Trash2 className="size-4" strokeWidth={1.75} />}
              onSelect={onDelete}
            >
              删除
            </Menu.Item>
          </>
        )
      }
    />
  );
}

export interface OutputGroupRef {
  /** 生成完成后从执行过程页直接开始测验 */
  startQuiz: (quizSetId: number) => void;
}

export const OutputGroup = forwardRef<OutputGroupRef, OutputGroupProps>(
  function OutputGroup(props, ref) {
    const { projectId, mainDbName, notes, activeNoteId, onNotesChange } = props;
    const [open, setOpen] = useState(true);
    const [pendingDelete, setPendingDelete] = useState<null | {
      title: string;
      description: string;
      action: () => Promise<void>;
    }>(null);
    const [testing, setTesting] = useState<VLQuizSet | null>(null);
    const [recordsOf, setRecordsOf] = useState<VLQuizSet | null>(null);
    const [editingQuiz, setEditingQuiz] = useState<VLQuizSet | null>(null);

    const quizQuery = useQuizSets(projectId);
    const quizSets = quizQuery.sets;
    const scoresQuery = useQuizBestScores(projectId);
    const recordsQuery = useQuizRecords(recordsOf?.id, recordsOf !== null);
    const { deleteQuizSet } = useQuizMutations();

    const items = useMemo<OutputItem[]>(
      () =>
        [
          ...notes.map(note => ({ kind: "note" as const, time: note.updateTime, note })),
          ...quizSets.map(quizSet => ({
            kind: "quiz" as const,
            time: quizSet.updateTime,
            quizSet,
          })),
        ].sort((a, b) => b.time - a.time),
      [notes, quizSets]
    );

    const bestScore = (id: number) => {
      return scoresQuery.scores[id] ?? null;
    };

    const addToResources = useMemoizedFn(async (note: VLNote) => {
      try {
        const result = await ensureVLNoteResource({
          projectId,
          mainDbName,
          contentId: note.contentId,
          title: note.title || "无标题笔记",
          noteType: note.type,
          originalId: note.id,
        });
        if (result.created) {
          props.onResourcesChange();
          toast.success("已加入资料");
        } else {
          toast.info("已在资料里");
        }
      } catch (error) {
        console.error("Failed to add note to resources:", error);
        toast.error("加入资料失败");
      }
    });

    const askDeleteNote = (note: VLNote) =>
      setPendingDelete({
        title: "删除笔记",
        description: `确定删除「${note.title || "无标题笔记"}」吗？`,
        action: async () => {
          try {
            await deleteVLNote(note.id);
            props.onNoteDeleted(note.id);
            onNotesChange();
          } catch (error) {
            console.error("Failed to delete note:", error);
            toast.error("删除失败");
          }
        },
      });

    const askDeleteQuiz = (quizSet: VLQuizSet) =>
      setPendingDelete({
        title: "删除测验集",
        description: `确定删除「${quizSet.name}」吗？它的测验记录也会一并删除。`,
        action: async () => {
          try {
            await deleteQuizSet(quizSet.id);
          } catch (error) {
            toast.error("删除失败");
            throw error;
          }
        },
      });

    const handleStartTest = useMemoizedFn((quizSet: VLQuizSet) => {
      if (quizSet.itemCount === 0) {
        toast.info("这个测验集还没有题目");
        return;
      }
      setTesting(quizSet);
    });

    useImperativeHandle(ref, () => ({
      startQuiz: quizSetId => {
        const quizSet = quizSets.find(q => q.id === quizSetId);
        if (quizSet) void handleStartTest(quizSet);
      },
    }));

    const openRecords = useMemoizedFn((quizSet: VLQuizSet) => {
      setRecordsOf(quizSet);
    });

    return (
      <section>
        <TreeGroupHeader
          title="产物"
          count={items.length}
          open={open}
          onToggle={() => setOpen(v => !v)}
          action={
            <Menu
              align="end"
              fit
              trigger={
                <IconButton className="size-[24px]" aria-label="新建笔记或生成">
                  <Plus className="size-[15px]" strokeWidth={1.75} />
                </IconButton>
              }
            >
              <Menu.Item
                icon={<PenLine className="size-4" strokeWidth={1.75} />}
                onSelect={props.onCreateNote}
              >
                新建笔记
              </Menu.Item>
              <Menu.Separator />
              <Menu.Group>基于全部资料生成</Menu.Group>
              {GENERATE_APPS.map(app => (
                <Menu.Item
                  key={app.key}
                  icon={<app.icon className="size-4" strokeWidth={1.75} />}
                  onSelect={() => props.onGenerate(app.key)}
                >
                  {app.label}
                </Menu.Item>
              ))}
            </Menu>
          }
        />
        {quizQuery.isError && (
          <ErrorState
            title="测验列表加载失败"
            error={quizQuery.error}
            actions={[{ label: "重试", onClick: () => void quizQuery.refetch() }]}
          />
        )}
        {open &&
          (items.length === 0 ? (
            /* 一行够了：能生成什么由标题右侧的生成菜单逐项列着，不在此重复 */
            <p className="text-tau-sm text-ink-3 m-0 px-3 pb-3 pt-1">生成的内容会放在这里</p>
          ) : (
            <div className="flex flex-col gap-px">
              {items.map(item => {
                if (item.kind === "note") {
                  const { note } = item;
                  return (
                    <NoteRow
                      key={`n${note.id}`}
                      note={note}
                      active={note.id === activeNoteId}
                      onOpen={() => props.onOpenNote(note)}
                      onAddToResources={() => void addToResources(note)}
                      onDelete={() => askDeleteNote(note)}
                      onAIEdit={
                        note.type === "ppt"
                          ? () => props.onEditPPT(note)
                          : note.type === "report"
                            ? () => props.onEditReport(note)
                            : undefined
                      }
                    />
                  );
                }
                const { quizSet } = item;
                return (
                  <QuizRow
                    key={`q${quizSet.id}`}
                    quizSet={quizSet}
                    best={bestScore(quizSet.id)}
                    activeTaskId={props.activeTaskId}
                    onOpenTask={props.onOpenTask}
                    onStart={() => void handleStartTest(quizSet)}
                    onRecords={() => void openRecords(quizSet)}
                    onEdit={() => setEditingQuiz(quizSet)}
                    onDelete={() => askDeleteQuiz(quizSet)}
                  />
                );
              })}
            </div>
          ))}

        <QuizTestModal
          open={testing !== null}
          quizSet={testing}
          onClose={() => {
            setTesting(null);
          }}
        />
        <QuizEditModal
          open={editingQuiz !== null}
          quizSet={quizSets.find(item => item.id === editingQuiz?.id) ?? editingQuiz}
          onClose={() => {
            setEditingQuiz(null);
          }}
        />
        <Dialog
          open={recordsOf !== null}
          onOpenChange={next => !next && setRecordsOf(null)}
          title="测验记录"
          context={recordsOf?.name}
          icon={<History className="size-4" strokeWidth={1.75} />}
          size="sm"
        >
          <DialogBody>
            {recordsOf &&
              (recordsQuery.isError ? (
                <ErrorState
                  title="测验记录加载失败"
                  error={recordsQuery.error}
                  actions={[{ label: "重试", onClick: () => void recordsQuery.refetch() }]}
                />
              ) : (
                <QuizRecords records={recordsQuery.records} loading={recordsQuery.isPending} />
              ))}
          </DialogBody>
        </Dialog>
        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={next => !next && setPendingDelete(null)}
          title={pendingDelete?.title ?? ""}
          description={pendingDelete?.description ?? ""}
          danger
          confirmText="删除"
          onConfirm={async () => {
            const pending = pendingDelete;
            await pending?.action();
            setPendingDelete(null);
          }}
        />
      </section>
    );
  }
);

/** 测验记录：分数按及格线着语义色，其余中性 */
function QuizRecords({ records, loading }: { records: VLQuizRecord[]; loading: boolean }) {
  if (loading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="text-ink-3 size-5 animate-spin" strokeWidth={1.75} />
      </div>
    );
  if (records.length === 0)
    return <p className="text-tau-meta text-ink-3 py-10 text-center">还没有测验记录</p>;
  return (
    <div className="flex flex-col">
      {records.map(record => (
        <div key={record.id} className="flex items-center gap-4 py-2.5">
          <span
            className={
              "w-[52px] text-[18px] font-semibold tabular-nums " +
              (record.score >= 80 ? "text-ok" : record.score >= 60 ? "text-ink-1" : "text-danger")
            }
          >
            {record.score.toFixed(0)}%
          </span>
          <div className="text-tau-meta min-w-0 flex-1">
            <div className="text-ink-1">
              答对 {record.correctCount} / {record.totalCount}
            </div>
            <div className="text-ink-3 text-tau-sm">
              用时 {Math.floor(record.duration / 60)} 分 {record.duration % 60} 秒
            </div>
          </div>
          <span className="text-tau-sm text-ink-3 shrink-0">
            {formatDate(record.createTime, true)}
          </span>
        </div>
      ))}
    </div>
  );
}
