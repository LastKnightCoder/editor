/**
 * Vibe Learning 项目页（D-062 方案 C「学习台」）：一整张纸——
 * 左 = 纸内目录（资料 + 产物，开关在面包屑），中 = 阅读区（资料 / 笔记），右 = 对话。
 * 什么都没打开时对话占满中间；打开后对话退到右栏继续问。对话面板始终挂载在同一位置，
 * 切换布局不打断进行中的回答。上次打开的条目按项目记住。
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { DOCK_CHAT_MIN, clampDockChatWidth, useDockResize } from "@/hooks/useDockResize";
import { cn, toast } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { getVibeLearningProject } from "@/commands/vibe-learning-project";
import { getVLNotesByProjectId, getVLResourcesByProjectId } from "@/commands/vibe-learning";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { ResizableAndHideableSidebar as ResizeableAndHideableSidebar } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { useVibeLearningPanelStore } from "../../panelStore";
import { useRecordVibeLearningOpen } from "../../queries";
import type { VibeLearningProject } from "@/types";
import type { VLNote, VLResource } from "@/types/vibe-learning";

import ChatPanel from "./ChatPanel";
import AddResourceModal from "./AddResourceModal";
import GenerationHost, { type GenerationHostRef, type TaskStarted } from "./generate";
import type { GenerateAppKey } from "./appMeta";
import { ResourceGroup } from "./tree/ResourceGroup";
import { SourceRow } from "./tree/SourceRow";
import { OutputGroup, type OutputGroupRef } from "./tree/OutputGroup";
import { TaskStage } from "./stage/TaskStage";
import { useNoteTask, useVLTaskStore } from "./tasks/store";
import { ResourceStage } from "./stage/ResourceStage";
import NoteEditorView from "./stage/NoteEditorView";
import { canOpenInStage, openResourceExternally } from "./resourceKinds";

type Opened =
  | { kind: "resource"; id: number }
  | { kind: "note"; id: number }
  | { kind: "new-note" }
  /** 测验集的生成过程（笔记类任务跟着笔记走） */
  | { kind: "task"; id: string };

interface VibeLearningViewProps {
  projectId: number;
}

const VibeLearningView = memo(({ projectId }: VibeLearningViewProps) => {
  const mainDbName = useSettingStore(state => state.setting.database.active);
  const treeCollapsed = useVibeLearningPanelStore(s => s.collapsed);

  const [project, setProject] = useState<VibeLearningProject | null>(null);
  const [resources, setResources] = useState<VLResource[]>([]);
  const [notes, setNotes] = useState<VLNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  /** 新建笔记保存后拿到的实体（列表刷新前也能继续编辑同一篇） */
  const [draftNote, setDraftNote] = useState<VLNote | null>(null);
  /** 每次显式打开（或需要强制重载）+1：阅读区据此重挂；新建笔记首存不变，编辑不中断 */
  const [stageKey, setStageKey] = useState(0);
  /** 笔记的「生成过程 / 产物」切换；null = 跟随任务状态（进行中看过程，完成看产物） */
  const [traceView, setTraceView] = useState<boolean | null>(null);

  const [treeWidth, setTreeWidth] = useLocalStorageState("vibe-learning-tree-width", {
    defaultValue: 256,
  });
  const [chatWidth, setChatWidth] = useLocalStorageState("vibe-learning-chat-width", {
    defaultValue: DOCK_CHAT_MIN,
  });
  // 旧版本存下的宽度可能低于新下限，读出时统一夹紧
  const dockWidth = clampDockChatWidth(chatWidth ?? DOCK_CHAT_MIN);
  const [chatOpen, setChatOpen] = useLocalStorageState("vibe-learning-chat-open", {
    defaultValue: true,
  });
  const [opened, setOpened] = useLocalStorageState<Opened | null>(
    `vibe-learning-opened-${projectId}`,
    { defaultValue: null }
  );
  // 列表的「最近打开」：资料 / 笔记记为上次看到的条目，生成任务与新建笔记只刷新打开时间
  useRecordVibeLearningOpen(
    projectId,
    opened?.kind === "resource" || opened?.kind === "note" ? opened : undefined,
    !loading
  );

  const generationRef = useRef<GenerationHostRef>(null);
  const outputRef = useRef<OutputGroupRef>(null);
  const startDockResize = useDockResize(dockWidth, setChatWidth);

  const refreshResources = useMemoizedFn(async () => {
    try {
      setResources(await getVLResourcesByProjectId(projectId));
    } catch (error) {
      console.error("Failed to refresh resources:", error);
    }
  });

  const refreshNotes = useMemoizedFn(async () => {
    try {
      setNotes(await getVLNotesByProjectId(projectId));
    } catch (error) {
      console.error("Failed to load notes:", error);
    }
  });

  const loadData = useMemoizedFn(async () => {
    if (!projectId || isNaN(projectId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [projectData, resourcesData, notesData] = await Promise.all([
        getVibeLearningProject(projectId),
        getVLResourcesByProjectId(projectId),
        getVLNotesByProjectId(projectId),
      ]);
      setProject(projectData);
      setResources(resourcesData);
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to load VibeLearning data:", error);
      toast.error("加载项目数据失败");
    } finally {
      setLoading(false);
    }
  });

  useDatabaseChangeEffect(() => {
    loadData();
  }, [projectId]);

  // 打开中的条目解析为实体；已被删掉的条目视为未打开
  const openedResource = useMemo(
    () => (opened?.kind === "resource" ? (resources.find(r => r.id === opened.id) ?? null) : null),
    [opened, resources]
  );
  const listNote =
    opened?.kind === "note"
      ? (notes.find(n => n.id === opened.id) ?? (draftNote?.id === opened.id ? draftNote : null))
      : null;
  // 编辑器只在换了一篇或强制重载时拿到新对象：列表刷新（改标题、别处生成完成）不打断正在编辑的内容
  const stableNoteRef = useRef<{ key: string; note: VLNote | null }>({ key: "", note: null });
  const noteKey = `${listNote?.id ?? ""}:${stageKey}`;
  if (stableNoteRef.current.key !== noteKey)
    stableNoteRef.current = { key: noteKey, note: listNote };
  const openedNote = stableNoteRef.current.note;
  const noteTask = useNoteTask(opened?.kind === "note" ? opened.id : null);
  const openedTask = useVLTaskStore(s =>
    opened?.kind === "task" ? s.tasks[opened.id] : undefined
  );
  const showTrace = !!noteTask && (traceView ?? noteTask.status !== "succeeded");
  const hasStage =
    !loading &&
    (opened?.kind === "new-note" ||
      (openedResource !== null && canOpenInStage(openedResource)) ||
      openedNote !== null ||
      !!openedTask);

  // 后台任务建产物 / 落库后刷新列表（离开页面期间完成的，回来时也会拉到最新）
  const productVersion = useVLTaskStore(s => s.productVersion[projectId] ?? 0);
  useEffect(() => {
    if (productVersion === 0) return;
    void refreshNotes();
  }, [productVersion, projectId, refreshNotes]);

  // 正在看的笔记任务从进行中结束：拉最新标题后重挂阅读区，切到产物
  const noteTaskStatus = noteTask?.status;
  const prevNoteTaskStatus = useRef(noteTaskStatus);
  useEffect(() => {
    const prev = prevNoteTaskStatus.current;
    prevNoteTaskStatus.current = noteTaskStatus;
    if (prev !== "running" || !noteTaskStatus || noteTaskStatus === "running") return;
    void refreshNotes().then(() => setStageKey(k => k + 1));
  }, [noteTaskStatus, refreshNotes]);

  // 加载完成后，记住的条目已不存在则清掉
  useEffect(() => {
    if (!loading && opened && opened.kind !== "new-note" && !hasStage) setOpened(null);
  }, [loading, opened, hasStage, setOpened]);

  const openStage = useMemoizedFn((next: Opened) => {
    setStageKey(k => k + 1);
    setTraceView(null);
    setOpened(next);
  });

  const openResource = useMemoizedFn((resource: VLResource) => {
    if (canOpenInStage(resource)) openStage({ kind: "resource", id: resource.id });
    else void openResourceExternally(resource); // 尚未转换出文本的文档：交给系统默认程序
  });

  const openNote = useMemoizedFn((note: VLNote) => openStage({ kind: "note", id: note.id }));

  // 任务启动：弹窗已关，阅读区直接看它的生成过程
  const handleTaskStarted = useMemoizedFn((started: TaskStarted) => {
    if (started.note) {
      setDraftNote(started.note);
      openStage({ kind: "note", id: started.note.id });
    } else {
      openStage({ kind: "task", id: started.taskId });
    }
  });

  // 对话里的产物卡片请求打开：笔记不在列表里（刚建、列表还没刷新）先拉一次
  const openRequest = useVLTaskStore(s =>
    s.openRequest?.projectId === projectId ? s.openRequest : null
  );
  const handledOpenSeq = useRef(openRequest?.seq ?? 0);
  useEffect(() => {
    if (!openRequest || openRequest.seq === handledOpenSeq.current) return;
    handledOpenSeq.current = openRequest.seq;
    const { target } = openRequest;
    if (target.kind === "task") openStage({ kind: "task", id: target.id });
    else if (target.kind === "quiz") outputRef.current?.startQuiz(target.id);
    else if (notes.some(n => n.id === target.id)) openStage({ kind: "note", id: target.id });
    else void refreshNotes().then(() => openStage({ kind: "note", id: target.id }));
  }, [openRequest, notes, openStage, refreshNotes]);

  const closeStage = useMemoizedFn(() => {
    setOpened(null);
    void refreshNotes();
  });

  const generate = useMemoizedFn((key: GenerateAppKey, resourceId?: number) =>
    generationRef.current?.open(key, resourceId)
  );

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="text-ink-3 size-5 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="bg-surface shadow-card rounded-tau-lg px-8 py-6 text-center">
          <p className="text-ink-2 text-[14px]">项目不存在或已被删除</p>
        </div>
      </div>
    );
  }

  const dockChat = hasStage;
  const toggleChat = () => setChatOpen(!chatOpen);

  return (
    <div className="flex h-full min-h-0 w-full flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 overflow-hidden">
        {/* 左：纸内目录 */}
        <ResizeableAndHideableSidebar
          width={treeWidth ?? 256}
          onWidthChange={setTreeWidth}
          open={!treeCollapsed}
          sidebarPosition="left"
          minWidth={220}
          maxWidth={420}
          disableResize={treeCollapsed}
          showDivider
          className="h-full"
        >
          <FadeScroll className="h-full py-3 pl-2.5 pr-1">
            <SourceRow projectId={projectId} />
            <ResourceGroup
              projectId={projectId}
              mainDbName={mainDbName}
              resources={resources}
              activeResourceId={openedResource?.id ?? null}
              onOpen={openResource}
              onAdd={() => setAddOpen(true)}
              onResourcesChange={refreshResources}
              onDeleted={id => opened?.kind === "resource" && opened.id === id && setOpened(null)}
            />
            <div className="h-3" />
            <OutputGroup
              projectId={projectId}
              mainDbName={mainDbName}
              notes={notes}
              activeNoteId={openedNote?.id ?? null}
              onOpenNote={openNote}
              onCreateNote={() => {
                setDraftNote(null);
                openStage({ kind: "new-note" });
              }}
              onGenerate={key => generate(key)}
              onEditPPT={note => generationRef.current?.editPPT(note)}
              onEditReport={note => generationRef.current?.editReport(note)}
              onNotesChange={refreshNotes}
              onNoteDeleted={id => opened?.kind === "note" && opened.id === id && setOpened(null)}
              onResourcesChange={refreshResources}
              activeTaskId={opened?.kind === "task" ? opened.id : null}
              onOpenTask={id => openStage({ kind: "task", id })}
              ref={outputRef}
            />
          </FadeScroll>
        </ResizeableAndHideableSidebar>

        {/* 中：阅读区 */}
        {hasStage && (
          <div className="min-w-0 flex-1">
            {openedTask ? (
              <TaskStage
                task={openedTask}
                chatOpen={!!chatOpen}
                onToggleChat={toggleChat}
                onClose={closeStage}
                onStartQuiz={
                  openedTask.quizSetId !== undefined
                    ? () => outputRef.current?.startQuiz(openedTask.quizSetId as number)
                    : undefined
                }
              />
            ) : showTrace && noteTask ? (
              <TaskStage
                task={noteTask}
                chatOpen={!!chatOpen}
                onToggleChat={toggleChat}
                onClose={closeStage}
                onShowProduct={() => {
                  setTraceView(false);
                  setStageKey(k => k + 1);
                }}
              />
            ) : openedResource ? (
              <ResourceStage
                key={`s${stageKey}`}
                resource={openedResource}
                projectId={projectId}
                mainDbName={mainDbName}
                chatOpen={!!chatOpen}
                onToggleChat={toggleChat}
                onClose={closeStage}
                onGenerate={generate}
              />
            ) : (
              <NoteEditorView
                key={`s${stageKey}`}
                projectId={projectId}
                mainDbName={mainDbName}
                note={openedNote}
                onBack={closeStage}
                onNoteSaved={note => {
                  setDraftNote(note);
                  setOpened({ kind: "note", id: note.id });
                  void refreshNotes();
                }}
                onResourcesChange={refreshResources}
                onNoteChanged={refreshNotes}
                chatOpen={!!chatOpen}
                onToggleChat={toggleChat}
                onEditPPT={note => generationRef.current?.editPPT(note)}
                onEditReport={note => generationRef.current?.editReport(note)}
                onShowTrace={noteTask ? () => setTraceView(true) : undefined}
              />
            )}
          </div>
        )}

        {/* 右 / 中：对话（阅读区打开时停靠右栏，可拖宽、可收起） */}
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-col",
            dockChat ? "shrink-0 shadow-[inset_1px_0_0_var(--tau-line-2)]" : "flex-1",
            dockChat && !chatOpen && "hidden"
          )}
          style={dockChat ? { width: dockWidth } : undefined}
        >
          {dockChat && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整对话栏宽度"
              onPointerDown={startDockResize}
              className="hover:bg-accent/30 absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize transition-colors"
            />
          )}
          <ChatPanel
            projectId={projectId}
            mainDbName={mainDbName}
            resources={resources}
            title={project.title}
            desc={project.desc}
            docked={dockChat}
          />
        </div>
      </div>

      <AddResourceModal
        open={addOpen}
        projectId={projectId}
        mainDbName={mainDbName}
        onClose={() => setAddOpen(false)}
        onSuccess={refreshResources}
        resources={resources}
      />
      <GenerationHost
        ref={generationRef}
        projectId={projectId}
        mainDbName={mainDbName}
        onTaskStarted={handleTaskStarted}
      />
    </div>
  );
});

VibeLearningView.displayName = "VibeLearningView";

export default VibeLearningView;
