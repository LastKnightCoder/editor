/**
 * 反馈窗口（路由 /feedback，主进程 showFeedbackWindow 创建的单例置顶小窗）：
 * 写反馈、截取任一 Tau 窗口、标注打码、选择附带的日志后提交。
 * 不阻塞其它窗口，用户可以一边复现问题一边截图；关窗时有内容先确认是否放弃。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Pin, PinOff } from "lucide-react";
import { Button, IconButton, ToastHost, Tooltip, initScrollbarAutoHide } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import { AuxWindowTitlebar } from "@/app/AuxWindowTitlebar";
import { useThemeRuntime } from "@/app/useThemeRuntime";
import { platform } from "@/platform";
import {
  captureWindow,
  listCaptureSources,
  onPendingCaptures,
  setFeedbackAnnotating,
  submitFeedback,
  takePendingCaptures,
} from "@/commands/feedback";
import type { FeedbackCapture, FeedbackCaptureSource } from "@/types/app-feedback";
import { AnnotateView } from "../AnnotateView";
import { FeedbackForm } from "../FeedbackForm";
import { useFeedbackDraft } from "../useFeedbackDraft";
import "@/app/base.css";

const rootClass =
  "app flex h-screen flex-col overflow-hidden bg-surface font-tau text-tau-body text-ink-1 antialiased";

type View = { name: "form" } | { name: "annotate"; id: string } | { name: "done" };

const pngBlob = (capture: FeedbackCapture) => new Blob([capture.png], { type: "image/png" });

export default function FeedbackWindow() {
  useThemeRuntime();
  useEffect(() => initScrollbarAutoHide(), []);
  useEffect(() => {
    document.title = "发送反馈";
  }, []);

  const draft = useFeedbackDraft();
  const { addImage } = draft;
  const [view, setView] = useState<View>({ name: "form" });
  const [pinned, setPinned] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const allowClose = useRef(false);
  const dirty = useRef(false);
  dirty.current = draft.dirty && view.name !== "done";

  const addCaptures = useCallback(
    async (captures: FeedbackCapture[]) => {
      for (const capture of captures)
        if (!(await addImage(pngBlob(capture), capture.source)))
          setError("最多附带 3 张截图，多出的截图没有加入");
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
        void addImage(file, "剪贴板").then(ok => ok || setError("最多附带 3 张截图"));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImage]);

  // 有未发送内容时拦下关窗（标题栏关闭 / ⌘W），改在窗口内确认
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current || allowClose.current) return;
      event.preventDefault();
      event.returnValue = false;
      setConfirmClose(true);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const closeWindow = () => {
    allowClose.current = true;
    void platform.window.close();
  };

  const capture = async (source?: FeedbackCaptureSource) => {
    setError(null);
    try {
      const target = source ?? (await listCaptureSources())[0];
      if (!target) throw new Error("没有可截取的窗口");
      await addCaptures([await captureWindow(target.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "截图失败");
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
    setSending(true);
    setError(null);
    try {
      const { theme, mode } = useThemeStore.getState();
      const result = await submitFeedback(draft.toInput(`${theme} · ${mode}`));
      if (result.ok) setView({ name: "done" });
      else setError(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发送失败，请重试");
    } finally {
      setSending(false);
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
            {annotating ? "标注截图" : "发送反馈"}
          </span>
        }
        actions={
          <Tooltip content={pinned ? "取消置顶" : "窗口置顶"}>
            <IconButton aria-label={pinned ? "取消置顶" : "窗口置顶"} onClick={togglePin}>
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
            <p className="text-tau-body text-ink-1">放弃这条反馈？</p>
            <p className="text-tau-sm text-ink-2">
              文字{draft.screenshots.length ? `和 ${draft.screenshots.length} 张截图` : ""}
              都会丢弃。
            </p>
          </div>
          <Button size="sm" onClick={() => setConfirmClose(false)}>
            继续编辑
          </Button>
          <Button size="sm" variant="danger-soft" onClick={closeWindow}>
            放弃
          </Button>
        </div>
      )}
      {view.name === "done" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-8 text-center">
          <span className="bg-ok-soft text-ok grid size-11 place-items-center rounded-full">
            <Check size={22} />
          </span>
          <h1 className="text-tau-title text-ink-1 font-semibold">反馈已发送，谢谢你</h1>
          <p className="text-tau-sm text-ink-2">
            我们会逐条看。如果留了联系方式，需要追问时会联系你。
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                draft.reset();
                setView({ name: "form" });
              }}
            >
              再写一条
            </Button>
            <Button variant="primary" onClick={closeWindow}>
              关闭
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
