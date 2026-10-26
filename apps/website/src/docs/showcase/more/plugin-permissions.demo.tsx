/**
 * 插件权限：插件第一次读写数据时弹出「请求访问你的数据」，选择后在插件详情 › 权限里
 * 看到每项权限的状态，可以撤销或重新授予。
 * 弹窗按 features/plugins/permissions 的 PluginPermissionPrompt 重建，列表按 PluginPermissionsTab 重建；
 * 权限文案取自 PERMISSION_LABELS，示例插件「问题管理」的权限与其清单一致（节选）。
 */
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type RowState = "always" | "once" | "blocked" | "none";

const PERMISSIONS = [
  { key: "cards:read", label: "读取卡片", detail: "卡片的正文、标签和时间" },
  {
    key: "cards:write",
    label: "新建和修改卡片",
    detail: "包括卡片正文、标签和置顶",
  },
  {
    key: "materials:read",
    label: "读取摘录与标注",
    detail: "划线、PDF 标注和剪藏的原文、想法与出处",
  },
  {
    key: "chats:read",
    label: "读取对话信息",
    detail: "AI 对话的标题、场景、消息数和时间，不含消息内容",
  },
];

/** 弹窗里请求的那一批 */
const ASKED = ["cards:read", "materials:read"];

const STATE_LABELS: Record<RowState, string> = {
  always: "始终允许",
  once: "本次允许",
  blocked: "已阻止",
  none: "使用时询问",
};

const BTN = "inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12.5px] transition-colors";

export default function PluginPermissionsDemo() {
  const [prompt, setPrompt] = useState(true);
  const [states, setStates] = useState<Record<string, RowState>>({});

  const settle = (decision: RowState | "deny") => {
    if (decision !== "deny")
      setStates(current => ({
        ...current,
        ...Object.fromEntries(ASKED.map(key => [key, decision])),
      }));
    setPrompt(false);
  };
  const set = (key: string, state: RowState) =>
    setStates(current => ({ ...current, [key]: state }));

  return (
    <AppWindow active="plugins" crumb="插件 / 问题管理" height={400}>
      <div className="scrollbar-hide h-full overflow-y-auto px-7 pt-5 pb-6 max-sm:px-4">
        <div className="flex items-center gap-3.5">
          <span className="bg-tag-5-soft text-tag-5 grid size-11 flex-none place-items-center rounded-[13px] text-[18px] font-semibold">
            问
          </span>
          <div className="min-w-0 flex-1">
            <b className="text-[17px] font-semibold">问题管理</b>
            <div className="text-tau-meta text-ink-2 flex gap-2">
              <span>@tau</span>
              <span className="tabular-nums">0.1.5</span>
              <span>已启用</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPrompt(true)}
            className={cn(BTN, "border-line-1 hover:bg-hover border")}
          >
            再次请求
          </button>
        </div>
        <div className="border-line-2 mt-4 flex gap-[22px] border-b px-1">
          {["介绍", "设置", "权限", "更新日志", "版本"].map(label => (
            <span
              key={label}
              className={cn(
                "text-tau-body after:bg-accent relative -mb-px pt-2 pb-[7px] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
                label === "权限"
                  ? "text-ink-1 font-semibold after:opacity-100"
                  : "text-ink-2 after:opacity-0"
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <p className="text-tau-meta text-ink-2 mt-4 mb-2">
          插件首次使用这些数据时会询问你。插件与应用运行在同一环境中，并且可以联网，请只允许你信任的插件。
        </p>
        {PERMISSIONS.map(permission => {
          const state = states[permission.key] ?? "none";
          return (
            <div
              key={permission.key}
              className="flex items-center gap-3 px-1 py-2.5 shadow-[0_1px_0_var(--tau-line-2)]"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-tau-body font-medium">{permission.label}</span>
                <span className="text-tau-meta text-ink-3 truncate">{permission.detail}</span>
              </div>
              <span className="text-tau-meta text-ink-2">{STATE_LABELS[state]}</span>
              {state === "none" ? (
                <button
                  type="button"
                  onClick={() => set(permission.key, "always")}
                  className={cn(BTN, "text-ink-2 hover:bg-hover")}
                >
                  始终允许
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => set(permission.key, "none")}
                  className={cn(BTN, "bg-danger-soft text-danger hover:opacity-90")}
                >
                  撤销
                </button>
              )}
            </div>
          );
        })}
      </div>

      {prompt && (
        <div className="bg-overlay animate-doc-in absolute inset-0 z-10 grid place-items-center p-4">
          <div className="bg-surface shadow-float w-[360px] max-w-full rounded-[16px] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-ink-2 size-4" strokeWidth={1.75} />
              <b className="text-[15px] font-semibold">请求访问你的数据</b>
              <span className="bg-hover text-ink-2 text-tau-micro ml-1 rounded-full px-2 py-px">
                问题管理
              </span>
            </div>
            <p className="text-tau-body text-ink-2 mt-3 mb-2">「问题管理」想要：</p>
            <ul className="mb-3 flex flex-col gap-2">
              {PERMISSIONS.filter(item => ASKED.includes(item.key)).map(item => (
                <li key={item.key} className="flex flex-col">
                  <span className="text-tau-body font-medium">{item.label}</span>
                  <span className="text-tau-meta text-ink-3">{item.detail}</span>
                </li>
              ))}
            </ul>
            <p className="text-tau-meta text-ink-3">
              插件可以联网，允许后读取到的内容可能被发送出去。「仅这次」在插件停用或应用重启前有效；之后可在插件详情页撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle("deny")}
                className={cn(BTN, "border-line-1 hover:bg-hover h-8 border px-3")}
              >
                拒绝
              </button>
              <button
                type="button"
                onClick={() => settle("once")}
                className={cn(BTN, "border-line-1 hover:bg-hover h-8 border px-3")}
              >
                仅这次
              </button>
              <button
                type="button"
                onClick={() => settle("always")}
                className={cn(
                  BTN,
                  "bg-accent text-ink-inverse hover:bg-accent-hover h-8 px-3 font-medium"
                )}
              >
                始终允许
              </button>
            </div>
          </div>
        </div>
      )}
    </AppWindow>
  );
}
