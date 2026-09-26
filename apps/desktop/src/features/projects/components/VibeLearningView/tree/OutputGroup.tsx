/**
 * 目录「产物」组：生成的笔记（大纲 / 重点 / 文章 / 导图 / PPT / 报告 / 播客）、手写笔记与测验集，
 * 按更新时间合成一列。＋ 菜单 = 新建笔记 + 8 个生成应用；测验集点行即开始测验。
 */

import { useEffect, useMemo, useState } from "react";
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
import { ConfirmDialog, Dialog, IconButton, Menu, toast } from "@tau/ui";

import useVLQuizStore from "@/stores/useVLQuizStore";
import useOutlineGenerationStore from "@/stores/useOutlineGenerationStore";
import type { VLNote } from "@/types/vibe-learning";
import type { VLQuizSet, VLQuizRecord } from "@/types";
import { deleteVLNote, ensureVLNoteResource } from "@/commands/vibe-learning";
import { formatDate } from "@/utils";
import QuizTestModal from "../generate/apps/QuizTestModal";
import QuizEditModal from "../generate/apps/QuizEditModal";
import { GENERATE_APPS, NOTE_ICONS, type GenerateAppKey } from "../appMeta";
import { TreeGroupHeader, TreeRow } from "./TreeRow";

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
  const generating = useOutlineGenerationStore(s => s.generatingNoteIds.has(note.id));
  const Icon = NOTE_ICONS[note.type] ?? PenLine;
  return (
    <TreeRow
      icon={
        generating ? (
          <Loader2 className="text-accent-text size-[15px] animate-spin" strokeWidth={1.75} />
        ) : (
          <Icon className="size-[15px]" strokeWidth={1.75} />
        )
      }
      title={note.title || "无标题笔记"}
      active={active}
      flag={generating ? <span className="text-accent-text">生成中</span> : undefined}
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

export function OutputGroup(props: OutputGroupProps) {
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

  const {
    quizSetsByProject,
    loadingRecords,
    fetchQuizSets,
    deleteQuizSet,
    fetchRecords,
    recordsByQuizSet,
    setCurrentProject,
    startTest,
  } = useVLQuizStore();
  const quizSets = useMemo(
    () => quizSetsByProject[projectId] ?? [],
    [quizSetsByProject, projectId]
  );

  useEffect(() => {
    setCurrentProject(projectId);
    fetchQuizSets(projectId);
  }, [projectId, setCurrentProject, fetchQuizSets]);

  // 测验集行显示最高分：逐个补拉记录
  useEffect(() => {
    quizSets.forEach(q => {
      if (!recordsByQuizSet[q.id]) fetchRecords({ quizSetId: q.id });
    });
  }, [quizSets, recordsByQuizSet, fetchRecords]);

  const items = useMemo<OutputItem[]>(
    () =>
      [
        ...notes.map(note => ({ kind: "note" as const, time: note.updateTime, note })),
        ...quizSets.map(quizSet => ({ kind: "quiz" as const, time: quizSet.updateTime, quizSet })),
      ].sort((a, b) => b.time - a.time),
    [notes, quizSets]
  );

  const bestScore = (id: number) => {
    const records = recordsByQuizSet[id] ?? [];
    return records.length ? Math.max(...records.map(r => r.score)) : null;
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
        } catch {
          toast.error("删除失败");
        }
      },
    });

  const handleStartTest = useMemoizedFn(async (quizSet: VLQuizSet) => {
    if (quizSet.itemCount === 0) {
      toast.info("这个测验集还没有题目");
      return;
    }
    try {
      await startTest(quizSet.id);
      setTesting(quizSet);
    } catch (error) {
      toast.error((error as Error).message || "无法开始测验");
    }
  });

  const openRecords = useMemoizedFn(async (quizSet: VLQuizSet) => {
    setRecordsOf(quizSet);
    await fetchRecords({ quizSetId: quizSet.id });
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
      {open &&
        (items.length === 0 ? (
          <p className="text-tau-sm text-ink-3 m-0 px-3 pb-3 pt-1 leading-relaxed">
            生成的大纲、测验、播客和手写笔记都会放在这里。
          </p>
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
              const best = bestScore(quizSet.id);
              return (
                <TreeRow
                  key={`q${quizSet.id}`}
                  icon={<CircleHelp className="size-[15px]" strokeWidth={1.75} />}
                  title={quizSet.name}
                  flag={
                    <span className="text-ink-3">
                      {quizSet.itemCount} 题{best !== null && ` · ${best.toFixed(0)}%`}
                    </span>
                  }
                  onClick={() => void handleStartTest(quizSet)}
                  menu={
                    <>
                      <Menu.Item
                        icon={<Play className="size-4" strokeWidth={1.75} />}
                        disabled={quizSet.itemCount === 0}
                        onSelect={() => void handleStartTest(quizSet)}
                      >
                        开始测验
                      </Menu.Item>
                      <Menu.Item
                        icon={<History className="size-4" strokeWidth={1.75} />}
                        onSelect={() => void openRecords(quizSet)}
                      >
                        测验记录
                      </Menu.Item>
                      <Menu.Item
                        icon={<Pencil className="size-4" strokeWidth={1.75} />}
                        onSelect={() => setEditingQuiz(quizSet)}
                      >
                        编辑题目
                      </Menu.Item>
                      <Menu.Separator />
                      <Menu.Item
                        danger
                        icon={<Trash2 className="size-4" strokeWidth={1.75} />}
                        onSelect={() => askDeleteQuiz(quizSet)}
                      >
                        删除
                      </Menu.Item>
                    </>
                  }
                />
              );
            })}
          </div>
        ))}

      <QuizTestModal
        open={testing !== null}
        quizSet={testing}
        onClose={() => {
          if (testing) fetchRecords({ quizSetId: testing.id });
          setTesting(null);
        }}
      />
      <QuizEditModal
        open={editingQuiz !== null}
        quizSet={editingQuiz}
        onClose={() => {
          setEditingQuiz(null);
          fetchQuizSets(projectId);
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
        {recordsOf && (
          <QuizRecords records={recordsByQuizSet[recordsOf.id] ?? []} loading={loadingRecords} />
        )}
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
          setPendingDelete(null);
          await pending?.action();
        }}
      />
    </section>
  );
}

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
