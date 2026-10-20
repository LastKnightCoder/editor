import { invoke, off, on } from "@/electron";
import type {
  AppFeedbackEnvironment,
  AppFeedbackLogInfo,
  AppFeedbackOpenOptions,
  AppFeedbackResult,
  AppFeedbackSubmitInput,
  FeedbackCapture,
  FeedbackCaptureSource,
} from "@/types/app-feedback";

/** 打开（或聚焦）独立反馈窗口；capture 时先截取发起窗口作为第一张截图 */
export function openFeedbackWindow(options: AppFeedbackOpenOptions = {}) {
  return invoke<void>("app-feedback:open", options);
}

export function hideFeedbackWindow() {
  return invoke<void>("app-feedback:hide");
}

export function onFeedbackCloseRequested(listener: () => void) {
  on("app-feedback:close-requested", listener);
  return () => off("app-feedback:close-requested", listener);
}

/** 取走主进程暂存的截图（「截取当前窗口并反馈」产生） */
export function takePendingCaptures() {
  return invoke<FeedbackCapture[]>("app-feedback:take-pending");
}

export function onPendingCaptures(listener: () => void) {
  on("app-feedback:pending", listener);
  return () => off("app-feedback:pending", listener);
}

export function listCaptureSources() {
  return invoke<FeedbackCaptureSource[]>("app-feedback:list-windows");
}

export function captureWindow(windowId: number) {
  return invoke<FeedbackCapture>("app-feedback:capture", windowId);
}

export function getFeedbackEnvironment() {
  return invoke<AppFeedbackEnvironment>("app-feedback:environment");
}

export function getFeedbackLogInfo() {
  return invoke<AppFeedbackLogInfo>("app-feedback:log-info");
}

export function revealFeedbackLogs() {
  return invoke<void>("app-feedback:reveal-logs");
}

/** 进入/退出标注时由主进程加宽/还原反馈窗口 */
export function setFeedbackAnnotating(annotating: boolean) {
  return invoke<void>("app-feedback:set-annotating", annotating);
}

export function submitFeedback(input: AppFeedbackSubmitInput) {
  return invoke<AppFeedbackResult>("app-feedback:submit", input);
}
