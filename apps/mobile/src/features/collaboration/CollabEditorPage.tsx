// 协作编辑页（设计稿 03 方案 A）：顶栏 presence + 状态副行 + 离线横幅 + 协作编辑器。
// 远端光标/选区由 @tau/editor-collab 的文档源自动渲染，本页只负责外壳与状态。
// 成员视角（本地无内容行）与协作中心入口仍走本页；owner 的原地编辑见详情页 CollaborativeEditor。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMobileContentKit } from "../../services/editorKit";
import { EditorKitPending } from "../../components/EditorKitPending";
import {
  ChevronRight,
  Loader2,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Unlink,
  Users,
  WifiOff,
} from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import { cn } from "@tau/ui";
import { ActionSheet } from "../../components/ActionSheet";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";
import { useNavigator } from "../../router";
import { MobileEditorBottomToolbar } from "../cards/editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "../cards/editorToolbar/useMobileEditorToolbarController";
import { isEditorContentEmpty } from "../cards/editorContentUtils";
import { useReadingMode } from "../cards/readingMode/useReadingMode";
import { ReadingModeFab } from "../cards/readingMode/ReadingModeFab";
import { ReadingSelectionBar } from "../cards/readingMode/ReadingSelectionBar";
import { useReadingSelection } from "../cards/readingMode/useReadingSelection";
import { useEditorOpenMode } from "../../hooks/useEditorOpenMode";
import { BlockActionBar } from "../cards/blockSelection/BlockActionBar";
import { BlockDragLayer } from "../cards/blockSelection/BlockDragLayer";
import { BlockHandle } from "../cards/blockSelection/BlockHandle";
import { BlockSelectionHeader } from "../cards/blockSelection/BlockSelectionHeader";
import {
  BLOCK_SELECTION_INSET_CLASS,
  BlockSelectionLayer,
} from "../cards/blockSelection/BlockSelectionLayer";
import { useBlockDrag } from "../cards/blockSelection/useBlockDrag";
import {
  blockSelectionMenuItem,
  outlineMenuItem,
} from "../cards/blockSelection/blockSelectionMenuItem";
import { useEditorBlockSelection } from "../cards/blockSelection/useEditorBlockSelection";
import { OutlineSheet } from "../cards/outline/OutlineSheet";
import { useOutlineSheet } from "../cards/outline/useOutlineSheet";
import { AvatarStack, StatusDot } from "./components/CollaborationUI";
import { useCollabSession } from "./hooks/useCollabSession";

export function CollabEditorPage(props: {
  documentId: string;
  onBack: () => void;
  onExit: () => void;
}) {
  const navigator = useNavigator();
  const [moreOpen, setMoreOpen] = useState(false);
  const {
    binding,
    document: sourceDocument,
    session,
    loading,
    error,
    readonly,
    presence,
    status,
    online,
    offline,
    retry,
  } = useCollabSession(props.documentId);
  const editorRef = useRef<EditorRef | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const toolbarController = useMobileEditorToolbarController({ editorRef });
  const syncSelection = toolbarController.syncSelection;
  const document = useMemo(
    () => (sourceDocument ? { ...sourceDocument, onChange: () => syncSelection() } : undefined),
    [sourceDocument, syncSelection]
  );
  // 协作文档首次就绪（已绑定且不在建立连接中）时决定一次初始编辑态：空文档或偏好为直接编辑
  const openMode = useEditorOpenMode();
  const contentReady = Boolean(binding) && session?.connection !== "connecting";
  const [initialEditing, setInitialEditing] = useState<boolean | null>(null);
  useEffect(() => {
    if (!contentReady || initialEditing !== null) return;
    const children = (editorRef.current?.getEditor() as { children?: unknown } | undefined)
      ?.children;
    setInitialEditing(openMode === "edit" || isEditorContentEmpty(children ?? []));
  }, [contentReady, initialEditing, openMode]);
  // 协作只读（冻结 / 会话非活跃 / 未绑定）时强制阅读态且隐藏「编辑」
  const readingMode = useReadingMode({
    editorRef,
    forcedReadonly: readonly,
    initialEditing,
    toolbarController,
  });
  // 协作只读时 canEdit 为 false，块选择不可进入且激活中立即退出
  const { blockSelection, slateEditor, blockCount, handleBlockIndex } = useEditorBlockSelection({
    editorRef,
    readingMode,
    toolbarController,
  });
  const outline = useOutlineSheet({ readingMode, blockSelection });
  const [editorWrapEl, setEditorWrapEl] = useState<HTMLDivElement | null>(null);
  const getScrollContainer = useCallback(() => scrollRef.current, []);
  const blockDrag = useBlockDrag({
    editorRef,
    container: editorWrapEl,
    getScrollContainer,
    toolbarController,
  });
  // 块选择期间正文保持可写（块菜单命令要求可写编辑器，点击由覆盖层拦截）；块选择与拖拽块期间配件栏收起
  const editorReadonly = readonly || (!readingMode.editing && !blockSelection.active);
  const toolbarReadonly = editorReadonly || blockSelection.active || blockDrag.dragging !== null;
  const readingSelection = useReadingSelection(
    editorRef,
    !readingMode.editing && readingMode.canEdit && !blockSelection.active
  );
  const kit = useMobileContentKit("edit");
  // 工具条经 portal 挂进本页根容器，才能随页面转场动画一起平移、退场
  const [pageRootEl, setPageRootEl] = useState<HTMLDivElement | null>(null);

  return (
    <div ref={setPageRootEl} className="mobile-kb-screen bg-page relative flex h-full flex-col">
      {blockSelection.active ? (
        <BlockSelectionHeader
          selectedCount={blockSelection.selected.length}
          totalCount={blockCount}
          onCancel={blockSelection.exit}
          onSelectAll={blockSelection.selectAll}
          onDeselectAll={() => blockSelection.setSelected([])}
        />
      ) : (
        <PageHeader
          onBack={props.onBack}
          center={
            <div className="min-w-0">
              <div className="text-ink-1 truncate text-[16px] font-extrabold">
                {session?.title ?? "协作文档"}
              </div>
              <div className="text-ink-2 mt-px flex items-center justify-center gap-1 text-[10.5px]">
                <StatusDot tone={status?.tone ?? "idle"} />
                <span className={status?.tone === "offline" ? "text-warn" : undefined}>
                  {status?.label ?? "连接中"}
                  {online.length > 0 ? ` · ${online.length} 人` : ""}
                </span>
              </div>
            </div>
          }
          actions={
            <>
              <button
                type="button"
                aria-label="成员管理"
                onClick={() => navigator.push("memberSheet", { documentId: props.documentId })}
                className="bg-surface shadow-card active:bg-hover flex h-9 items-center gap-1 rounded-full py-1 pr-2.5 pl-1.5 transition-colors"
              >
                <AvatarStack members={online} />
                <ChevronRight size={14} className="text-ink-3" />
              </button>
              <PageHeaderButton
                icon={<MoreHorizontal size={20} />}
                aria-label="更多操作"
                onClick={() => setMoreOpen(true)}
              />
            </>
          }
        />
      )}

      {offline ? (
        <div className="bg-tag-4-soft text-warn flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold">
          <WifiOff size={15} className="shrink-0" />
          <span className="flex-1">
            {status?.label ?? "网络已断开"} · 改动保留在本机，恢复后自动同步
          </span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-5"
        >
          {loading && !binding ? (
            <div
              role="status"
              className="text-ink-3 flex min-h-[45vh] items-center justify-center gap-2"
            >
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[13px]">正在加载协作内容…</span>
            </div>
          ) : null}

          {!loading && !binding ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center px-8 text-center">
              <p className="text-ink-1 text-[15px] font-bold">无法打开协作文档</p>
              <p className="text-ink-2 mt-2 text-[12.5px] leading-relaxed">
                {error || session?.error || "文档不存在或你已失去访问权限"}
              </p>
              <button
                type="button"
                onClick={retry}
                className="bg-surface shadow-card mt-5 flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold active:opacity-70"
              >
                <RefreshCw size={13} strokeWidth={2.6} />
                重试
              </button>
            </div>
          ) : null}

          {binding ? (
            <div
              ref={setEditorWrapEl}
              className={cn(
                "relative min-h-[45vh] pt-2 transition-[padding] duration-200",
                blockSelection.active && BLOCK_SELECTION_INSET_CLASS
              )}
              // 块选择期间由覆盖层接管点击，阅读态的双击进入编辑与勾选待办不生效
              {...(blockSelection.active ? {} : readingMode.readingSurfaceProps)}
            >
              {kit ? (
                <Editor
                  kit={kit}
                  ref={editorRef}
                  key={`collab-${props.documentId}`}
                  document={document}
                  className="mobile-card-editor-content"
                  readonly={editorReadonly}
                  onFocus={() => {
                    presence.onFocus();
                    toolbarController.handleEditorFocus();
                  }}
                  onBlur={() => {
                    presence.onBlur();
                    toolbarController.handleEditorBlur();
                  }}
                  onSelectionChange={toolbarController.syncSelection}
                />
              ) : (
                <EditorKitPending />
              )}
              <BlockSelectionLayer
                editorRef={editorRef}
                container={editorWrapEl}
                active={blockSelection.active}
                selected={blockSelection.selected}
                onToggle={blockSelection.toggle}
                documentVersion={slateEditor?.children}
              />
              <BlockDragLayer drag={blockDrag.dragging} />
              <BlockHandle
                editorRef={editorRef}
                container={editorWrapEl}
                // 拖拽中编辑器已失焦，把手仍挂在被拖块上以保持指针捕获
                blockIndex={blockDrag.dragging?.from ?? handleBlockIndex}
                onEnter={blockSelection.enter}
                onDragStart={blockDrag.startDrag}
                dragging={blockDrag.dragging !== null}
                version={slateEditor?.children}
              />
            </div>
          ) : null}

          {error && binding ? (
            <p className="text-tag-5 mt-4 text-[12px] leading-relaxed">{error}</p>
          ) : null}
        </div>
      </div>

      <ReadingModeFab
        visible={
          Boolean(binding && kit) &&
          readingMode.canEdit &&
          !readingMode.editing &&
          !blockSelection.active &&
          blockDrag.dragging === null &&
          readingSelection.range === null
        }
        onEnter={readingMode.enterEditing}
        getScrollContainer={getScrollContainer}
      />
      <MobileEditorBottomToolbar
        controller={toolbarController}
        portalContainer={pageRootEl}
        readonly={toolbarReadonly}
        showDoneButton
      />
      {blockSelection.active && kit ? (
        <BlockActionBar
          editorRef={editorRef}
          kit={kit}
          selection={blockSelection}
          blockCount={blockCount}
          portalContainer={pageRootEl}
          onOpenOutline={outline.openOutline}
        />
      ) : (
        <ReadingSelectionBar
          editorRef={editorRef}
          controller={toolbarController}
          readingMode={readingMode}
          range={readingSelection.range}
          onClear={readingSelection.clear}
          portalContainer={pageRootEl}
        />
      )}

      <OutlineSheet open={outline.open} editorRef={editorRef} onClose={outline.close} />

      <ActionSheet
        open={moreOpen}
        title={session?.title ?? "协作文档"}
        kind="协作"
        subtitle={
          session ? `${session.members.length} 位成员 · ${online.length} 人在线` : undefined
        }
        items={[
          ...(readingMode.canEdit && binding
            ? [
                blockSelectionMenuItem(() => blockSelection.enter()),
                outlineMenuItem(outline.openOutline),
              ]
            : []),
          {
            label: "成员管理",
            icon: <Users size={18} />,
            tone: "sage",
            trailing: (
              <>
                {session ? `${session.members.length} 人` : null}
                <ChevronRight strokeWidth={2} />
              </>
            ),
            onClick: () => navigator.push("memberSheet", { documentId: props.documentId }),
          },
          {
            label: session?.role === "owner" ? "结束共享" : "退出协作",
            desc:
              session?.role === "owner"
                ? "所有成员将失去访问权限，云端数据被清空"
                : "退出后需重新申请才能加入",
            danger: true,
            icon: session?.role === "owner" ? <Unlink size={18} /> : <LogOut size={18} />,
            onClick: props.onExit,
          },
        ]}
        onClose={() => setMoreOpen(false)}
      />
    </div>
  );
}
