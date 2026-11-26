import {
  notebookTranslator,
  notebookNumber,
  notebookCount,
  useNotebookI18n,
  notebookError,
} from "@/features/vibe-learning/i18n";
/**
 * 目录「产物」组：生成的笔记（大纲 / 重点 / 文章 / 导图 / PPT / 报告）、手写笔记、测验集与插件产物，
 * 按更新时间合成一列。＋ 菜单 = 新建笔记 + 内置生成应用 + 插件的 Notebook 输出（排在内置之后）；
 * 测验集点行即开始测验；插件停用后它的产物不列出。
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
import type { PluginEntityRecord } from "@/types/plugin-entities";
import { deleteVLNote, ensureVLNoteResource } from "@/commands/vibe-learning";
import { deletePluginEntity } from "@/commands/plugin-entities";
import {
  notebookOutputIcon,
  useNotebookOutputs,
  type RegisteredPluginNotebookOutput,
} from "@/app/plugins/notebook-outputs";
import QuizTestModal from "../generate/apps/QuizTestModal";
import QuizEditModal from "../generate/apps/QuizEditModal";
import { GENERATE_APPS, NOTE_ICONS, type GenerateAppKey } from "../appMeta";
import { TreeGroupHeader, TreeRow } from "./TreeRow";
import { useNoteTask, usePluginOutputTask, useQuizTask, type VLTask } from "../tasks/store";
const t = notebookTranslator.t;

/** 任务状态标记：进行中 accent、失败 danger、停止 ink-3；完成不标 */
function taskFlag(task: VLTask | undefined) {
  if (!task) return undefined;
  const editing = task.kind === "ppt_edit" || task.kind === "report_edit";
  if (task.status === "running")
    return (
      <span className="text-accent-text">
        {editing ? t("output.rewriting") : t("output.generating")}
      </span>
    );
  if (task.status === "failed") return <span className="text-danger">{t("common.failed")}</span>;
  if (task.status === "cancelled") return <span className="text-ink-3">{t("common.stopped")}</span>;
  return undefined;
}

const spinner = (
  <Loader2 className="text-accent-text size-[15px] animate-spin" strokeWidth={1.75} />
);

type OutputItem =
  | { kind: "note"; time: number; note: VLNote }
  | { kind: "quiz"; time: number; quizSet: VLQuizSet }
  | {
      kind: "plugin";
      time: number;
      entity: PluginEntityRecord;
      output: RegisteredPluginNotebookOutput;
    };

interface OutputGroupProps {
  projectId: number;
  mainDbName: string;
  notes: VLNote[];
  activeNoteId: number | null;
  onOpenNote: (note: VLNote) => void;
  onCreateNote: () => void;
  onGenerate: (key: GenerateAppKey) => void;
  /** 插件产物 */
  pluginOutputs: PluginEntityRecord[];
  activePluginOutputId: number | null;
  onOpenPluginOutput: (entity: PluginEntityRecord) => void;
  onGenerateOutput: (output: RegisteredPluginNotebookOutput) => void;
  onPluginOutputDeleted: (entityId: number) => void;
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
  useNotebookI18n();
  const task = useNoteTask(note.id);
  const generating = task?.status === "running";
  const Icon = NOTE_ICONS[note.type] ?? PenLine;
  return (
    <TreeRow
      icon={generating ? spinner : <Icon className="size-[15px]" strokeWidth={1.75} />}
      title={task && generating ? task.title : note.title || t("common.untitledNote")}
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
                {t("kind.aiEdit")}
              </Menu.Item>
            )}
            <Menu.Item
              icon={<Import className="size-4" strokeWidth={1.75} />}
              onSelect={onAddToResources}
            >
              {t("resource.add")}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
              danger
              icon={<Trash2 className="size-4" strokeWidth={1.75} />}
              onSelect={onDelete}
            >
              {t("common.delete")}
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
  useNotebookI18n();
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
            {notebookCount("stage.questions", quizSet.itemCount)}
            {best !== null && ` · ${best.toFixed(0)}%`}
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
              {t("stage.startQuiz")}
            </Menu.Item>
            {task && (
              <Menu.Item
                icon={<Sparkles className="size-4" strokeWidth={1.75} />}
                onSelect={() => onOpenTask(task.id)}
              >
                {t("stage.process")}
              </Menu.Item>
            )}
            <Menu.Item
              icon={<History className="size-4" strokeWidth={1.75} />}
              onSelect={onRecords}
            >
              {t("output.records")}
            </Menu.Item>
            <Menu.Item icon={<Pencil className="size-4" strokeWidth={1.75} />} onSelect={onEdit}>
              {t("output.editQuestions")}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
              danger
              icon={<Trash2 className="size-4" strokeWidth={1.75} />}
              onSelect={onDelete}
            >
              {t("common.delete")}
            </Menu.Item>
          </>
        )
      }
    />
  );
}

function PluginOutputRow({
  entity,
  output,
  active,
  onOpen,
  onDelete,
}: {
  entity: PluginEntityRecord;
  output: RegisteredPluginNotebookOutput;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  useNotebookI18n();
  const task = usePluginOutputTask(entity.id);
  const generating = task?.status === "running";
  const Icon = notebookOutputIcon(output);
  return (
    <TreeRow
      icon={generating ? spinner : <Icon className="size-[15px]" strokeWidth={1.75} />}
      title={entity.title || output.definition.title}
      active={active}
      flag={taskFlag(task)}
      onClick={onOpen}
      menu={
        generating ? undefined : (
          <Menu.Item
            danger
            icon={<Trash2 className="size-4" strokeWidth={1.75} />}
            onSelect={onDelete}
          >
            {t("common.delete")}
          </Menu.Item>
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
    useNotebookI18n();
    const { projectId, mainDbName, notes, activeNoteId, onNotesChange } = props;
    const outputs = useNotebookOutputs();
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
          ...props.pluginOutputs.flatMap(entity => {
            const output = outputs.find(
              o => o.context.pluginId === entity.pluginId && o.definition.kind === entity.kind
            );
            return output
              ? [{ kind: "plugin" as const, time: entity.updatedAt, entity, output }]
              : [];
          }),
        ].sort((a, b) => b.time - a.time),
      [notes, quizSets, props.pluginOutputs, outputs]
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
          toast.success(t("resource.added"));
        } else {
          toast.info(t("output.alreadyAdded"));
        }
      } catch (error) {
        console.error("Failed to add note to resources:", error);
        toast.error(t("resource.addFailed"));
      }
    });

    const askDeleteNote = (note: VLNote) =>
      setPendingDelete({
        get title() {
          return t("note.delete");
        },
        get description() {
          return t("output.deleteNoteHint", { title: note.title || t("common.untitledNote") });
        },
        action: async () => {
          try {
            await deleteVLNote(note.id);
            props.onNoteDeleted(note.id);
            onNotesChange();
          } catch (error) {
            console.error("Failed to delete note:", error);
            toast.error(t("common.deleteFailed"));
          }
        },
      });

    const askDeleteQuiz = (quizSet: VLQuizSet) =>
      setPendingDelete({
        get title() {
          return t("output.deleteQuiz");
        },
        get description() {
          return t("output.deleteQuizHint", { title: quizSet.name });
        },
        action: async () => {
          try {
            await deleteQuizSet(quizSet.id);
          } catch (error) {
            toast.error(t("common.deleteFailed"));
            throw error;
          }
        },
      });

    const askDeletePluginOutput = (
      entity: PluginEntityRecord,
      output: RegisteredPluginNotebookOutput
    ) =>
      setPendingDelete({
        get title() {
          return t("output.deletePluginTitle", { kind: output.definition.title });
        },
        get description() {
          return t("output.deletePluginHint", { title: entity.title || output.definition.title });
        },
        action: async () => {
          try {
            await deletePluginEntity(mainDbName, entity.pluginId, entity.id, entity.revision);
            props.onPluginOutputDeleted(entity.id);
          } catch (error) {
            console.error("Failed to delete plugin output:", error);
            toast.error(t("common.deleteFailed"));
          }
        },
      });

    const handleStartTest = useMemoizedFn((quizSet: VLQuizSet) => {
      if (quizSet.itemCount === 0) {
        toast.info(t("output.quizEmpty"));
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
          title={t("output.title")}
          count={items.length}
          open={open}
          onToggle={() => setOpen(v => !v)}
          action={
            <Menu
              align="end"
              fit
              trigger={
                <IconButton className="size-[24px]" aria-label={t("output.new")}>
                  <Plus className="size-[15px]" strokeWidth={1.75} />
                </IconButton>
              }
            >
              <Menu.Item
                icon={<PenLine className="size-4" strokeWidth={1.75} />}
                onSelect={props.onCreateNote}
              >
                {t("output.newNote")}
              </Menu.Item>
              <Menu.Separator />
              <Menu.Group>{t("output.generateAll")}</Menu.Group>
              {GENERATE_APPS.map(app => (
                <Menu.Item
                  key={app.key}
                  icon={<app.icon className="size-4" strokeWidth={1.75} />}
                  onSelect={() => props.onGenerate(app.key)}
                >
                  {app.label}
                </Menu.Item>
              ))}
              {outputs.map(output => {
                const Icon = notebookOutputIcon(output);
                return (
                  <Menu.Item
                    key={output.id}
                    icon={<Icon className="size-4" strokeWidth={1.75} />}
                    onSelect={() => props.onGenerateOutput(output)}
                  >
                    {output.definition.title}
                  </Menu.Item>
                );
              })}
            </Menu>
          }
        />
        {quizQuery.isError && (
          <ErrorState
            title={t("output.quizzesFailed")}
            error={notebookError(quizQuery.error, "output.quizzesFailed")}
            actions={[{ label: t("common.retry"), onClick: () => void quizQuery.refetch() }]}
          />
        )}
        {open &&
          (items.length === 0 ? (
            /* 一行够了：能生成什么由标题右侧的生成菜单逐项列着，不在此重复 */
            <p className="text-tau-sm text-ink-3 m-0 px-3 pt-1 pb-3">{t("output.empty")}</p>
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
                if (item.kind === "plugin") {
                  return (
                    <PluginOutputRow
                      key={`p${item.entity.id}`}
                      entity={item.entity}
                      output={item.output}
                      active={item.entity.id === props.activePluginOutputId}
                      onOpen={() => props.onOpenPluginOutput(item.entity)}
                      onDelete={() => askDeletePluginOutput(item.entity, item.output)}
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
          title={t("output.records")}
          context={recordsOf?.name}
          icon={<History className="size-4" strokeWidth={1.75} />}
          size="sm"
        >
          <DialogBody>
            {recordsOf &&
              (recordsQuery.isError ? (
                <ErrorState
                  title={t("output.recordsFailed")}
                  error={notebookError(recordsQuery.error, "output.recordsFailed")}
                  actions={[
                    { label: t("common.retry"), onClick: () => void recordsQuery.refetch() },
                  ]}
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
          confirmText={t("common.delete")}
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
  const { locale } = useNotebookI18n();
  if (loading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="text-ink-3 size-5 animate-spin" strokeWidth={1.75} />
      </div>
    );
  if (records.length === 0)
    return <p className="text-tau-meta text-ink-3 py-10 text-center">{t("output.noRecords")}</p>;
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
              {t("output.correct", {
                correct: notebookNumber(record.correctCount),
                total: notebookNumber(record.totalCount),
              })}
            </div>
            <div className="text-ink-3 text-tau-sm">
              {t("output.duration", {
                m: notebookNumber(Math.floor(record.duration / 60)),
                s: notebookNumber(record.duration % 60),
              })}
            </div>
          </div>
          <span className="text-tau-sm text-ink-3 shrink-0">
            {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
              record.createTime
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
