// 内容引用的底部预览面板：阅读态点引用、编辑态配件栏「预览」共用。
// 头部是类型、标题与更新时间，中间只读预览正文（上拉全屏可读完），底部「打开」跳到对应详情页。

import { useEffect, useState, type CSSProperties, type ComponentType, type ReactNode } from "react";
import { ArrowUpRight, Lock, Unlink, type LucideIcon } from "lucide-react";
import { cn } from "@tau/ui";
import type { EditorKit } from "@tau/editor";
import { useThemeStore } from "@tau/themes/react";

import { SnapSheet, type SnapSheetState } from "../../../components/SnapSheet";
import { formatTimeDisplay } from "../../../utils/formatTime";
import { EntityKindIcon } from "../../context/EntityKindIcon";
import {
  canOpenContentLink,
  getContentLinkKindMeta,
  openContentLink,
  useContentLinkDetail,
  useContentLinkEntity,
  useIsUnsharedContentLink,
  type ContentLinkTarget,
} from "./contentLinkModel";

type PreviewEditorProps = {
  initValue: unknown;
  readonly?: boolean;
  kit?: EditorKit;
  theme?: "light" | "dark";
  className?: string;
};

/** 预览用编辑器与它的 content 场景 kit，一起懒加载（避免扩展模块绕回 editorKit） */
type PreviewRenderer = {
  Editor: ComponentType<PreviewEditorProps>;
  /** 每次渲染取当前 kit：插件会话晚于预览加载时也能显示插件节点 */
  getKit: () => EditorKit;
};

let rendererCache: PreviewRenderer | null = null;
let rendererPromise: Promise<PreviewRenderer> | null = null;

function loadPreviewRenderer(): Promise<PreviewRenderer> {
  if (rendererCache) return Promise.resolve(rendererCache);
  rendererPromise ??= Promise.all([import("@tau/editor"), import("../../../services/editorKit")])
    .then(([editorModule, kitModule]) => {
      rendererCache = {
        Editor: editorModule.Editor as ComponentType<PreviewEditorProps>,
        getKit: kitModule.getMobileContentKit,
      };
      return rendererCache;
    })
    .finally(() => {
      rendererPromise = null;
    });
  return rendererPromise;
}

function usePreviewRenderer(enabled: boolean): PreviewRenderer | null {
  const [renderer, setRenderer] = useState(rendererCache);
  useEffect(() => {
    if (!enabled || renderer) return;
    let active = true;
    void loadPreviewRenderer().then(next => {
      if (active) setRenderer(next);
    });
    return () => {
      active = false;
    };
  }, [enabled, renderer]);
  return renderer;
}

const EMPTY_CONTENT = [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];

/** 底部操作条高度（不含安全区），正文滚动区据此留白 */
const FOOTER_HEIGHT = 68;

function Header(props: {
  icon: LucideIcon;
  iconSvg?: string;
  tone: string;
  title: string;
  meta: ReactNode;
}) {
  const { icon: Icon, tone, title, meta } = props;
  return (
    <header className="flex items-start gap-3 px-5 pb-3">
      <span className={cn("grid size-[38px] shrink-0 place-items-center rounded-[11px]", tone)}>
        <EntityKindIcon svg={props.iconSvg} fallback={Icon} size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-tau-title text-ink-1 line-clamp-2 leading-snug font-bold">{title}</p>
        <p className="text-tau-sm text-ink-2 mt-0.5 truncate">{meta}</p>
      </div>
    </header>
  );
}

function BodySkeleton() {
  return (
    <div className="space-y-3 pt-1">
      {["w-[92%]", "w-4/5", "w-[86%]", "w-3/5"].map(width => (
        <div key={width} className={cn("bg-hover h-3 animate-pulse rounded-md", width)} />
      ))}
    </div>
  );
}

// 行内节点每次渲染都会重新读出 target，按值比较
const isSameTarget = (a: ContentLinkTarget, b: ContentLinkTarget | null) =>
  !!b &&
  a.contentId === b.contentId &&
  a.refId === b.refId &&
  a.contentType === b.contentType &&
  a.contentTitle === b.contentTitle;

type ContentLinkPreviewSheetProps = {
  open: boolean;
  target: ContentLinkTarget | null;
  /** reason 为 "open" 表示随后跳转详情页，调用方不必恢复编辑器焦点 */
  onClose: (reason?: "open") => void;
};

export function ContentLinkPreviewSheet(props: ContentLinkPreviewSheetProps) {
  // 关闭时调用方可能清空 target，沿用上一次的内容播完退场动画
  const [lastTarget, setLastTarget] = useState(props.target);
  if (props.target && !isSameTarget(props.target, lastTarget)) setLastTarget(props.target);
  const target = props.target ?? lastTarget;
  // 从未打开过时不挂载面板，也不触碰查询
  if (!target) return null;
  return <PreviewSheet open={props.open} target={target} onClose={props.onClose} />;
}

function PreviewSheet(props: ContentLinkPreviewSheetProps & { target: ContentLinkTarget }) {
  const { open, target, onClose } = props;
  const [panelState, setPanelState] = useState<SnapSheetState>("normal");
  const theme = useThemeStore(s => s.mode);
  const unshared = useIsUnsharedContentLink();
  const contentId = target.contentId;
  const pluginEntity = target.contentType === "plugin-entity";
  const entity = useContentLinkEntity(target, open && !unshared);
  const detail = useContentLinkDetail(
    contentId,
    open && !unshared && (!pluginEntity || !!entity.data)
  );
  const renderer = usePreviewRenderer(open && !unshared);

  useEffect(() => {
    if (!open) setPanelState("normal");
  }, [open]);

  const kind = getContentLinkKindMeta(target.contentType);
  const label = entity.data?.label || kind.label;
  const title = entity.data?.title || target.contentTitle || label;
  const broken =
    !unshared && (contentId <= 0 || detail.data === null || (pluginEntity && entity.data === null));
  const hasBody = !unshared && !broken;
  const openable =
    hasBody &&
    !detail.isError &&
    !entity.isError &&
    (!pluginEntity || !!entity.data) &&
    canOpenContentLink(target);

  const handleOpen = () => {
    onClose("open");
    openContentLink(target);
  };

  let header: ReactNode;
  if (unshared) {
    header = (
      <Header
        icon={Lock}
        tone="bg-warn-soft text-warn"
        title={title}
        meta="内容未共享，只保存在创建者本机"
      />
    );
  } else if (broken) {
    header = (
      <Header
        icon={Unlink}
        tone="bg-hover text-ink-3"
        title="引用已失效"
        meta="引用的内容不存在或已被删除"
      />
    );
  } else {
    let meta = "正在载入…";
    if (detail.isError || entity.isError) meta = "预览加载失败";
    else if (detail.data) {
      const parts = [label, `更新于 ${formatTimeDisplay(detail.data.updateTime)}`];
      if (detail.data.count > 0) parts.push(`约 ${detail.data.count} 字`);
      meta = parts.join(" · ");
    }
    header = (
      <Header
        icon={kind.icon}
        iconSvg={entity.data?.icon}
        tone={kind.tone}
        title={title}
        meta={meta}
      />
    );
  }

  const tags = detail.data?.card?.tags ?? [];

  return (
    <SnapSheet
      open={open}
      state={panelState}
      states={hasBody ? ["normal", "full"] : ["normal"]}
      normalHeight={hasBody ? 0.62 : 0.3}
      onClose={() => onClose()}
      onStateChange={setPanelState}
    >
      <>
        <SnapSheet.Handle />
        <div className={panelState === "full" ? "mobile-safe-top-gap" : undefined}>{header}</div>
        {hasBody ? (
          <>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 px-5 pb-2.5">
                {tags.slice(0, 4).map(tag => (
                  <span
                    key={tag}
                    className="bg-accent-soft text-accent-text text-tau-micro rounded-md px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <SnapSheet.FixedFooterScroll
              className="px-5"
              style={{ "--mobile-sheet-footer-height": `${FOOTER_HEIGHT}px` } as CSSProperties}
            >
              {detail.data && renderer ? (
                <renderer.Editor
                  key={`${detail.data.contentId}-${detail.data.updateTime}`}
                  initValue={
                    Array.isArray(detail.data.content) && detail.data.content.length > 0
                      ? detail.data.content
                      : EMPTY_CONTENT
                  }
                  readonly
                  theme={theme}
                  kit={renderer.getKit()}
                  className="mobile-card-editor-content"
                />
              ) : detail.isError || entity.isError ? null : (
                <BodySkeleton />
              )}
            </SnapSheet.FixedFooterScroll>
            {openable ? (
              <footer
                className="bg-surface border-line-2 absolute inset-x-0 z-10 border-t px-4 pt-2.5"
                style={{
                  bottom: "var(--pan-occluded-bottom, 0px)",
                  paddingBottom: "calc(10px + var(--mobile-overlay-bottom))",
                }}
              >
                <button
                  type="button"
                  onClick={handleOpen}
                  className="bg-accent text-ink-inverse text-tau-body flex h-[46px] w-full items-center justify-center gap-1.5 rounded-[14px] font-semibold transition-transform active:scale-[0.98]"
                >
                  <ArrowUpRight size={18} strokeWidth={2.2} aria-hidden />
                  打开{label}
                </button>
              </footer>
            ) : null}
          </>
        ) : null}
      </>
    </SnapSheet>
  );
}

export default ContentLinkPreviewSheet;
