// 反馈页：类型 + 正文 + 截图（压缩后暂存 Rust）+ 环境/日志开关。
// 失败保留草稿原样重试（同一 clientRequestId 服务端幂等）；成功后清空草稿。

import {
  feedbackTranslator,
  useFeedbackI18n,
  feedbackText,
  feedbackIssueText,
  type FeedbackMessageKey,
} from "./i18n";
import type { FeedbackIssue } from "./errors";
import { useRef, useState } from "react";
import { ImagePlus, MonitorSmartphone, ScrollText, X } from "lucide-react";
import { getTheme } from "@tau/themes";
import { useThemeStore } from "@tau/themes/react";
import { GroupCard, GroupNote, GroupRow, SwitchButton } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { useAppVersion } from "../about/useAppVersion";
import { APPEARANCE_LABELS } from "../components/OverviewSection";
import { toast } from "../../../components/toast";
import {
  APP_FEEDBACK_LIMITS,
  type AppFeedbackKind,
  submitFeedback,
} from "../../../services/appFeedback";
import { osVersionFromUserAgent } from "./environment";
import type { FeedbackImage } from "./useFeedbackDraft";
import { useFeedbackDraft } from "./useFeedbackDraft";

const KINDS: { kind: AppFeedbackKind; label: FeedbackMessageKey }[] = [
  { kind: "bug", label: "kind.bug" },
  { kind: "idea", label: "kind.idea" },
  { kind: "other", label: "kind.other" },
];

function ScreenshotTile({
  image,
  onRemove,
}: {
  image: FeedbackImage;
  onRemove: (id: string) => void;
}) {
  useFeedbackI18n();
  return (
    <div className="border-line-1 bg-page relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border">
      <img
        src={image.previewUrl}
        alt={feedbackTranslator.t("image.selected")}
        className="h-full w-full object-cover"
      />
      <button
        type="button"
        aria-label={feedbackTranslator.t("image.remove")}
        onClick={() => onRemove(image.id)}
        className="bg-ink-1 text-ink-inverse shadow-card absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full"
      >
        <X size={11} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}

export function FeedbackSection() {
  useFeedbackI18n();
  const draft = useFeedbackDraft();
  const appVersion = useAppVersion();
  const themeName = useThemeStore(state => getTheme(state.theme)?.name ?? "");
  const appearance = useThemeStore(state => state.appearance);
  const [sending, setSending] = useState(false);
  const [issue, setError] = useState<FeedbackIssue | null>(null);
  const error = issue ? feedbackIssueText(issue) : null;
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!draft.ready || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await submitFeedback(
        draft.toInput({
          osVersion: osVersionFromUserAgent(navigator.userAgent),
          theme: APPEARANCE_LABELS[appearance]
            ? `${themeName} · ${APPEARANCE_LABELS[appearance]}`
            : themeName,
          locale: navigator.language,
        })
      );
      if (result.ok) {
        toast.success(feedbackTranslator.t("done.title"));
        draft.reset();
      } else {
        setError({ kind: "response", response: result });
      }
    } catch (issue) {
      setError({ kind: "cause", cause: issue, fallback: "error.send" });
    } finally {
      setSending(false);
    }
  };

  const { fields } = draft;
  const full = draft.images.length >= APP_FEEDBACK_LIMITS.images;
  const environmentSummary = [
    appVersion ? `v${appVersion}` : "",
    osVersionFromUserAgent(navigator.userAgent),
    themeName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="page-enter space-y-4 pb-8">
      <div className="bg-surface shadow-card flex gap-1 rounded-[14px] p-1">
        {KINDS.map(item => (
          <button
            key={item.kind}
            type="button"
            aria-pressed={fields.kind === item.kind}
            onClick={() => draft.update({ kind: item.kind })}
            className={`flex-1 rounded-[10px] py-2 text-[13.5px] font-medium transition-colors ${
              fields.kind === item.kind ? "bg-accent text-ink-inverse" : "text-ink-2"
            }`}
          >
            {feedbackTranslator.t(item.label)}
          </button>
        ))}
      </div>

      <textarea
        aria-label={feedbackTranslator.t("message.label")}
        maxLength={APP_FEEDBACK_LIMITS.message}
        placeholder={
          fields.kind === "idea"
            ? feedbackTranslator.t("message.ideaPlaceholder")
            : feedbackTranslator.t("message.problemPlaceholder")
        }
        value={fields.message}
        onChange={event => draft.update({ message: event.target.value })}
        className="input-base bg-surface shadow-card min-h-[136px] w-full resize-none px-4 py-3 leading-relaxed"
      />

      <div className="px-[15px]">
        <p className="text-ink-2 text-[13px] font-medium">
          {feedbackTranslator.t("images.title")}
          <span className="text-ink-3">
            {" "}
            {feedbackText("images.optionalCount", {
              count: draft.images.length,
              max: APP_FEEDBACK_LIMITS.images,
            })}
          </span>
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          {draft.images.map(image => (
            <ScreenshotTile key={image.id} image={image} onRemove={draft.removeImage} />
          ))}
          {!full && (
            <button
              type="button"
              disabled={draft.processing > 0}
              onClick={() => fileInput.current?.click()}
              className="border-line-1 text-ink-3 flex h-[72px] w-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed transition-opacity disabled:opacity-40"
            >
              <ImagePlus size={16} strokeWidth={1.9} aria-hidden="true" />
              <span className="text-[11px]">
                {draft.processing > 0
                  ? feedbackTranslator.t("image.processing")
                  : feedbackTranslator.t("image.add")}
              </span>
            </button>
          )}
        </div>
        {draft.imageError && (
          <p className="text-warn mt-2 text-[12px]">{feedbackIssueText(draft.imageError)}</p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={async event => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            for (const file of files) await draft.addImage(file);
          }}
        />
      </div>

      <GroupCard>
        <GroupRow onClick={() => draft.update({ includeContext: !fields.includeContext })}>
          <span className="bg-tag-1-soft text-tag-1 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
            <MonitorSmartphone size={17} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[14.5px] font-medium">
              {feedbackTranslator.t("environment.include")}
            </span>
            <span className="text-ink-3 block truncate text-[11.5px]">
              {fields.includeContext && environmentSummary
                ? environmentSummary
                : feedbackTranslator.t("environment.excluded")}
            </span>
          </span>
          <span onClick={event => event.stopPropagation()}>
            <SwitchButton
              checked={fields.includeContext}
              onChange={() => draft.update({ includeContext: !fields.includeContext })}
            />
          </span>
        </GroupRow>
        <GroupRow onClick={() => draft.update({ includeLogs: !fields.includeLogs })}>
          <span className="bg-tag-3-soft text-tag-3 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
            <ScrollText size={17} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[14.5px] font-medium">
              {feedbackTranslator.t("logs.include")}
            </span>
            <span className="text-ink-3 block truncate text-[11.5px]">
              {feedbackTranslator.t("logs.mobileHint")}
            </span>
          </span>
          <span onClick={event => event.stopPropagation()}>
            <SwitchButton
              checked={fields.includeLogs}
              onChange={() => draft.update({ includeLogs: !fields.includeLogs })}
            />
          </span>
        </GroupRow>
      </GroupCard>
      {fields.includeLogs && <GroupNote>{feedbackTranslator.t("logs.privacy")}</GroupNote>}

      <div className="flex pt-1">
        <ActionButton
          label={
            sending ? feedbackTranslator.t("action.sending") : feedbackTranslator.t("window.title")
          }
          emphasis
          busy={sending}
          disabled={!draft.ready}
          onClick={() => void submit()}
        />
      </div>
      {error && (
        <p role="alert" className="text-danger px-[15px] text-[12.5px]">
          {error}
        </p>
      )}
      <GroupNote>{feedbackTranslator.t("privacy.mobile")}</GroupNote>
    </div>
  );
}
