import {
  feedbackTranslator,
  useFeedbackI18n,
  feedbackText,
  feedbackIssueText,
  feedbackDisplayContext,
  type FeedbackMessageKey,
} from "./i18n";
import { formatFeedbackSize } from "./format";
import type { FeedbackIssue } from "./errors";
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
import { Button, Checkbox, FilterPill, Menu, Switch, Textarea, cn } from "@tau/ui";
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

const KINDS: { kind: AppFeedbackKind; label: FeedbackMessageKey; icon: typeof Bug }[] = [
  { kind: "bug", label: "kind.bug", icon: Bug },
  { kind: "idea", label: "kind.idea", icon: Lightbulb },
  { kind: "other", label: "kind.other", icon: MessageCircle },
];
const PLATFORM_LABELS: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};
const TILE = "rounded-tau-sm h-[62px] w-[92px] shrink-0";

function CaptureButton({
  disabled,
  onCapture,
}: {
  disabled: boolean;
  onCapture: (source?: FeedbackCaptureSource) => void;
}) {
  useFeedbackI18n();
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
        {feedbackTranslator.t("capture.action")}
      </button>
      <Menu
        open={open}
        onOpenChange={setOpen}
        className="w-[260px]"
        trigger={
          <button
            type="button"
            aria-label={feedbackTranslator.t("capture.choose")}
            className="border-line-1 hover:bg-hover text-ink-3 grid w-5 place-items-center border-l border-dashed transition-colors"
          >
            <ChevronDown size={12} />
          </button>
        }
      >
        <Menu.Group>{feedbackTranslator.t("capture.title")}</Menu.Group>
        {sources.data?.length ? (
          sources.data.map(source => (
            <Menu.Item key={source.id} icon={<AppWindow />} onSelect={() => onCapture(source)}>
              {source.label}
            </Menu.Item>
          ))
        ) : (
          <Menu.Item disabled>
            {sources.isPending
              ? feedbackTranslator.t("capture.loading")
              : feedbackTranslator.t("capture.empty")}
          </Menu.Item>
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
  onError: (issue: FeedbackIssue) => void;
}) {
  useFeedbackI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const full = draft.screenshots.length >= APP_FEEDBACK_LIMITS.images;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-tau-sm text-ink-3 flex items-center gap-1.5">
        {feedbackText("images.count", {
          count: draft.screenshots.length,
          max: APP_FEEDBACK_LIMITS.images,
        })}
        <span className="ml-auto">
          {feedbackTranslator.t("images.pasteHint", { shortcut: isMac ? "⌘V" : "Ctrl+V" })}
        </span>
      </p>
      <div className="flex flex-wrap gap-2.5">
        {draft.screenshots.map(shot => (
          <div key={shot.id} className={cn(TILE, "group relative")}>
            <div className="border-line-1 bg-page grid size-full place-items-center overflow-hidden rounded-[8px] border">
              {shot.previewUrl ? (
                <img
                  src={shot.previewUrl}
                  alt={feedbackTranslator.t("image.alt", {
                    origin: shot.originMessage
                      ? feedbackTranslator.t(shot.originMessage)
                      : shot.origin,
                  })}
                  className="size-full object-cover object-top"
                />
              ) : (
                <span className="text-tau-micro text-ink-3 px-1 text-center">
                  {shot.error
                    ? feedbackIssueText(shot.error)
                    : feedbackTranslator.t("image.processing")}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={feedbackTranslator.t("image.remove")}
              onClick={() => draft.removeImage(shot.id)}
              className="bg-ink-1 text-ink-inverse shadow-card absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full"
            >
              <X size={11} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => onAnnotate(shot.id)}
              className="bg-surface text-ink-2 hover:text-ink-1 shadow-card text-tau-micro absolute bottom-1 left-1 flex h-5 items-center gap-1 rounded-[6px] px-1.5"
            >
              <PenLine size={11} />
              {feedbackTranslator.t("image.annotate")}
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
          {feedbackTranslator.t("image.choose")}
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
                onError(
                  full
                    ? {
                        kind: "message",
                        key: "error.maxImages",
                        values: { count: APP_FEEDBACK_LIMITS.images },
                      }
                    : { kind: "message", key: "error.readImage", values: { name: file.name } }
                );
          }}
        />
      </div>
    </div>
  );
}

function Environment({ draft }: { draft: FeedbackDraft }) {
  useFeedbackI18n();
  const environment = useQuery({
    queryKey: ["feedback", "environment"],
    queryFn: getFeedbackEnvironment,
    refetchOnWindowFocus: "always",
  });
  const env = environment.data;
  const rows = env
    ? [
        ["version", feedbackTranslator.t("environment.version"), `${env.appVersion} (${env.arch})`],
        [
          "os",
          feedbackTranslator.t("environment.os"),
          `${PLATFORM_LABELS[env.platform] ?? env.platform} ${env.osVersion}`,
        ],
        ["page", feedbackTranslator.t("environment.page"), env.page ?? "—"],
        ["language", feedbackTranslator.t("environment.locale"), env.locale],
      ]
    : [];
  return (
    <details className="border-line-1 rounded-tau-sm group border px-3 py-2">
      <summary className="text-tau-sm text-ink-2 flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <MonitorSmartphone size={14} strokeWidth={1.75} />
        {feedbackTranslator.t("environment.include")}
        <span className="text-ink-3 min-w-0 flex-1 truncate">
          {env && draft.fields.includeContext
            ? `${env.appVersion} · ${PLATFORM_LABELS[env.platform] ?? env.platform}${env.page ? ` · ${env.page}` : ""}`
            : feedbackTranslator.t("environment.excluded")}
        </span>
        <Switch
          size="sm"
          aria-label={feedbackTranslator.t("environment.include")}
          checked={draft.fields.includeContext}
          onCheckedChange={includeContext => draft.update({ includeContext })}
          onClick={event => event.stopPropagation()}
        />
      </summary>
      <dl className="border-line-1 text-tau-sm mt-2 grid grid-cols-[64px_1fr] gap-x-3 gap-y-0.5 border-t pt-2">
        {rows.map(([id, label, value]) => (
          <div key={id} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="text-ink-2 font-tau-mono text-tau-micro self-center break-all">
              {value}
            </dd>
          </div>
        ))}
        <dt className="text-ink-3">{feedbackTranslator.t("environment.appearance")}</dt>
        <dd className="text-ink-3 text-tau-micro self-center">
          {feedbackTranslator.t("environment.theme")}
        </dd>
      </dl>
    </details>
  );
}

function Logs({ draft }: { draft: FeedbackDraft }) {
  useFeedbackI18n();
  const info = useQuery({
    queryKey: ["feedback", "log-info"],
    queryFn: getFeedbackLogInfo,
    refetchOnWindowFocus: "always",
  });
  const { logs } = draft.fields;
  return (
    <div className="border-line-1 rounded-tau-sm flex flex-col gap-1.5 border px-3 py-2">
      <p className="text-tau-sm text-ink-2 flex items-center gap-2">
        <ScrollText size={14} strokeWidth={1.75} />
        {feedbackTranslator.t("logs.include")}
        <button
          type="button"
          onClick={() => void revealFeedbackLogs()}
          className="text-ink-3 hover:text-ink-1 text-tau-micro ml-auto flex items-center gap-1 transition-colors"
        >
          <FolderOpen size={12} />
          {feedbackTranslator.t("logs.reveal")}
        </button>
      </p>
      <Checkbox
        label={
          <span className="text-tau-sm text-ink-1">
            {feedbackTranslator.t("logs.app")}
            <span className="text-ink-3">
              {" "}
              {feedbackTranslator.t("logs.appHint")}
              {info.data
                ? feedbackTranslator.t("logs.size", {
                    size: formatFeedbackSize(
                      info.data.appLogBytes,
                      feedbackDisplayContext().locale
                    ),
                  })
                : ""}
            </span>
          </span>
        }
        checked={logs.app}
        onChange={event => draft.update({ logs: { ...logs, app: event.target.checked } })}
      />
      <Checkbox
        label={
          <span className="text-tau-sm text-ink-1">
            {feedbackTranslator.t("logs.perf")}
            <span className="text-ink-3"> {feedbackTranslator.t("logs.perfHint")}</span>
          </span>
        }
        checked={logs.perf}
        onChange={event => draft.update({ logs: { ...logs, perf: event.target.checked } })}
      />
      {(logs.app || logs.perf) && (
        <p className="text-tau-micro text-ink-3">{feedbackTranslator.t("logs.privacy")}</p>
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
  onError: (issue: FeedbackIssue) => void;
  onSubmit: () => void;
}) {
  useFeedbackI18n();
  const { fields } = draft;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-1 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map(item => (
            <FilterPill
              key={item.kind}
              active={fields.kind === item.kind}
              label={feedbackTranslator.t(item.label)}
              icon={<item.icon size={13} strokeWidth={1.75} />}
              onClick={() => draft.update({ kind: item.kind })}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <Textarea
            aria-label={feedbackTranslator.t("message.label")}
            autoFocus
            rows={5}
            maxLength={APP_FEEDBACK_LIMITS.message}
            placeholder={
              fields.kind === "idea"
                ? feedbackTranslator.t("message.ideaPlaceholder")
                : feedbackTranslator.t("message.problemPlaceholder")
            }
            value={fields.message}
            onChange={event => draft.update({ message: event.target.value })}
          />
        </div>
        <Screenshots
          draft={draft}
          onCapture={onCapture}
          onAnnotate={onAnnotate}
          onError={onError}
        />
        <Environment draft={draft} />
        <Logs draft={draft} />
      </div>
      <footer className="flex flex-col gap-2 px-5 pt-3 pb-4">
        {error && (
          <p role="alert" className="text-tau-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-tau-micro text-ink-3 mr-auto flex items-center gap-1.5">
            <Lock size={12} />
            {feedbackTranslator.t("privacy.desktop")}
          </span>
          <Button
            variant="primary"
            icon={Send}
            loading={sending}
            disabled={!draft.ready}
            onClick={onSubmit}
          >
            {feedbackTranslator.t("action.send")}
          </Button>
        </div>
      </footer>
    </>
  );
}
