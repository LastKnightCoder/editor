/**
 * Vibe Learning 项目页（D-062 方案 C「学习台」）：一整张纸——
 * 左 = 纸内目录（资料 + 产物，开关在面包屑），中 = 阅读区（资料 / 笔记），右 = 对话。
 * 什么都没打开时对话占满中间；打开后对话退到右栏继续问。对话面板始终挂载在同一位置，
 * 切换布局不打断进行中的回答。上次打开的条目按项目记住。
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { cn, toast } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { getProjectById } from "@/commands";
import { getVLNotesByProjectId, getVLResourcesByProjectId } from "@/commands/vibe-learning";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { FadeScroll } from "@/components/FadeScroll";
import useVLQuizStore from "@/stores/useVLQuizStore";
import { useProjectTreeStore } from "../../projectTreeStore";
import type { Project } from "@/types";
import type { VLNote, VLResource } from "@/types/vibe-learning";

import ChatPanel from "./ChatPanel";
import AddResourceModal from "./AddResourceModal";
import GenerationHost, { type GenerationHostRef } from "./generate";
import type { GenerateAppKey } from "./appMeta";
import { ResourceGroup } from "./tree/ResourceGroup";
import { OutputGroup } from "./tree/OutputGroup";
import { ResourceStage } from "./stage/ResourceStage";
import NoteEditorView from "./stage/NoteEditorView";
import { canOpenInStage, openResourceExternally } from "./resourceKinds";

type Opened =
  { kind: "resource"; id: number } | { kind: "note"; id: number } | { kind: "new-note" };

const CHAT_MIN = 320;
const CHAT_MAX = 600;

/** 右栏对话宽度拖拽（左缘 6px 热区；对话本身不因拖拽重挂） */
function useDockResize(width: number, setWidth: (w: number) => void) {
  return useMemoizedFn((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) =>
      setWidth(Math.min(CHAT_MAX, Math.max(CHAT_MIN, startW + startX - ev.clientX)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

interface VibeLearningViewProps {
  projectId: number;
}

const VibeLearningView = memo(({ projectId }: VibeLearningViewProps) => {
  const mainDbName = useSettingStore(state => state.setting.database.active);
  const treeCollapsed = useProjectTreeStore(s => s.collapsed);

  const [project, setProject] = useState<Project | null>(null);
  const [resources, setResources] = useState<VLResource[]>([]);
  const [notes, setNotes] = useState<VLNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  /** 新建笔记保存后拿到的实体（列表刷新前也能继续编辑同一篇） */
  const [draftNote, setDraftNote] = useState<VLNote | null>(null);
  /** 每次显式打开（或需要强制重载）+1：阅读区据此重挂；新建笔记首存不变，编辑不中断 */
  const [stageKey, setStageKey] = useState(0);

  const [treeWidth, setTreeWidth] = useLocalStorageState("vibe-learning-tree-width", {
    defaultValue: 256,
  });
  const [chatWidth, setChatWidth] = useLocalStorageState("vibe-learning-chat-width", {
    defaultValue: 400,
  });
  const [chatOpen, setChatOpen] = useLocalStorageState("vibe-learning-chat-open", {
    defaultValue: true,
  });
  const [opened, setOpened] = useLocalStorageState<Opened | null>(
    `vibe-learning-opened-${projectId}`,
    { defaultValue: null }
  );

  const generationRef = useRef<GenerationHostRef>(null);
  const fetchQuizSets = useVLQuizStore(s => s.fetchQuizSets);
  const startDockResize = useDockResize(chatWidth ?? 400, setChatWidth);

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
        getProjectById(projectId),
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
  const hasStage =
    !loading &&
    (opened?.kind === "new-note" ||
      (openedResource !== null && canOpenInStage(openedResource)) ||
      openedNote !== null);

  // 加载完成后，记住的条目已不存在则清掉
  useEffect(() => {
    if (!loading && opened && opened.kind !== "new-note" && !hasStage) setOpened(null);
  }, [loading, opened, hasStage, setOpened]);

  const openStage = useMemoizedFn((next: Opened) => {
    setStageKey(k => k + 1);
    setOpened(next);
  });

  const openResource = useMemoizedFn((resource: VLResource) => {
    if (canOpenInStage(resource)) openStage({ kind: "resource", id: resource.id });
    else void openResourceExternally(resource); // 尚未转换出文本的文档：交给系统默认程序
  });

  const openNote = useMemoizedFn((note: VLNote) => openStage({ kind: "note", id: note.id }));

  const handleNoteCreated = useMemoizedFn((note: VLNote) => {
    void refreshNotes();
    setDraftNote(note);
    openStage({ kind: "note", id: note.id });
  });

  // PPT / 报告经 AI 编辑改了内容：打开中的就是它时重载
  const handleNoteEdited = useMemoizedFn(async () => {
    await refreshNotes();
    if (opened?.kind === "note") setStageKey(k => k + 1);
  });

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
            />
          </FadeScroll>
        </ResizeableAndHideableSidebar>

        {/* 中：阅读区 */}
        {hasStage && (
          <div className="min-w-0 flex-1">
            {openedResource ? (
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
          style={dockChat ? { width: chatWidth ?? 400 } : undefined}
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
      />
      <GenerationHost
        ref={generationRef}
        projectId={projectId}
        mainDbName={mainDbName}
        onNotesChange={refreshNotes}
        onNoteEdited={handleNoteEdited}
        onNoteCreated={handleNoteCreated}
        onQuizSetsChange={() => fetchQuizSets(projectId)}
      />
    </div>
  );
});

VibeLearningView.displayName = "VibeLearningView";

export default VibeLearningView;
