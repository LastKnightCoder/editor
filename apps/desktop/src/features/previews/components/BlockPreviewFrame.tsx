/**
 * 统一预览框（D-057）：所有对话块共用的 chrome。
 *
 *   图标 · 标题 / 类型·大小 · ‹ vN / M › · 预览⇄源码 · 专属工具 · 复制 · 全屏 · 更多 · 关闭
 *
 * 渲染器只画内容本体，并经 usePreviewActions 声明专属工具 / 更多菜单 / 缩放；缩放浮在
 * 预览区右下角。生成中：source-first 类型（HTML）先看源码流式写入、写完自动切回预览
 * （用户手动切过就尊重用户）；其余类型保持预览、头部显示进度。内容崩溃只替换预览区
 * （ErrorState + 查看源码），内容变化自动重试。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Plus,
  Scan,
  X,
} from "lucide-react";
import { IconButton, Menu, Segmented, Spinner, Tooltip, cn, toast } from "@tau/ui";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import type { BlockData, BlockRenderer } from "@/types/block-preview";
import { formatBlockSize } from "@/utils/blockRegistry";
import {
  PreviewActionsContext,
  mergePreviewActions,
  type PublishedActions,
  type PublishPreviewActions,
} from "./previewActions";
import { SourceView } from "./SourceView";

export interface BlockVersionNav {
  version: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}

type View = "preview" | "source";

const SURFACE: Record<NonNullable<BlockRenderer["surface"]>, string> = {
  white: "bg-white",
  canvas:
    "bg-surface [background-image:radial-gradient(var(--tau-line-1)_1px,transparent_1px)] [background-size:18px_18px]",
  plain: "bg-page",
};

function Tool({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label} placement="bottom" delay={300}>
      <IconButton
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "size-7 [&_svg]:size-[15px]",
          active && "bg-selected text-accent-text enabled:hover:text-accent-text"
        )}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

export function BlockPreviewFrame({
  block,
  renderer,
  generating,
  versions,
  onClose,
  className,
}: {
  block: BlockData;
  renderer: BlockRenderer;
  generating: boolean;
  versions?: BlockVersionNav;
  onClose?: () => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sourceFirst = renderer.streaming === "source-first";
  const [manualView, setManualView] = useState<View | null>(null);
  const view: View = manualView ?? (generating && sourceFirst ? "source" : "preview");
  const [fullscreen, setFullscreen] = useState(false);
  const [sources, setSources] = useState<ReadonlyMap<string, PublishedActions>>(new Map());
  const publish = useCallback<PublishPreviewActions>(
    (source, entry) =>
      setSources(prev => {
        if (entry ? prev.get(source)?.sig === entry.sig : !prev.has(source)) return prev;
        const next = new Map(prev);
        if (entry) next.set(source, entry);
        else next.delete(source);
        return next;
      }),
    []
  );

  // 换块（切版本 / 打开另一块）时回到自动视图
  useEffect(() => setManualView(null), [block.id]);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen().catch(() => toast.error("无法进入全屏"));
  };

  const copySource = () =>
    void navigator.clipboard.writeText(block.content).then(
      () => toast.success("源码已复制"),
      () => toast.error("复制失败")
    );

  // 渲染时按当前登记合并；点击时再合并一次，拿到各来源 ref 里的最新回调
  const spec = mergePreviewActions(sources.values());
  const latestSpec = () => mergePreviewActions(sources.values());
  const run = (kind: "tools" | "more", key: string) => {
    const action = latestSpec()[kind]?.find(a => a.key === key);
    void Promise.resolve(action?.onSelect()).catch(error => {
      console.error(error);
      toast.error(`${action?.label ?? "操作"}失败`);
    });
  };

  const Icon = renderer.icon;
  const title = block.metadata.title || renderer.label;
  const lines = block.content.split("\n").length;
  const Preview = renderer.Preview;
  const zoom = view === "preview" ? spec?.zoom : undefined;

  return (
    <div ref={rootRef} className={cn("bg-surface flex h-full min-h-0 flex-col", className)}>
      <div className="flex h-12 flex-none items-center gap-2 pl-4 pr-2.5">
        <span className="bg-tag-3-soft text-tag-3 grid size-[26px] shrink-0 place-items-center rounded-[8px]">
          <Icon size={15} strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-ink-1 truncate text-[13.5px] font-semibold">{title}</span>
          <span className="text-tau-tiny text-ink-3 flex items-center gap-1.5 whitespace-nowrap">
            {generating ? (
              <>
                <Spinner className="size-3 border-[1.5px]" />
                生成中 · 已写入 {lines} 行
              </>
            ) : (
              <>
                {renderer.label} · {formatBlockSize(block.content)}
                {renderer.note && <> · {renderer.note}</>}
              </>
            )}
          </span>
        </div>

        <div className="flex flex-none items-center gap-0.5">
          {versions && versions.count > 1 && (
            <span className="text-tau-sm text-ink-2 mr-1 flex items-center tabular-nums">
              <Tool label="上一版" onClick={versions.onPrev} disabled={versions.version <= 1}>
                <ChevronLeft />
              </Tool>
              v{versions.version} / {versions.count}
              <Tool
                label="下一版"
                onClick={versions.onNext}
                disabled={versions.version >= versions.count}
              >
                <ChevronRight />
              </Tool>
            </span>
          )}
          <Segmented
            label="预览或源码"
            size="sm"
            value={view}
            onValueChange={v => setManualView(v as View)}
            className="mr-1"
          >
            <Segmented.Item value="preview" label="预览" />
            <Segmented.Item value="source" label="源码" />
          </Segmented>
          {view === "preview" &&
            spec?.tools?.map(a => (
              <Tool
                key={a.key}
                label={a.label}
                active={a.active}
                disabled={a.disabled}
                onClick={() => run("tools", a.key)}
              >
                <a.icon />
              </Tool>
            ))}
          <Tool label="复制源码" onClick={copySource}>
            <Copy />
          </Tool>
          <Tool label={fullscreen ? "退出全屏" : "全屏"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </Tool>
          {!!spec?.more?.length && (
            <Menu
              align="end"
              trigger={
                <IconButton aria-label="更多" title="更多" className="size-7 [&_svg]:size-[15px]">
                  <MoreHorizontal />
                </IconButton>
              }
            >
              {spec.more.map(a => (
                <Menu.Item
                  key={a.key}
                  icon={<a.icon size={15} strokeWidth={1.75} />}
                  disabled={a.disabled || view !== "preview"}
                  onSelect={() => run("more", a.key)}
                >
                  {a.label}
                </Menu.Item>
              ))}
            </Menu>
          )}
          {onClose && (
            <>
              <span className="w-1.5" />
              <Tool label="关闭" onClick={onClose}>
                <X />
              </Tool>
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          "rounded-tau-md relative mx-2.5 mb-2.5 min-h-0 flex-1 overflow-hidden",
          view === "source" ? "bg-page" : SURFACE[renderer.surface ?? "plain"]
        )}
      >
        {view === "source" ? (
          <SourceView code={block.content} language={renderer.sourceLanguage} follow={generating} />
        ) : (
          <PreviewActionsContext.Provider value={publish}>
            <RecoverableBoundary
              resetKeys={[block.id, block.content]}
              fallback={({ error, reset }) => (
                <ErrorState
                  error={error}
                  title="预览失败"
                  description="这段内容暂时无法渲染，可能是生成的内容不完整或格式有误。"
                  actions={[
                    { label: "查看源码", onClick: () => setManualView("source") },
                    { label: "重试", onClick: reset },
                  ]}
                />
              )}
            >
              <Preview block={block} generating={generating} />
            </RecoverableBoundary>
          </PreviewActionsContext.Provider>
        )}

        {zoom && (
          <div className="bg-surface border-line-1 shadow-lift text-tau-tiny text-ink-2 absolute bottom-2.5 right-2.5 flex items-center gap-0.5 rounded-[10px] border p-[3px]">
            <Tool label="缩小" onClick={() => latestSpec().zoom?.zoomOut()}>
              <Minus />
            </Tool>
            {zoom.percent !== undefined && (
              <span className="min-w-[40px] text-center tabular-nums">{zoom.percent}%</span>
            )}
            <Tool label="放大" onClick={() => latestSpec().zoom?.zoomIn()}>
              <Plus />
            </Tool>
            <Tool label="适应窗口" onClick={() => latestSpec().zoom?.fit()}>
              <Scan />
            </Tool>
          </div>
        )}
      </div>
    </div>
  );
}
