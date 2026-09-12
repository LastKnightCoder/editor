import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import type { Descendant } from "slate";
import { CornerUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";
import { Editor, type EditorRef } from "@tau/editor/src";
import * as tauri from "../../services/tauri";
import type { ContentDetailResponse } from "../../types";
import { formatDateTimeCompact } from "../../utils/formatTime";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { useEditContent } from "../../hooks/useEditContent";
import { MobileEditorBottomToolbar } from "./editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "./editorToolbar/useMobileEditorToolbarController";
import { mobileCardPreviewExtensions } from "./editorExtensions";
import LinksDisclosure from "./LinksDisclosure";
import TagChips from "./TagChips";
import TagInlineEditor from "./TagInlineEditor";

type EditorDocument = ComponentProps<typeof Editor>["initValue"];

const EMPTY_EDITOR_CONTENT: EditorDocument = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

/** 封面页顶栏渐显实底的滚动过渡距离（px）：略大于顶栏高度，给 scrim→实底切换留缓冲 */
const COVER_HEADER_FADE_RANGE = 140;

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
  /** 日记日期头：日期即标题，与正文同处一张「纸」，不再另起元信息卡 */
  diaryDate?: { title: string; sub?: string };
  /** 通用内容详情的标签源（文章 / 知识库 / 项目文档）：传入即启用内联添加 */
  tags?: string[];
  onTagsCommit?: (tags: string[]) => Promise<void>;
  /** 来源引用（知识库 / 项目文档节点为卡片或文章的镜像时展示） */
  sourceRef?: {
    label: string;
    typeLabel: string;
    /** 图标与标题的域色（如 text-sky / text-butter），缺省用品牌色 */
    toneClass?: string;
    onOpen: () => void;
  };
  /** 通用模式下的类型徽章（soft 底胶囊类名 + 可选图标，方案 A 定稿徽章行），卡片分类用 */
  contentTypeBadge?: { icon?: LucideIcon; className: string };
  /** 顶部全宽封面插槽（文章编辑页：真实 banner 沉浸展示，更换封面入口在列表 ⋯ 菜单） */
  coverSlot?: ReactNode;
  /** 编辑器下方插槽（如知识库的关联面板） */
  belowEditor?: ReactNode;
  /** 工具条吸底常显（默认编辑态的页面开启；卡片原行为保持聚焦才出现） */
  persistentToolbar?: boolean;
  /** 外部刷新信号（页面 onResume 等），变化时强制重拉详情（双向关联由对侧写入时本页无感知） */
  refreshKey?: number;
};

function formatTimeLabel(value: number): string {
  return value ? formatDateTimeCompact(value) : "--";
}

function normalizeEditorContent(content: unknown): EditorDocument {
  if (!Array.isArray(content) || content.length === 0) {
    return EMPTY_EDITOR_CONTENT;
  }
  return content as Descendant[] as EditorDocument;
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

export function ContentDetailPage(props: ContentDetailPageProps) {
  const { theme } = useMobileTheme();
  const editorRef = useRef<EditorRef | null>(null);
  const [detail, setDetail] = useState<ContentDetailResponse | null>(null);
  // 回调入 ref：父层传内联函数时，避免其引用变化触发详情重复拉取
  const onErrorRef = useRef(props.onError);
  onErrorRef.current = props.onError;
  const {
    content,
    syncVersion,
    loading: contentLoading,
    saving,
    error: saveError,
    throttleHandleEditorContentChange,
    flushNow,
  } = useEditContent(props.contentId, {
    refreshKey: props.refreshKey,
    onLoaded: result => setDetail(result),
    onLoadError: error => onErrorRef.current?.(error, "内容详情加载失败"),
    onSaved: saved => {
      setDetail(prev => ({
        ...(prev ?? saved),
        updateTime: saved.updateTime,
        count: saved.count,
        content: saved.content,
      }));
      props.onSaved?.(saved);
    },
    onSaveError: error => {
      props.onError?.(error, "内容自动保存失败");
    },
  });
  const toolbarController = useMobileEditorToolbarController({
    editorRef,
  });
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
  useEdgeFade(noCoverScrollRef, { bottom: false });
  // 封面沉浸页：滚动进度写入 --header-p（挂在 scrim/顶栏/滚动容器的共同父级），纯 DOM 写零 re-render
  const coverShellRef = useRef<HTMLDivElement>(null);
  const coverScrollRef = useRef<HTMLDivElement>(null);
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
      <span className="text-ink line-clamp-1 block text-center text-[18px] font-extrabold">
        {headerTitle}
      </span>
    )
  ) : null;

  const saveStatusNode = saving ? (
    <span className="text-meta-ink text-[12px]">保存中…</span>
  ) : saveError ? (
    <span className="text-danger text-[12px] font-medium">保存失败</span>
  ) : props.diaryDate ? (
    <span className="text-ok flex items-center gap-1.5 text-[12px] font-medium tabular-nums">
      <span className="bg-ok h-[5.5px] w-[5.5px] rounded-full" aria-hidden />
      已保存 · {wordCount.toLocaleString()} 字
    </span>
  ) : null;

  const tags = detail?.card?.tags ?? [];
  const links = detail?.card?.links ?? [];

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
      <span className="bg-input text-meta-ink inline-flex items-center rounded-full px-3 py-[4.5px] text-[12.5px] font-bold">
        {props.contentType}
      </span>
    )
  ) : null;

  // 骨架屏仅用于无旧详情可显时（首载/换内容），返回刷新期间保留旧正文占位
  const body =
    !detail && contentLoading ? (
      <div className="space-y-3 pt-4">
        <div className="bg-input h-4 w-2/5 animate-pulse rounded" />
        <div className="bg-input h-4 w-4/5 animate-pulse rounded" />
        <div className="bg-input h-4 w-full animate-pulse rounded" />
        <div className="bg-input h-4 w-3/4 animate-pulse rounded" />
      </div>
    ) : detail ? (
      <div>
        {props.diaryDate ? (
          <div className="pt-6">
            <h1 className="text-ink text-[31px] font-extrabold leading-tight tracking-[-0.02em]">
              {props.diaryDate.title}
            </h1>
            <p className="text-meta-ink mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
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
              className="text-ink caret-accent placeholder:text-ink-3 mt-2 w-full resize-none border-none bg-transparent text-[31px] font-extrabold leading-tight tracking-[-0.02em] outline-none"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {typeBadge}
              <div className="text-meta-ink flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium tabular-nums">
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
            </div>
            {props.sourceRef ? (
              <button
                type="button"
                onClick={props.sourceRef.onOpen}
                className="text-meta-ink mt-2.5 flex w-full items-center gap-1.5 text-[12px] font-medium transition-opacity active:opacity-60"
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
            <div className="text-meta-ink flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium tabular-nums">
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
          </div>
        ) : null}

        <div className="min-h-[45vh] pt-1">
          <Editor
            ref={editorRef}
            key={`editable-content-${props.contentId}-${syncVersion}`}
            initValue={normalizeEditorContent(content)}
            className="mobile-card-editor-content"
            onFocus={toolbarController.handleEditorFocus}
            onBlur={toolbarController.handleEditorBlur}
            onChange={value => {
              throttleHandleEditorContentChange(value);
              toolbarController.syncSelection();
            }}
            onSelectionChange={toolbarController.syncSelection}
            readonly={false}
            theme={theme}
            extensions={mobileCardPreviewExtensions}
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
          <TagChips tags={tags} className="mt-5" />
        ) : null}

        <LinksDisclosure
          links={links}
          cardId={detail?.card?.id}
          onLinksChanged={nextLinks =>
            setDetail(prev =>
              prev?.card ? { ...prev, card: { ...prev.card, links: nextLinks } } : prev
            )
          }
          onError={props.onError}
        />

        {props.belowEditor}
      </div>
    ) : (
      <div className="py-12 text-center">
        <p className="text-ink-3 text-sm">无可展示内容</p>
      </div>
    );

  return (
    <div ref={setPageRootEl} className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      {hasCover ? (
        <div ref={coverShellRef} className="relative flex-1 overflow-hidden">
          <div
            aria-hidden
            className="cover-scrim-fade pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-black/45 to-transparent"
          />
          <PageHeader
            transparent
            center={headerCenter}
            onBack={() => {
              commitTitle();
              props.onBack();
            }}
            actions={props.headerRight}
          />
          <div
            ref={node => {
              coverScrollRef.current = node;
              syncCoverHeaderFade();
            }}
            className="edge-fade-cover-top mobile-floating-toolbar-scroll absolute inset-0 overflow-y-auto"
            onScroll={syncCoverHeaderFade}
          >
            {props.coverSlot}
            <div className="px-6">{body}</div>
          </div>
        </div>
      ) : (
        <>
          <PageHeader
            center={headerCenter}
            onBack={() => {
              commitTitle();
              props.onBack();
            }}
            actions={props.headerRight}
          />
          <div
            ref={noCoverScrollRef}
            className="edge-fade-scroll mobile-floating-toolbar-scroll flex-1 overflow-y-auto px-6"
          >
            {body}
          </div>
        </>
      )}
      <MobileEditorBottomToolbar
        controller={toolbarController}
        persistent={props.persistentToolbar}
        portalContainer={pageRootEl}
      />
    </div>
  );
}

export default ContentDetailPage;
