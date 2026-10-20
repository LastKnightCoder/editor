import { useState } from "react";
import {
  Archive,
  AtSign,
  Check,
  CircleDashed,
  CloudOff,
  Download,
  Fingerprint,
  MonitorSmartphone,
  NotebookPen,
  RotateCcw,
  ScrollText,
  VenetianMask,
} from "lucide-react";
import { Button, ImagePreview, Loading, Panel, Tag, Textarea } from "@tau/ui";
import type {
  AppFeedbackAttachment,
  AppFeedbackContext,
  AppFeedbackDetail,
  AppFeedbackStatus,
} from "../../../../contracts";
import { useApi } from "../../app/api";
import { errorMessage } from "../../api/errors";
import { formatTime } from "../../components/format";
import { ErrorState } from "../../components/states";
import {
  KIND_COLORS,
  KIND_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  formatBytes,
  platformLabel,
} from "./labels";
import { useAppFeedbackDetail, useAttachmentUrl, useUpdateAppFeedback } from "./queries";

const CONTEXT_LABELS: [keyof AppFeedbackContext, string][] = [
  ["appVersion", "版本"],
  ["platform", "系统"],
  ["osVersion", "系统版本"],
  ["arch", "架构"],
  ["page", "当前页面"],
  ["theme", "外观"],
  ["locale", "语言"],
];
const LOG_LABELS: Record<Exclude<AppFeedbackAttachment["kind"], "image">, string> = {
  log: "普通日志",
  perf: "性能日志",
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ScrollText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Panel pad="compact" className="flex flex-col gap-2">
      <h3 className="text-tau-sm text-ink-3 flex items-center gap-1.5 font-medium">
        <Icon size={13} />
        {title}
      </h3>
      {children}
    </Panel>
  );
}

function Screenshot({
  feedbackId,
  attachment,
  index,
  total,
  onOpen,
}: {
  feedbackId: string;
  attachment: AppFeedbackAttachment;
  index: number;
  total: number;
  onOpen: (url: string) => void;
}) {
  const { url, isError } = useAttachmentUrl(feedbackId, attachment.id);
  return (
    <figure className="flex flex-col gap-1">
      <button
        type="button"
        disabled={!url}
        onClick={() => url && onOpen(url)}
        className="border-line-1 bg-page rounded-tau-sm grid h-[170px] cursor-zoom-in place-items-center overflow-hidden border"
      >
        {url ? (
          <img src={url} alt={`截图 ${index + 1}`} className="size-full object-cover object-top" />
        ) : isError ? (
          <span className="text-tau-sm text-ink-3">截图读取失败</span>
        ) : (
          <Loading minHeight={0} />
        )}
      </button>
      <figcaption className="text-tau-micro text-ink-3 flex gap-2">
        <span>
          {index + 1} / {total}
        </span>
        <span className="font-tau-mono">
          {formatBytes(attachment.size)} · {attachment.mime.replace("image/", "")}
        </span>
      </figcaption>
    </figure>
  );
}

function Gallery({ feedback }: { feedback: AppFeedbackDetail }) {
  const images = feedback.attachments.filter(item => item.kind === "image");
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<number | null>(null);
  if (!images.length) return null;
  const loaded = images.map((_, index) => urls[index]).filter(Boolean);
  return (
    <div className="grid grid-cols-2 gap-3">
      {images.map((attachment, index) => (
        <Screenshot
          key={attachment.id}
          feedbackId={feedback.id}
          attachment={attachment}
          index={index}
          total={images.length}
          onOpen={url => {
            setUrls(current => ({ ...current, [index]: url }));
            setPreview(index);
          }}
        />
      ))}
      <ImagePreview
        images={images.map((_, index) => ({ src: urls[index] ?? "", alt: `截图 ${index + 1}` }))}
        index={preview ?? 0}
        onIndexChange={setPreview}
        open={preview !== null && loaded.length > 0}
        onOpenChange={open => !open && setPreview(null)}
      />
    </div>
  );
}

function Logs({ feedback }: { feedback: AppFeedbackDetail }) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const logs = feedback.attachments.filter(item => item.kind !== "image");
  if (!logs.length) return null;
  const download = async (attachment: AppFeedbackAttachment) => {
    setError(null);
    try {
      const blob = await api.getAppFeedbackAttachment(feedback.id, attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `feedback-${feedback.id.slice(0, 8)}-${attachment.kind}.${attachment.kind === "perf" ? "json" : "log"}.gz`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Section icon={ScrollText} title="日志">
      {logs.map(attachment => (
        <div key={attachment.id} className="text-tau-meta flex items-center gap-2">
          <span className="text-ink-1">
            {LOG_LABELS[attachment.kind as keyof typeof LOG_LABELS]}
          </span>
          <span className="text-ink-3 font-tau-mono text-tau-micro">
            {formatBytes(attachment.size)} · gzip
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={Download}
            className="ml-auto"
            onClick={() => void download(attachment)}
          >
            下载
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-tau-sm text-danger">
          {error}
        </p>
      )}
    </Section>
  );
}

function Note({ feedback }: { feedback: AppFeedbackDetail }) {
  const update = useUpdateAppFeedback(feedback.id);
  const [note, setNote] = useState(feedback.note);
  const dirty = note !== feedback.note;
  return (
    <Section icon={NotebookPen} title="内部备注（只有管理员可见）">
      <Textarea
        aria-label="内部备注"
        placeholder="复现结论、关联 issue…"
        maxLength={4000}
        value={note}
        onChange={event => setNote(event.target.value)}
      />
      <div className="flex items-center gap-2">
        {update.isError && (
          <span role="alert" className="text-tau-sm text-danger">
            {errorMessage(update.error)}
          </span>
        )}
        <Button
          size="sm"
          className="ml-auto"
          disabled={!dirty}
          loading={update.isPending}
          onClick={() => update.mutate({ note, revision: feedback.revision })}
        >
          保存备注
        </Button>
      </div>
    </Section>
  );
}

const NEXT_STEPS: Record<
  AppFeedbackStatus,
  { status: AppFeedbackStatus; label: string; icon: typeof Check }[]
> = {
  new: [
    { status: "doing", label: "标为处理中", icon: CircleDashed },
    { status: "done", label: "已解决", icon: Check },
    { status: "ignored", label: "忽略", icon: Archive },
  ],
  doing: [
    { status: "done", label: "已解决", icon: Check },
    { status: "ignored", label: "忽略", icon: Archive },
  ],
  done: [{ status: "doing", label: "重新打开", icon: RotateCcw }],
  ignored: [{ status: "new", label: "恢复为新反馈", icon: RotateCcw }],
};

function Content({
  feedback,
  onFilterVisitor,
}: {
  feedback: AppFeedbackDetail;
  onFilterVisitor: (visitorId: string) => void;
}) {
  const update = useUpdateAppFeedback(feedback.id);
  const context = feedback.context;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Tag color={KIND_COLORS[feedback.kind]} showDot={false}>
            {KIND_LABELS[feedback.kind]}
          </Tag>
          <Tag color={STATUS_COLORS[feedback.status]}>{STATUS_LABELS[feedback.status]}</Tag>
          <span className="text-tau-sm text-ink-3">{formatTime(feedback.createdAt)}</span>
          <span className="text-tau-micro text-ink-3 font-tau-mono">{feedback.id.slice(0, 8)}</span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {NEXT_STEPS[feedback.status].map(step => (
            <Button
              key={step.status}
              size="sm"
              icon={step.icon}
              variant={step.status === "ignored" ? "ghost" : "secondary"}
              disabled={update.isPending}
              onClick={() => update.mutate({ status: step.status, revision: feedback.revision })}
            >
              {step.label}
            </Button>
          ))}
        </div>
      </header>
      {update.isError && (
        <p role="alert" className="text-tau-sm text-danger">
          {errorMessage(update.error)}
        </p>
      )}
      <p className="text-tau-body text-ink-1 whitespace-pre-wrap break-words leading-[1.8]">
        {feedback.message}
      </p>
      <Gallery feedback={feedback} />
      <div className="grid grid-cols-2 gap-3">
        <Section icon={MonitorSmartphone} title="环境">
          {context ? (
            <dl className="text-tau-meta grid grid-cols-[72px_1fr] gap-x-3 gap-y-1">
              {CONTEXT_LABELS.filter(([key]) => context[key]).map(([key, label]) => (
                <div key={key} className="contents">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="text-ink-1 font-tau-mono text-tau-micro break-all">
                    {key === "platform" ? platformLabel(context[key]) : context[key]}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-tau-sm text-ink-3">用户没有附带环境信息。</p>
          )}
        </Section>
        <div className="flex flex-col gap-3">
          <Section icon={AtSign} title="联系方式">
            <p className="text-tau-meta text-ink-1 break-all">{feedback.contact ?? "—"}</p>
          </Section>
          <Section icon={Fingerprint} title="匿名身份">
            <div className="flex items-center gap-2">
              <span className="text-tau-micro text-ink-2 font-tau-mono">
                {feedback.visitorId.slice(0, 12)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={VenetianMask}
                className="ml-auto"
                onClick={() => onFilterVisitor(feedback.visitorId)}
              >
                只看该身份
              </Button>
            </div>
          </Section>
        </div>
      </div>
      <Logs feedback={feedback} />
      {/* 以 revision 作 key：别处改过备注后重新载入草稿 */}
      <Note key={feedback.revision} feedback={feedback} />
    </div>
  );
}

export function FeedbackDetail({
  id,
  onFilterVisitor,
}: {
  id: string | null;
  onFilterVisitor: (visitorId: string) => void;
}) {
  const detail = useAppFeedbackDetail(id);
  if (!id) return <p className="text-tau-sm text-ink-3 py-16 text-center">在左侧选择一条反馈。</p>;
  if (detail.isPending) return <Loading minHeight={240} />;
  if (detail.isError)
    return (
      <ErrorState
        icon={CloudOff}
        title="反馈读取失败"
        error={detail.error}
        onRetry={() => void detail.refetch()}
      />
    );
  return <Content feedback={detail.data} onFilterVisitor={onFilterVisitor} />;
}
