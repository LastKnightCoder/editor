import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useMobileContentKit } from "../../services/editorKit";
import { EditorKitPending } from "../../components/EditorKitPending";
import { CornerUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";
import { Editor, type EditorDocument, type EditorRef } from "@tau/editor";
import { cn } from "@tau/ui";
import * as tauri from "../../services/tauri";
import type { ContentDetailResponse } from "../../types";
import { formatDateTimeCompact } from "../../utils/formatTime";
import { useEditContent } from "../../hooks/useEditContent";
import { useOptionalPageInstanceContext } from "../../router/pageLifecycle";
import { collaborationManager } from "../collaboration/core/manager";
import type { NodeTreeEditor } from "@tau/editor-collab";
import useLocalContentDocument, {
  type LocalContentDocument,
} from "../../hooks/useLocalContentDocument";
import { MobileEditorBottomToolbar } from "./editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "./editorToolbar/useMobileEditorToolbarController";
import ContextBadge from "../context/ContextBadge";
import TagChips from "./TagChips";
import TagInlineEditor from "./TagInlineEditor";
import type { CollaborativeEditorMode } from "../collaboration/CollaborativeEditor";
import { isEditorContentEmpty } from "./editorContentUtils";
import { useReadingMode } from "./readingMode/useReadingMode";
import { ReadingModeFab } from "./readingMode/ReadingModeFab";
import { ReadingSelectionBar } from "./readingMode/ReadingSelectionBar";
import { useReadingSelection } from "./readingMode/useReadingSelection";
import { useEditorOpenMode } from "../../hooks/useEditorOpenMode";
import { toast } from "../../components/toast";
import { BlockActionBar } from "./blockSelection/BlockActionBar";
import { BlockDragLayer } from "./blockSelection/BlockDragLayer";
import { BlockHandle } from "./blockSelection/BlockHandle";
import { BlockSelectionHeader } from "./blockSelection/BlockSelectionHeader";
import {
  BLOCK_SELECTION_INSET_CLASS,
  BlockSelectionLayer,
} from "./blockSelection/BlockSelectionLayer";
import { useBlockDrag } from "./blockSelection/useBlockDrag";
import { useEditorBlockSelection } from "./blockSelection/useEditorBlockSelection";
import { OutlineSheet } from "./outline/OutlineSheet";
import { useOutlineSheet } from "./outline/useOutlineSheet";

// 原地协作编辑器按需加载：未使用协作的用户不加载协作组件与运行时
const CollaborativeEditor = lazy(() =>
  import("../collaboration/CollaborativeEditor").then(module => ({
    default: module.CollaborativeEditor,
  }))
);

/** 封面页顶栏渐显实底的滚动过渡距离（px）：略大于顶栏高度，给 scrim→实底切换留缓冲 */
const COVER_HEADER_FADE_RANGE = 140;

/** 详情页对宿主 page 暴露的操作（page 的「⋯」菜单经 actionsRef 调用） */
export type ContentDetailActions = {
  /** 进入块选择并选中 0 个块；阅读态与编辑态都可用，不可编辑时提示 */
  enterBlockSelection: () => void;
  /** 打开「整理结构」；编辑态先收键盘，不可编辑时提示 */
  openOutline: () => void;
};

type ContentDetailPageProps = {
  contentId: number;
  contentTitle?: string;
  contentType?: string;
  refId?: number;
  onSaved?: (detail: ContentDetailResponse) => void;
  onBack: () => void;
  onError?: (error: unknown, fallback: string) => void;
  /** 标题就地编辑（文章 / 项目文档 / 知识库节点），失焦或返回时经 onTitleCommit 落库 */
  titleEditable?: boolean;
  onTitleCommit?: (title: string) => void;
  /** 顶栏右侧自定义区（如 ⋯ 菜单按钮） */
  headerRight?: ReactNode;
  /** 详情页操作句柄（如「⋯ → 选择块 / 整理结构」） */
  actionsRef?: Ref<ContentDetailActions>;
  /** 日记日期头：日期即标题，与正文同处一张「纸」，不再另起元信息卡 */
  diaryDate?: { title: string; sub?: string };
  /** 通用内容详情的标签源（文章 / 知识库 / 项目文档）：传入即启用内联添加 */
  tags?: string[];
  onTagsCommit?: (tags: string[]) => Promise<void>;
  /** 来源引用（知识库 / 项目文档节点为卡片或文章的镜像时展示） */
  sourceRef?: {
    label: string;
    typeLabel: string;
    /** 图标与标题的域色（如 text-tag-2 / text-tag-4），缺省用品牌色 */
    toneClass?: string;
    onOpen: () => void;
  };
  /** 通用模式下的类型徽章（soft 底胶囊类名 + 可选图标，方案 A 定稿徽章行），卡片分类用 */
  contentTypeBadge?: { icon?: LucideIcon; className: string };
  /** 顶部全宽封面插槽（文章编辑页：真实 banner 沉浸展示，更换封面入口在列表 ⋯ 菜单） */
  coverSlot?: ReactNode;
  /** 编辑器下方插槽（如知识库的关联面板） */
  belowEditor?: ReactNode;
  /** 脉络入口的实体身份（卡片 / 文章 / 项目文档）；日记片段暂不接（日记在日记页内浏览） */
  contextEntity?: { kind: string; id: number };
  /** 外部刷新信号（页面 onResume 等），变化时强制重拉详情（双向关联由对侧写入时本页无感知） */
  refreshKey?: number;
  /** 该内容已绑定协作房间：原地切换为协作编辑（云端 Y.Doc 为唯一真相源），
   *  本地直写停用、owner 侧经投影通道落库；点状态条打开共享与成员 Sheet */
  collaboration?: { documentId: string };
  /** 在共享与成员 Sheet 里结束共享/退出协作：宿主据此重查绑定，让 collaboration prop 归位 */
  onCollaborationEnded?: () => void;
  /** 强制已有内容打开时直接编辑；未传时按「打开文档时」偏好（默认阅读态），空文档总是直接编辑 */
  openInEditMode?: boolean;
};

function formatTimeLabel(value: number): string {
  return value ? formatDateTimeCompact(value) : "--";
}

function resolveTitle(props: { contentTitle?: string; contentId: number }): string {
  if (props.contentTitle?.trim()) {
    return props.contentTitle.trim();
  }
  return `内容 #${props.contentId}`;
}

function MetaDot() {
  return <span className="opacity-55">·</span>;
}

/** 详情页编辑归属的唯一状态源：local=普通本地编辑（含共享已结束）；
 *  collabConnecting=协作会话建立中（本地只读占位，避免双正文）；collabLive=协作编辑
 *  （会话负责同步与本机投影）。 */
type DetailEditMode = "local" | "collabConnecting" | "collabLive";

function detailEditMode(hasCollaboration: boolean, mode: CollaborativeEditorMode): DetailEditMode {
  if (!hasCollaboration) return "local";
  if (mode === "live") return "collabLive";
  if (mode === "connecting") return "collabConnecting";
  if (mode === "unavailable") return "collabConnecting";
  return "local"; // ended：共享已结束，本地即真相源
}

export function ContentDetailPage(props: ContentDetailPageProps) {
  // 全页只有一个编辑器实例：本机与协作是同谱系的两个文档源，切换即换源（01 §7.3 第 3 层）
  const editorRef = useRef<EditorRef | null>(null);
  const localDocumentRef = useRef<LocalContentDocument | undefined>(undefined);
  const pageContext = useOptionalPageInstanceContext();
  const [detail, setDetail] = useState<ContentDetailResponse | null>(null);
  // 回调入 ref：父层传内联函数时，避免其引用变化触发详情重复拉取
  const onErrorRef = useRef(props.onError);
  onErrorRef.current = props.onError;
  // 协作编辑模式（由协作会话组件上报）：connecting 过渡期只读，live 用协作文档源，
  // unavailable（会话未就绪）仍保持只读，已有缓存的离线编辑由协作会话承载
  const collaborationDocumentId = props.collaboration?.documentId;
  const [collabMode, setCollabMode] = useState<CollaborativeEditorMode>("connecting");
  const [collabReadonly, setCollabReadonly] = useState(true);
  const [collabDocument, setCollabDocument] = useState<EditorDocument>();
  const collabPresence = useRef<{ onFocus: () => void; onBlur: () => void } | null>(null);
  useEffect(() => {
    setCollabMode("connecting");
    setCollabReadonly(true);
  }, [collaborationDocumentId]);
  // 首次拿到内容时决定一次初始编辑态，之后重拉不再改动
  const [initialEditing, setInitialEditing] = useState<boolean | null>(null);
  const openMode = useEditorOpenMode();
  const openInEditModeRef = useRef(false);
  openInEditModeRef.current = Boolean(props.openInEditMode) || openMode === "edit";
  const editMode = detailEditMode(Boolean(collaborationDocumentId), collabMode);
  const {
    content,
    syncVersion,
    loading: contentLoading,
    saving,
    error: saveError,
    handleEditorContentChange,
    flushNow,
  } = useEditContent(props.contentId, {
    refreshKey: props.refreshKey,
    beforeSave: async () => {
      await localDocumentRef.current?.flush();
    },
    // 绑定协作后只由会话落库，未就绪时不创建独立写入分支。
    saveMode: editMode === "local" ? "direct" : false,
    onLoaded: result => {
      setDetail(result);
      setInitialEditing(
        prev => prev ?? (openInEditModeRef.current || isEditorContentEmpty(result.content))
      );
    },
    onLoadError: error => onErrorRef.current?.(error, "内容详情加载失败"),
    onSaved: saved => {
      setDetail(prev => ({
        ...(prev ?? saved),
        updateTime: saved.updateTime,
        count: saved.count,
        content: saved.content,
        librarySourceId: saved.librarySourceId,
        contracts: saved.contracts,
        revision: saved.revision,
        documentId: saved.documentId,
      }));
      props.onSaved?.(saved);
    },
    onSaveError: error => {
      props.onError?.(error, "内容自动保存失败");
    },
  });
  const toolbarController = useMobileEditorToolbarController({ editorRef });
  const localDocument = useLocalContentDocument({
    contentId: collabDocument ? undefined : props.contentId,
    content,
    metadata: detail ?? undefined,
    version: syncVersion,
    onChange: (value, contracts) => {
      handleEditorContentChange(value, contracts);
      toolbarController.syncSelection();
    },
  });
  localDocumentRef.current = localDocument;
  const beforeLeave = useRef<() => Promise<boolean>>(async () => true);
  beforeLeave.current = async () => {
    try {
      (
        editorRef.current?.getEditor() as Partial<NodeTreeEditor> | undefined
      )?.flushNodeTreeInputs?.();
      if (collabDocument && collaborationDocumentId)
        await collaborationManager.flushCache(collaborationDocumentId);
      else await localDocumentRef.current?.flush();
      return await flushNow();
    } catch (failure) {
      toast({
        type: "error",
        text: failure instanceof Error ? failure.message : "输入尚未保存，请保留当前页面",
      });
      return false;
    }
  };
  useEffect(() => {
    if (!pageContext) return;
    pageContext.navigator.registerGuard(pageContext.entry.id, () => beforeLeave.current());
    return () => pageContext.navigator.registerGuard(pageContext.entry.id, null);
  }, [pageContext?.navigator, pageContext?.entry.id]);
  // 协作文档源就绪即用它，否则用本机文档源；两者谱系相同，换源不重建编辑器
  const document = collabDocument ?? localDocument;
  // 协作建立中与协作只读：强制阅读态且隐藏「编辑」
  const forcedReadonly =
    editMode === "collabConnecting"
      ? true
      : editMode === "collabLive"
        ? collabReadonly
        : Boolean(localDocument?.readonly);
  const readingMode = useReadingMode({
    editorRef,
    forcedReadonly,
    initialEditing,
    toolbarController,
  });
  const { blockSelection, slateEditor, blockCount, handleBlockIndex } = useEditorBlockSelection({
    editorRef,
    readingMode,
    toolbarController,
  });
  const outline = useOutlineSheet({ readingMode, blockSelection });
  useImperativeHandle(
    props.actionsRef,
    () => ({
      enterBlockSelection: () => {
        if (!readingMode.canEdit) {
          toast({ type: "warning", text: "当前内容不可编辑" });
          return;
        }
        blockSelection.enter();
      },
      openOutline: outline.openOutline,
    }),
    [blockSelection, readingMode.canEdit, outline.openOutline]
  );
  // 阅读态与强制只读时正文只读；块选择期间保持可写（块菜单命令要求可写编辑器，点击由覆盖层拦截）
  const editorReadonly = forcedReadonly || (!readingMode.editing && !blockSelection.active);
  const readingSelection = useReadingSelection(
    editorRef,
    !readingMode.editing && readingMode.canEdit && !blockSelection.active
  );
  const [editorWrapEl, setEditorWrapEl] = useState<HTMLDivElement | null>(null);
  const kit = useMobileContentKit("edit");
  // 工具栏等页面级浮层挂进本页根容器，才能随页面转场动画一起平移、退场
  const [pageRootEl, setPageRootEl] = useState<HTMLDivElement | null>(null);

  const [titleDraft, setTitleDraft] = useState(() =>
    resolveTitle({
      contentTitle: props.contentTitle,
      contentId: props.contentId,
    })
  );
  useEffect(() => {
    setTitleDraft(
      resolveTitle({
        contentTitle: props.contentTitle,
        contentId: props.contentId,
      })
    );
  }, [props.contentId, props.contentTitle]);
  const titleAreaRef = useRef<HTMLTextAreaElement | null>(null);
  // 标题由各业务表管理（协作投影只回写正文），始终走本地重命名路径
  const commitTitle = () => {
    const next = titleDraft.trim();
    if (!next || next === (props.contentTitle ?? "").trim()) {
      return;
    }
    props.onTitleCommit?.(next);
  };
  // 系统返回手势/物理返回键直接卸载组件时不触发 onBlur，用 ref 兜底提交最新草稿
  const commitTitleRef = useRef(commitTitle);
  commitTitleRef.current = commitTitle;
  useEffect(() => {
    return () => {
      commitTitleRef.current();
    };
  }, []);

  // 详情由 useEditContent 的单次 getContentDetail 经 onLoaded 透出，本组件不再重复拉取；
  // 这里仅做换内容/无效 id 的复位，避免闪现上一篇的正文
  useEffect(() => {
    setDetail(prev => (prev && prev.contentId === props.contentId ? prev : null));
  }, [props.contentId]);

  useEffect(() => {
    return () => {
      void flushNow();
    };
  }, [flushNow]);

  const autoGrowTitle = (node: HTMLTextAreaElement | null) => {
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  };

  const hasCover = Boolean(props.coverSlot);
  // 非封面模式：顶部渐隐随滚动状态显隐（封面模式由 --header-p 驱动，见 edge-fade-cover-top）
  const noCoverScrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(noCoverScrollRef);
  // 封面沉浸页：滚动进度写入 --header-p（挂在 scrim/顶栏/滚动容器的共同父级），纯 DOM 写零 re-render
  const coverShellRef = useRef<HTMLDivElement>(null);
  const coverScrollRef = useRef<HTMLDivElement>(null);
  // 底部渐隐随滚动收放（滚到底内容完整），与无封面模式同构
  useEdgeFade(coverScrollRef);
  const getScrollContainer = useCallback(
    () => (hasCover ? coverScrollRef.current : noCoverScrollRef.current),
    [hasCover]
  );
  const blockDrag = useBlockDrag({
    editorRef,
    container: editorWrapEl,
    getScrollContainer,
    toolbarController,
  });
  // 阅读态、强制只读、块选择与拖拽块期间配件栏收起
  const toolbarReadonly = editorReadonly || blockSelection.active || blockDrag.dragging !== null;
  const syncCoverHeaderFade = () => {
    const scrolled = coverScrollRef.current?.scrollTop ?? 0;
    coverShellRef.current?.style.setProperty(
      "--header-p",
      String(Math.min(1, scrolled / COVER_HEADER_FADE_RANGE))
    );
  };
  const wordCount = detail?.count ?? 0;

  // 顶栏中央统一显示内容类型名：日记/卡片为固定文案，文章/项目文档/知识库沿用 contentType；
  // 保存状态不再占用顶栏，改在正文 meta 行随日期/字数一起展示
  const headerTitle = props.diaryDate ? "日记" : props.titleEditable ? props.contentType : "卡片";

  // 封面沉浸页顶栏浮于封面之上：白/棕双层标题随滚动交叉过渡（--header-p 驱动，见 styles.css）
  const headerCenter = headerTitle ? (
    hasCover ? (
      <span className="cover-title-fade line-clamp-1 block text-center text-[18px] font-extrabold">
        <span className="cover-title-fade-white">{headerTitle}</span>
        <span className="cover-title-fade-ink" aria-hidden>
          {headerTitle}
        </span>
      </span>
    ) : (
      <span className="text-ink-1 line-clamp-1 block text-center text-[18px] font-extrabold">
        {headerTitle}
      </span>
    )
  ) : null;

  // 顶栏只放返回 / 标题 / 宿主操作；编辑入口是右下角悬浮按钮，退出编辑在配件栏「完成」
  const headerActions = props.headerRight;
  const fabVisible =
    Boolean(detail && kit) &&
    readingMode.canEdit &&
    !readingMode.editing &&
    !blockSelection.active &&
    blockDrag.dragging === null &&
    readingSelection.range === null;

  const renderBlockSelectionHeader = (floating: boolean) => (
    <BlockSelectionHeader
      selectedCount={blockSelection.selected.length}
      totalCount={blockCount}
      onCancel={blockSelection.exit}
      onSelectAll={blockSelection.selectAll}
      onDeselectAll={() => blockSelection.setSelected([])}
      floating={floating}
    />
  );

  const saveStatusNode = saving ? (
    <span className="text-ink-2 text-[12px]">保存中…</span>
  ) : saveError ? (
    <span className="text-danger text-[12px] font-medium">保存失败</span>
  ) : props.diaryDate ? (
    <span className="text-ok flex items-center gap-1.5 text-[12px] font-medium tabular-nums">
      <span className="bg-ok h-[5.5px] w-[5.5px] rounded-full" aria-hidden />
      已保存 · {wordCount.toLocaleString()} 字
    </span>
  ) : null;

  const tags = detail?.card?.tags ?? [];
  // 脉络胶囊挂在元信息行末尾；关联卡片是脉络「连接」分区的一部分，在浮层里查看
  const contextChip = props.contextEntity ? (
    <ContextBadge
      kind={props.contextEntity.kind}
      id={props.contextEntity.id}
      refreshKey={props.refreshKey ?? 0}
      onError={props.onError}
    />
  ) : null;

  // 类型徽章（方案 A 定稿）：卡片 / 文章 / 知识库 / 项目文档共用同一胶囊语言
  const typeBadge = props.contentType ? (
    props.contentTypeBadge ? (
      <span
        className={`inline-flex items-center gap-[5px] rounded-full px-3 py-[4.5px] text-[12.5px] font-bold ${props.contentTypeBadge.className}`}
      >
        {props.contentTypeBadge.icon ? (
          <props.contentTypeBadge.icon size={13.5} strokeWidth={2.4} aria-hidden />
        ) : null}
        {props.contentType}
      </span>
    ) : (
      <span className="bg-page text-ink-2 inline-flex items-center rounded-full px-3 py-[4.5px] text-[12.5px] font-bold">
        {props.contentType}
      </span>
    )
  ) : null;

  // 骨架屏仅用于无旧详情可显时（首载/换内容），返回刷新期间保留旧正文占位
  const body =
    !detail && contentLoading ? (
      <div className="space-y-3 pt-4">
        <div className="bg-page h-4 w-2/5 animate-pulse rounded" />
        <div className="bg-page h-4 w-4/5 animate-pulse rounded" />
        <div className="bg-page h-4 w-full animate-pulse rounded" />
        <div className="bg-page h-4 w-3/4 animate-pulse rounded" />
      </div>
    ) : detail ? (
      <div>
        {props.diaryDate ? (
          <div className="pt-6">
            <h1 className="text-ink-1 mobile-reading-font text-[31px] leading-tight font-extrabold tracking-[-0.02em]">
              {props.diaryDate.title}
            </h1>
            <p className="text-ink-2 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              {props.diaryDate.sub ? <span>{props.diaryDate.sub}</span> : null}
              {props.diaryDate.sub ? <MetaDot /> : null}
              {saveStatusNode}
            </p>
          </div>
        ) : null}

        {props.titleEditable ? (
          <div className="pt-2">
            <textarea
              ref={node => {
                titleAreaRef.current = node;
                autoGrowTitle(node);
              }}
              value={titleDraft}
              rows={1}
              placeholder="给文档起个标题…"
              onChange={event => {
                setTitleDraft(event.target.value);
                autoGrowTitle(event.target);
              }}
              onBlur={commitTitle}
              className="text-ink-1 caret-accent placeholder:text-ink-3 mobile-reading-font mt-2 w-full resize-none border-none bg-transparent text-[31px] leading-tight font-extrabold tracking-[-0.02em] outline-none"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {typeBadge}
              <div className="text-ink-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium tabular-nums">
                <span>{formatTimeLabel(detail.updateTime)}</span>
                <MetaDot />
                <span>{wordCount.toLocaleString()} 字</span>
                {saveStatusNode ? (
                  <>
                    <MetaDot />
                    {saveStatusNode}
                  </>
                ) : null}
              </div>
              {contextChip}
            </div>
            {props.sourceRef ? (
              <button
                type="button"
                onClick={props.sourceRef.onOpen}
                className="text-ink-2 mt-2.5 flex w-full items-center gap-1.5 text-[12px] font-medium transition-opacity active:opacity-60"
              >
                <CornerUpRight
                  size={13}
                  strokeWidth={2.4}
                  className={`shrink-0 ${props.sourceRef.toneClass ?? "text-accent"}`}
                />
                <span className="shrink-0">来自</span>
                <span
                  className={`min-w-0 truncate font-semibold ${props.sourceRef.toneClass ?? "text-accent"}`}
                >
                  {props.sourceRef.label}
                </span>
                <span className="text-ink-3 shrink-0 text-[11px]">{props.sourceRef.typeLabel}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {!props.titleEditable && !props.diaryDate ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-5">
            {typeBadge}
            <div className="text-ink-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium tabular-nums">
              <span>{formatTimeLabel(detail.updateTime)}</span>
              <MetaDot />
              <span>{wordCount.toLocaleString()} 字</span>
              {typeof props.refId === "number" && props.refId > 0 ? (
                <>
                  <MetaDot />
                  <span>Ref #{props.refId}</span>
                </>
              ) : null}
            </div>
            {contextChip}
          </div>
        ) : null}

        {props.collaboration ? (
          // 正文编辑器在下方统一渲染；本组件只管会话、状态条与裁决弹窗
          <Suspense fallback={null}>
            <CollaborativeEditor
              documentId={props.collaboration.documentId}
              contentId={props.contentId}
              onDocumentChange={setCollabDocument}
              presenceRef={presence => (collabPresence.current = presence)}
              onReadonlyChange={setCollabReadonly}
              onModeChange={setCollabMode}
              onCollaborationEnded={props.onCollaborationEnded}
            />
          </Suspense>
        ) : null}

        <div
          ref={setEditorWrapEl}
          className={cn(
            "relative min-h-[45vh] pt-5 transition-[padding] duration-200",
            blockSelection.active && BLOCK_SELECTION_INSET_CLASS
          )}
          // 块选择期间由覆盖层接管点击，阅读态的双击进入编辑与勾选待办不生效
          {...(blockSelection.active ? {} : readingMode.readingSurfaceProps)}
        >
          {kit ? (
            <>
              <Editor
                kit={kit}
                ref={editorRef}
                document={document}
                className="mobile-card-editor-content"
                readonly={editorReadonly}
                onFocus={() => {
                  collabPresence.current?.onFocus();
                  toolbarController.handleEditorFocus();
                }}
                onBlur={() => {
                  collabPresence.current?.onBlur();
                  toolbarController.handleEditorBlur();
                }}
                onSelectionChange={toolbarController.syncSelection}
              />
            </>
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

        {detail?.card ? (
          <TagInlineEditor
            tags={tags}
            onCommit={async next => {
              const card = detail.card;
              if (!card) return;
              await tauri.updateCardTags({ id: card.id, tags: next });
              setDetail(prev =>
                prev?.card ? { ...prev, card: { ...prev.card, tags: next } } : prev
              );
            }}
            onError={props.onError}
          />
        ) : props.tags !== undefined && props.onTagsCommit ? (
          <TagInlineEditor
            tags={props.tags}
            onCommit={props.onTagsCommit}
            onError={props.onError}
          />
        ) : tags.length > 0 ? (
          <TagChips tags={tags} variant="soft" className="mt-6" />
        ) : null}

        {props.belowEditor}
      </div>
    ) : (
      <div className="py-12 text-center">
        <p className="text-ink-3 text-sm">无可展示内容</p>
      </div>
    );

  return (
    <div
      ref={setPageRootEl}
      className="mobile-kb-screen mobile-paper-page bg-surface fixed inset-0 z-50 flex flex-col"
    >
      {hasCover ? (
        <div ref={coverShellRef} className="relative flex-1 overflow-hidden">
          <div
            aria-hidden
            className="cover-scrim-fade pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-black/45 to-transparent"
          />
          {blockSelection.active ? (
            renderBlockSelectionHeader(true)
          ) : (
            <PageHeader
              transparent
              center={headerCenter}
              onBack={() => {
                commitTitle();
                props.onBack();
              }}
              actions={headerActions}
            />
          )}
          <div
            ref={node => {
              coverScrollRef.current = node;
              syncCoverHeaderFade();
            }}
            className="edge-fade-cover-top mobile-page-scroll absolute inset-x-0 top-0 bottom-0 overflow-y-auto"
            onScroll={syncCoverHeaderFade}
          >
            {props.coverSlot}
            <div className="px-6">{body}</div>
          </div>
        </div>
      ) : (
        <>
          {blockSelection.active ? (
            renderBlockSelectionHeader(false)
          ) : (
            <PageHeader
              center={headerCenter}
              onBack={() => {
                commitTitle();
                props.onBack();
              }}
              actions={headerActions}
            />
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              ref={noCoverScrollRef}
              className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-6"
            >
              {body}
            </div>
          </div>
        </>
      )}
      <ReadingModeFab
        visible={fabVisible}
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
    </div>
  );
}

export default ContentDetailPage;
