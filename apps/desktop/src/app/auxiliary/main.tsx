import type { ComponentType } from "react";
import { on, send } from "@/electron";
import { notifyAppQuittingReady } from "@/commands/extra";
import { setupConsoleLogger } from "@/utils/console-logger";

const pages: Record<string, () => Promise<{ default: ComponentType }>> = {
  "/feedback": () => import("@/features/feedback/windows/FeedbackWindow"),
  "/pomodoro/mini": () => import("@/features/pomodoro/windows/MiniWindow"),
  "/pomodoro/immersive": () => import("@/features/pomodoro/windows/ImmersiveWindow"),
};

setupConsoleLogger();
on("app:quitting", () => void notifyAppQuittingReady());
const container = document.getElementById("root");
if (!container) throw new Error("辅助窗口缺少根节点");

function reportFailure(error: unknown) {
  console.error("辅助窗口加载失败", error);
  const retry = document.createElement("button");
  retry.textContent = "窗口加载失败，点击重试";
  retry.onclick = () => location.reload();
  document.getElementById("root")?.replaceChildren(retry);
  send("auxiliary:ready");
}

void Promise.all([import("./render"), pages[location.hash.slice(1)]?.()])
  .then(([{ renderAuxiliary }, page]) => {
    if (!page) throw new Error("未知辅助窗口");
    renderAuxiliary(container, page.default, reportFailure);
  })
  .catch(reportFailure);
