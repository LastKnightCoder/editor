import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AppWindow,
  Bug,
  Camera,
  ChevronDown,
  FolderOpen,
  ImagePlus,
  Lightbulb,
  Lock,
  MessageCircle,
  MonitorSmartphone,
  PenLine,
  ScrollText,
  Send,
  X,
} from "lucide-react";
import { Button, Checkbox, FilterPill, Input, Menu, Switch, Textarea, cn } from "@tau/ui";
import { isMac } from "@/platform";
import {
  getFeedbackEnvironment,
  getFeedbackLogInfo,
  listCaptureSources,
  revealFeedbackLogs,
} from "@/commands/feedback";
import {
  APP_FEEDBACK_LIMITS,
  type AppFeedbackKind,
  type FeedbackCaptureSource,
} from "@/types/app-feedback";
import type { FeedbackDraft } from "./useFeedbackDraft";

const KINDS: { kind: AppFeedbackKind; label: string; icon: typeof Bug }[] = [
  { kind: "bug", label: "遇到问题", icon: Bug },
  { kind: "idea", label: "功能建议", icon: Lightbulb },
  { kind: "other", label: "其他", icon: MessageCircle },
];
const PLATFORM_LABELS: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};
const TILE = "rounded-tau-sm h-[62px] w-[92px] shrink-0";

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function CaptureButton({
  disabled,
  onCapture,
}: {
  disabled: boolean;
  onCapture: (source?: FeedbackCaptureSource) => void;
}) {
  const [open, setOpen] = useState(false);
  const sources = useQuery({
    queryKey: ["feedback", "capture-sources"],
    queryFn: listCaptureSources,
    enabled: open,
    staleTime: 0,
  });
  return (
    <div
      className={cn(
        TILE,
        "border-line-1 text-ink-2 flex overflow-hidden border border-dashed",
        disabled && "pointer-events-none opacity-40"
      )}
    >
      <button
        type="button"
        onClick={() => onCapture()}
        className="hover:bg-hover text-tau-micro flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
      >
        <Camera size={16} strokeWidth={1.75} className="text-ink-3" />
        截取窗口
      </button>
      <Menu
        open={open}
        onOpenChange={setOpen}
        className="w-[260px]"
        trigger={
          <button
            type="button"
            aria-label="选择要截取的窗口"
            className="border-line-1 hover:bg-hover text-ink-3 grid w-5 place-items-center border-l border-dashed transition-colors"
          >
            <ChevronDown size={12} />
          </button>
        }
      >
        <Menu.Group>截取哪个窗口</Menu.Group>
        {sources.data?.length ? (
          sources.data.map(source => (
            <Menu.Item key={source.id} icon={<AppWindow />} onSelect={() => onCapture(source)}>
              {source.label}
            </Menu.Item>
          ))
        ) : (
          <Menu.Item disabled>{sources.isPending ? "读取中…" : "没有可截取的窗口"}</Menu.Item>
        )}
      </Menu>
    </div>
  );
}

function Screenshots({
  draft,
  onCapture,
  onAnnotate,
  onError,
}: {
  draft: FeedbackDraft;
  onCapture: (source?: FeedbackCaptureSource) => void;
  onAnnotate: (id: string) => void;
  onError: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const full = draft.screenshots.length >= APP_FEEDBACK_LIMITS.images;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-tau-sm text-ink-3 flex items-center gap-1.5">
        截图 · {draft.screenshots.length} / {APP_FEEDBACK_LIMITS.images}
        <span className="ml-auto">
          系统截图后可直接粘贴 <kbd className="font-tau-mono">{isMac ? "⌘V" : "Ctrl+V"}</kbd>
        </span>
      </p>
      <div className="flex flex-wrap gap-2.5">
        {draft.screenshots.map(shot => (
          <div key={shot.id} className={cn(TILE, "group relative")}>
            <div className="border-line-1 bg-page grid size-full place-items-center overflow-hidden rounded-[8px] border">
              {shot.previewUrl ? (
                <img
                  src={shot.previewUrl}
                  alt={`截图：${shot.origin}`}
                  className="size-full object-cover object-top"
                />
              ) : (
                <span className="text-tau-micro text-ink-3 px-1 text-center">
                  {shot.error ?? "处理中…"}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label="移除截图"
              onClick={() => draft.removeImage(shot.id)}
              className="bg-ink-1 text-ink-inverse shadow-card absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full"
            >
              <X size={11} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => onAnnotate(shot.id)}
              className="bg-surface text-ink-2 hover:text-ink-1 shadow-card text-tau-micro absolute bottom-1 left-1 flex h-5 items-center gap-1 rounded-[6px] px-1.5"
            >
              <PenLine size={11} />
              标注
            </button>
          </div>
        ))}
        <CaptureButton disabled={full} onCapture={onCapture} />
        <button
          type="button"
          disabled={full}
          onClick={() => fileInput.current?.click()}
          className={cn(
            TILE,
            "border-line-1 text-ink-2 hover:bg-hover text-tau-micro flex flex-col items-center justify-center gap-1 border border-dashed transition-colors disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          <ImagePlus size={16} strokeWidth={1.75} className="text-ink-3" />
          选择图片
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={async event => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            for (const file of files)
              if (!(await draft.addImage(file, file.name)))
                onError(full ? "最多附带 3 张截图" : `无法读取图片：${file.name}`);
          }}
        />
      </div>
    </div>
  );
}

function Environment({ draft }: { draft: FeedbackDraft }) {
  const environment = useQuery({
    queryKey: ["feedback", "environment"],
    queryFn: getFeedbackEnvironment,
  });
  const env = environment.data;
  const rows = env
    ? [
        ["版本", `${env.appVersion} (${env.arch})`],
        ["系统", `${PLATFORM_LABELS[env.platform] ?? env.platform} ${env.osVersion}`],
        ["当前页面", env.page ?? "—"],
        ["语言", env.locale],
      ]
    : [];
  return (
    <details className="border-line-1 rounded-tau-sm group border px-3 py-2">
      <summary className="text-tau-sm text-ink-2 flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <MonitorSmartphone size={14} strokeWidth={1.75} />
        附带环境信息
        <span className="text-ink-3 min-w-0 flex-1 truncate">
          {env && draft.fields.includeContext
            ? `${env.appVersion} · ${PLATFORM_LABELS[env.platform] ?? env.platform}${env.page ? ` · ${env.page}` : ""}`
            : "不附带"}
        </span>
        <Switch
          size="sm"
          aria-label="附带环境信息"
          checked={draft.fields.includeContext}
          onCheckedChange={includeContext => draft.update({ includeContext })}
          onClick={event => event.stopPropagation()}
        />
      </summary>
      <dl className="border-line-1 text-tau-sm mt-2 grid grid-cols-[64px_1fr] gap-x-3 gap-y-0.5 border-t pt-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="text-ink-2 font-tau-mono text-tau-micro self-center break-all">
              {value}
            </dd>
          </div>
        ))}
        <dt className="text-ink-3">外观</dt>
        <dd className="text-ink-3 text-tau-micro self-center">当前主题与明暗</dd>
      </dl>
    </details>
  );
}

function Logs({ draft }: { draft: FeedbackDraft }) {
  const info = useQuery({ queryKey: ["feedback", "log-info"], queryFn: getFeedbackLogInfo });
  const { logs } = draft.fields;
  return (
    <div className="border-line-1 rounded-tau-sm flex flex-col gap-1.5 border px-3 py-2">
      <p className="text-tau-sm text-ink-2 flex items-center gap-2">
        <ScrollText size={14} strokeWidth={1.75} />
        附带日志
        <button
          type="button"
          onClick={() => void revealFeedbackLogs()}
          className="text-ink-3 hover:text-ink-1 text-tau-micro ml-auto flex items-center gap-1 transition-colors"
        >
          <FolderOpen size={12} />
          在文件夹中查看
        </button>
      </p>
      <Checkbox
        label={
          <span className="text-tau-sm text-ink-1">
            普通日志
            <span className="text-ink-3">
              {" "}
              · 本次与上次运行
              {info.data ? `，约 ${formatSize(info.data.appLogBytes)}` : ""}
            </span>
          </span>
        }
        checked={logs.app}
        onChange={event => draft.update({ logs: { ...logs, app: event.target.checked } })}
      />
      <Checkbox
        label={
          <span className="text-tau-sm text-ink-1">
            性能日志<span className="text-ink-3"> · 近 1 小时的卡顿诊断数据</span>
          </span>
        }
        checked={logs.perf}
        onChange={event => draft.update({ logs: { ...logs, perf: event.target.checked } })}
      />
      {(logs.app || logs.perf) && (
        <p className="text-tau-micro text-ink-3">
          日志可能包含文件名和笔记标题，只用于排查问题，压缩后上传。
        </p>
      )}
    </div>
  );
}

export function FeedbackForm({
  draft,
  sending,
  error,
  onCapture,
  onAnnotate,
  onError,
  onSubmit,
}: {
  draft: FeedbackDraft;
  sending: boolean;
  error: string | null;
  onCapture: (source?: FeedbackCaptureSource) => void;
  onAnnotate: (id: string) => void;
  onError: (message: string) => void;
  onSubmit: () => void;
}) {
  const { fields } = draft;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-2 pt-1">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map(item => (
            <FilterPill
              key={item.kind}
              active={fields.kind === item.kind}
              label={item.label}
              icon={<item.icon size={13} strokeWidth={1.75} />}
              onClick={() => draft.update({ kind: item.kind })}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <Textarea
            aria-label="反馈内容"
            autoFocus
            rows={5}
            maxLength={APP_FEEDBACK_LIMITS.message}
            placeholder={
              fields.kind === "idea"
                ? "想要什么功能？在什么场景下会用到？"
                : "发生了什么？如果方便，写一下怎么操作能复现。"
            }
            value={fields.message}
            onChange={event => draft.update({ message: event.target.value })}
          />
          <span className="text-tau-micro text-ink-3 self-end">
            {fields.message.length} / {APP_FEEDBACK_LIMITS.message}
          </span>
        </div>
        <Screenshots
          draft={draft}
          onCapture={onCapture}
          onAnnotate={onAnnotate}
          onError={onError}
        />
        <Environment draft={draft} />
        <Logs draft={draft} />
        <Input
          aria-label="联系方式"
          maxLength={APP_FEEDBACK_LIMITS.contact}
          placeholder="联系方式（选填，需要追问时用）"
          value={fields.contact}
          onChange={event => draft.update({ contact: event.target.value })}
        />
      </div>
      <footer className="flex flex-col gap-2 px-5 pb-4 pt-3">
        {error && (
          <p role="alert" className="text-tau-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-tau-micro text-ink-3 mr-auto flex items-center gap-1.5">
            <Lock size={12} />
            截图和日志只有开发者能看到，180 天后自动删除
          </span>
          <Button
            variant="primary"
            icon={Send}
            loading={sending}
            disabled={!draft.ready}
            onClick={onSubmit}
          >
            发送
          </Button>
        </div>
      </footer>
    </>
  );
}
