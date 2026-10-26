/* eslint-disable react-refresh/only-export-components -- 服务页共用的行、空态与离开守卫 */
// 同步 / 上传服务页共用：使用状态行、服务不可用空态、未保存修改的离开确认。

import { useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { BottomSheet } from "../../../components/BottomSheet";
import { PageHeader } from "../../../components/PageHeader";
import { useNavigator, usePageGuard } from "../../../router";
import { GroupRow } from "../components/ui";

export function UseRow(props: {
  icon: ReactNode;
  title: string;
  active: boolean;
  activeText: string;
  idleText: string;
  actionLabel: string;
  busy?: boolean;
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <GroupRow>
      <span className="bg-tag-2-soft text-tag-2 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 text-tau-body block font-medium">{props.title}</span>
        <span className="text-ink-3 text-tau-sm block truncate">
          {props.active ? props.activeText : props.idleText}
        </span>
      </span>
      {props.active ? (
        <span className="bg-ok-soft text-ok text-tau-micro shrink-0 rounded-full px-2 py-0.5 font-semibold">
          使用中
        </span>
      ) : (
        <button
          type="button"
          disabled={props.disabled || props.busy}
          onClick={props.onAction}
          className="bg-accent-soft text-accent-text text-tau-meta flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold disabled:opacity-50"
        >
          {props.busy && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
          {props.actionLabel}
        </button>
      )}
    </GroupRow>
  );
}

export function UnsupportedProvider(props: { title: string; legacy: boolean }) {
  const navigator = useNavigator();
  return (
    <div className="bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title={props.title} onBack={() => navigator.goBack("ui")} />
      <p className="text-ink-3 text-tau-meta p-8 text-center leading-relaxed">
        {props.legacy
          ? "此插件版本较旧，请更新到最新版本后在这里修改配置；已保存的配置仍然有效。"
          : "此服务尚未启用，已保存的配置会保留。"}
      </p>
      <button
        type="button"
        className="text-accent-text text-tau-body p-4"
        onClick={() => navigator.push("plugins", { tab: props.legacy ? "installed" : "store" })}
      >
        {props.legacy ? "去更新插件" : "去插件中心"}
      </button>
    </div>
  );
}

/** 有未保存修改时，返回（顶栏或系统手势）先确认放弃 */
export function useDiscardGuard(dirty: boolean, reset: () => void) {
  const navigator = useNavigator();
  const [open, setOpen] = useState(false);
  usePageGuard(() => {
    if (!dirty) return true;
    setOpen(true);
    return false;
  });
  const discard = () => {
    setOpen(false);
    reset();
    void navigator.goBackBypassed("ui");
  };
  return {
    request: () => void navigator.goBack("ui"),
    sheet: (
      <BottomSheet open={open} title="放弃未保存的修改？" onClose={() => setOpen(false)}>
        <p className="text-ink-2 text-tau-meta pb-3 text-center">
          修改的配置还没有保存，离开后不会生效。
        </p>
        <div className="flex gap-2.5 pb-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="bg-page text-ink-1 text-tau-body h-12 flex-1 rounded-[14px] font-semibold"
          >
            继续编辑
          </button>
          <button
            type="button"
            onClick={discard}
            className="bg-danger-soft text-danger text-tau-body h-12 flex-1 rounded-[14px] font-semibold"
          >
            放弃修改
          </button>
        </div>
      </BottomSheet>
    ),
  };
}
