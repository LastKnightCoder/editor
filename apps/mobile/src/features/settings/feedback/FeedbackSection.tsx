// 反馈页：类型 + 正文 + 截图（压缩后暂存 Rust）+ 环境/日志开关。
// 失败保留草稿原样重试（同一 clientRequestId 服务端幂等）；成功后清空草稿。

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
  MobileFeedbackError,
  type AppFeedbackKind,
  submitFeedback,
} from "../../../services/appFeedback";
import { osVersionFromUserAgent } from "./environment";
import type { FeedbackImage } from "./useFeedbackDraft";
import { useFeedbackDraft } from "./useFeedbackDraft";

const KINDS: { kind: AppFeedbackKind; label: string }[] = [
  { kind: "bug", label: "遇到问题" },
  { kind: "idea", label: "功能建议" },
  { kind: "other", label: "其他" },
];

function ScreenshotTile({
  image,
  onRemove,
}: {
  image: FeedbackImage;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="border-line-1 bg-page relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border">
      <img src={image.previewUrl} alt="已选截图" className="h-full w-full object-cover" />
      <button
        type="button"
        aria-label="移除截图"
        onClick={() => onRemove(image.id)}
        className="bg-ink-1 text-ink-inverse shadow-card absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full"
      >
        <X size={11} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}

export function FeedbackSection() {
  const draft = useFeedbackDraft();
  const appVersion = useAppVersion();
  const themeName = useThemeStore(state => getTheme(state.theme)?.name ?? "");
  const appearance = useThemeStore(state => state.appearance);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        toast.success("反馈已发送，谢谢你");
        draft.reset();
      } else {
        setError(result.message);
      }
    } catch (issue) {
      setError(issue instanceof MobileFeedbackError ? issue.message : "发送失败，请稍后再试");
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
            {item.label}
          </button>
        ))}
      </div>

      <textarea
        aria-label="反馈内容"
        maxLength={APP_FEEDBACK_LIMITS.message}
        placeholder={
          fields.kind === "idea"
            ? "想要什么功能？在什么场景下会用到？"
            : "发生了什么？如果方便，写一下怎么操作能复现。"
        }
        value={fields.message}
        onChange={event => draft.update({ message: event.target.value })}
        className="input-base bg-surface shadow-card min-h-[136px] w-full resize-none px-4 py-3 leading-relaxed"
      />

      <div className="px-[15px]">
        <p className="text-ink-2 text-[13px] font-medium">
          截图
          <span className="text-ink-3">
            {" "}
            · 选填 {draft.images.length} / {APP_FEEDBACK_LIMITS.images}
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
              <span className="text-[11px]">{draft.processing > 0 ? "处理中…" : "添加"}</span>
            </button>
          )}
        </div>
        {draft.imageError && <p className="text-warn mt-2 text-[12px]">{draft.imageError}</p>}
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
            <span className="text-ink-1 block text-[14.5px] font-medium">附带环境信息</span>
            <span className="text-ink-3 block truncate text-[11.5px]">
              {fields.includeContext && environmentSummary ? environmentSummary : "不附带"}
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
            <span className="text-ink-1 block text-[14.5px] font-medium">附带日志</span>
            <span className="text-ink-3 block truncate text-[11.5px]">
              本次与上次运行，压缩后上传
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
      {fields.includeLogs && (
        <GroupNote>日志可能包含文件名和笔记标题，只用于排查问题，压缩后上传。</GroupNote>
      )}

      <div className="flex pt-1">
        <ActionButton
          label={sending ? "正在发送" : "发送反馈"}
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
      <GroupNote>截图和日志只有开发者能看到。</GroupNote>
    </div>
  );
}
