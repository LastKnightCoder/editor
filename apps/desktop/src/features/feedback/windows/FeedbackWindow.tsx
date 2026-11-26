/**
 * 反馈窗口（路由 /feedback，首次请求时创建的单例置顶小窗）：
 * 写反馈、截取任一 Tau 窗口、标注打码、选择附带的日志后提交。
 * 不阻塞其它窗口，用户可以一边复现问题一边截图；关窗时有内容先确认是否放弃。
 */

import { feedbackTranslator, useFeedbackI18n, feedbackText, feedbackIssueText } from "../i18n";
import { FeedbackHostError, type FeedbackIssue } from "../errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Pin, PinOff } from "lucide-react";
import { Button, IconButton, ToastHost, Tooltip, initScrollbarAutoHide } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import { AuxWindowTitlebar } from "@/app/AuxWindowTitlebar";
import { useThemeRuntime } from "@/app/useThemeRuntime";
import { platform } from "@/platform";
import {
  captureWindow,
  hideFeedbackWindow,
  listCaptureSources,
  onFeedbackCloseRequested,
  onPendingCaptures,
  setFeedbackAnnotating,
  submitFeedback,
  takePendingCaptures,
} from "@/commands/feedback";
import {
  APP_FEEDBACK_LIMITS,
  type FeedbackCapture,
  type FeedbackCaptureSource,
} from "@/types/app-feedback";
import { AnnotateView } from "../AnnotateView";
import { FeedbackForm } from "../FeedbackForm";
import { useFeedbackDraft } from "../useFeedbackDraft";

const rootClass =
  "app flex h-screen flex-col overflow-hidden bg-surface font-tau text-tau-body text-ink-1 antialiased";

type View = { name: "form" } | { name: "annotate"; id: string } | { name: "done" };

const pngBlob = (capture: FeedbackCapture) =>
  new Blob([new Uint8Array(capture.png)], { type: "image/png" });

export default function FeedbackWindow() {
  const { locale } = useFeedbackI18n();
  useThemeRuntime();
  useEffect(() => initScrollbarAutoHide(), []);
  useEffect(() => {
    document.title = feedbackTranslator.t("window.title");
  }, [locale]);

  const draft = useFeedbackDraft();
  const { addImage, reset } = draft;
  const [view, setView] = useState<View>({ name: "form" });
  const [pinned, setPinned] = useState(true);
  const [sending, setSending] = useState(false);
  const [issue, setError] = useState<FeedbackIssue | null>(null);
  const error = issue ? feedbackIssueText(issue) : null;
  const [confirmClose, setConfirmClose] = useState(false);
  const submission = useRef(0);
  const dirty = useRef(false);
  dirty.current = draft.dirty && view.name !== "done";

  const addCaptures = useCallback(
    async (captures: FeedbackCapture[]) => {
      for (const capture of captures)
        if (!(await addImage(pngBlob(capture), capture.source)))
          setError({
            kind: "message",
            key: "error.extraImages",
            values: { count: APP_FEEDBACK_LIMITS.images },
          });
    },
    [addImage]
  );

  // 「截取当前窗口并反馈」：主进程暂存截图，挂载时与收到通知时拉取
  useEffect(() => {
    const pull = () => void takePendingCaptures().then(addCaptures);
    pull();
    return onPendingCaptures(pull);
  }, [addCaptures]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file =>
        file.type.startsWith("image/")
      );
      if (!files.length) return;
      event.preventDefault();
      setView({ name: "form" });
      for (const file of files)
        void addImage(file, "剪贴板", "origin.clipboard").then(
          ok =>
            ok ||
            setError({
              kind: "message",
              key: "error.maxImages",
              values: { count: APP_FEEDBACK_LIMITS.images },
            })
        );
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImage]);

  const closeWindow = useCallback(() => {
    submission.current++;
    reset();
    setSending(false);
    setConfirmClose(false);
    setError(null);
    setView({ name: "form" });
    void hideFeedbackWindow();
  }, [reset]);

  useEffect(
    () =>
      onFeedbackCloseRequested(() => {
        if (dirty.current) setConfirmClose(true);
        else closeWindow();
      }),
    [closeWindow]
  );

  const capture = async (source?: FeedbackCaptureSource) => {
    setError(null);
    try {
      const target = source ?? (await listCaptureSources())[0];
      if (!target) throw new FeedbackHostError("FEEDBACK_NO_CAPTURE_SOURCE", "没有可截取的窗口");
      await addCaptures([await captureWindow(target.id)]);
    } catch (cause) {
      setError({ kind: "cause", cause, fallback: "error.captureFallback" });
    }
  };

  const annotate = (id: string) => {
    setView({ name: "annotate", id });
    void setFeedbackAnnotating(true);
  };
  const leaveAnnotate = () => {
    setView({ name: "form" });
    void setFeedbackAnnotating(false);
  };

  const submit = async () => {
    const current = ++submission.current;
    setSending(true);
    setError(null);
    try {
      const { theme, mode } = useThemeStore.getState();
      const result = await submitFeedback(draft.toInput(`${theme} · ${mode}`));
      if (current !== submission.current) return;
      if (result.ok) setView({ name: "done" });
      else setError({ kind: "response", response: result });
    } catch (cause) {
      if (current === submission.current)
        setError({ kind: "cause", cause, fallback: "error.send" });
    } finally {
      if (current === submission.current) setSending(false);
    }
  };

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    void platform.window.setAlwaysOnTop(next);
  };

  const annotating =
    view.name === "annotate" ? draft.screenshots.find(shot => shot.id === view.id) : undefined;

  return (
    <div className={rootClass}>
      <AuxWindowTitlebar
        leading={
          <span className="text-tau-body text-ink-1 font-semibold">
            {annotating
              ? feedbackTranslator.t("annotate.title")
              : feedbackTranslator.t("window.title")}
          </span>
        }
        actions={
          <Tooltip
            content={
              pinned ? feedbackTranslator.t("window.unpin") : feedbackTranslator.t("window.pin")
            }
          >
            <IconButton
              aria-label={
                pinned ? feedbackTranslator.t("window.unpin") : feedbackTranslator.t("window.pin")
              }
              onClick={togglePin}
            >
              {pinned ? <Pin size={15} className="text-accent-text" /> : <PinOff size={15} />}
            </IconButton>
          </Tooltip>
        }
      />
      {confirmClose && (
        <div
          role="alertdialog"
          className="border-line-1 shadow-card rounded-tau-md mx-5 mb-3 flex items-start gap-2.5 border px-3.5 py-3"
        >
          <CircleAlert size={16} className="text-warn mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-tau-body text-ink-1">{feedbackTranslator.t("discard.title")}</p>
            <p className="text-tau-sm text-ink-2">
              {feedbackTranslator.t("discard.description", {
                images: draft.screenshots.length
                  ? feedbackText("discard.images", { count: draft.screenshots.length })
                  : "",
              })}
            </p>
          </div>
          <Button size="sm" onClick={() => setConfirmClose(false)}>
            {feedbackTranslator.t("discard.continue")}
          </Button>
          <Button size="sm" variant="danger-soft" onClick={closeWindow}>
            {feedbackTranslator.t("discard.action")}
          </Button>
        </div>
      )}
      {view.name === "done" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-8 text-center">
          <span className="bg-ok-soft text-ok grid size-11 place-items-center rounded-full">
            <Check size={22} />
          </span>
          <h1 className="text-tau-title text-ink-1 font-semibold">
            {feedbackTranslator.t("done.title")}
          </h1>
          <p className="text-tau-sm text-ink-2">{feedbackTranslator.t("done.description")}</p>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                draft.reset();
                setView({ name: "form" });
              }}
            >
              {feedbackTranslator.t("done.another")}
            </Button>
            <Button variant="primary" onClick={closeWindow}>
              {feedbackTranslator.t("action.close")}
            </Button>
          </div>
        </div>
      ) : annotating ? (
        <AnnotateView
          shot={annotating}
          onCancel={leaveAnnotate}
          onDone={annotations => {
            draft.setAnnotations(annotating.id, annotations);
            leaveAnnotate();
          }}
        />
      ) : (
        <FeedbackForm
          draft={draft}
          sending={sending}
          error={error}
          onCapture={source => void capture(source)}
          onAnnotate={annotate}
          onError={setError}
          onSubmit={() => void submit()}
        />
      )}
      <ToastHost />
    </div>
  );
}
