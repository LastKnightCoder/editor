/* eslint-disable react-refresh/only-export-components -- 保存条与同域的草稿接线 hook 一起导出 */
/**
 * 插件设置的悬浮保存条与离开确认：读 SettingsDraftController，插件或宿主表单只报告草稿状态。
 * 保存条吸附在所在滚动区底部；页面导航、切换设置分组与关窗口都先经离开确认。
 */

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import type { SettingsDraftController, SettingsDraftSnapshot } from "@tau/plugins/settings-draft";
import { Button, Dialog, DialogBody, cn } from "@tau/ui";
import { closeWindow } from "@/commands";
import { usePage } from "@/page/PageProvider";

export function useSettingsDraftSnapshot(controller: SettingsDraftController) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

/** 页面离开守卫、⌘S 与关窗口拦截；页面隐藏时随 effect 一起撤下 */
export function useSettingsDraftGuards(controller: SettingsDraftController) {
  const { registerLeaveGuard } = usePage();
  useEffect(
    () => registerLeaveGuard(() => controller.confirmLeave()),
    [controller, registerLeaveGuard]
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s")
        return;
      const snapshot = controller.getSnapshot();
      if (!snapshot.attached || (!snapshot.dirty && snapshot.phase !== "failed")) return;
      event.preventDefault();
      void controller.save();
    };
    let closing = false;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (closing || !controller.getSnapshot().dirty) return;
      event.preventDefault();
      event.returnValue = "";
      void controller.confirmLeave().then(leave => {
        if (!leave) return;
        closing = true;
        void closeWindow().catch(() => (closing = false));
      });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [controller]);
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function Status({ snapshot }: { snapshot: SettingsDraftSnapshot }) {
  if (snapshot.phase === "saving")
    return (
      <>
        <LoaderCircle size={14} className="text-ink-2 flex-none animate-spin" />
        {snapshot.savingText || "正在保存…"}
      </>
    );
  if (snapshot.phase === "saved")
    return (
      <span className="text-ok flex min-w-0 items-center gap-1.5">
        <CircleCheck size={14} className="flex-none" />
        <span className="min-w-0 truncate">{snapshot.message || "已保存"}</span>
      </span>
    );
  if (snapshot.phase === "failed")
    return (
      <span className="text-danger flex min-w-0 items-center gap-1.5">
        <CircleAlert size={14} className="flex-none" />
        <span className="min-w-0">{snapshot.message}</span>
      </span>
    );
  if (snapshot.errors > 0)
    return (
      <span className="text-danger flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="bg-danger size-[7px] flex-none rounded-full" />
        {snapshot.errors} 项填写有误
        <span className="text-ink-3">· 修正后才能保存</span>
      </span>
    );
  const count = snapshot.changes.length;
  return (
    <>
      <span aria-hidden className="bg-accent size-[7px] flex-none rounded-full" />
      {count ? `${count} 项修改未保存` : "有未保存的修改"}
    </>
  );
}

/** 有错误仍点保存：抖一下保存条，滚到并聚焦分区里第一处错误 */
function useInvalidFeedback(
  snapshot: SettingsDraftSnapshot,
  bar: RefObject<HTMLDivElement | null>,
  region: RefObject<HTMLElement | null>
) {
  const seen = useRef(snapshot.invalidAttempts);
  useEffect(() => {
    if (snapshot.invalidAttempts === seen.current) return;
    seen.current = snapshot.invalidAttempts;
    bar.current?.animate?.(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(6px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
    // 等作者把错误标到字段上再找
    const frame = requestAnimationFrame(() => {
      const target = region.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [snapshot.invalidAttempts, bar, region]);
}

export function SettingsDraftBar({
  controller,
  region,
}: {
  controller: SettingsDraftController;
  /** 设置分区容器，用于定位第一处错误 */
  region: RefObject<HTMLElement | null>;
}) {
  const snapshot = useSettingsDraftSnapshot(controller);
  const bar = useRef<HTMLDivElement | null>(null);
  useInvalidFeedback(snapshot, bar, region);
  if (!snapshot.attached) return null;
  const saving = snapshot.phase === "saving";
  const shown = snapshot.dirty || snapshot.phase !== "idle";
  return (
    <div className="pointer-events-none sticky bottom-0 z-10 flex justify-center pt-5 pb-4">
      <div
        ref={bar}
        role="region"
        aria-label="未保存的修改"
        aria-hidden={shown ? undefined : true}
        inert={!shown}
        className={cn(
          "bg-surface border-line-1 shadow-float flex w-[min(100%,480px)] items-center gap-2 rounded-[14px] border py-[7px] pr-[7px] pl-3.5",
          "ease-tau-out transition-[translate,opacity] duration-200",
          shown ? "pointer-events-auto" : "translate-y-[calc(100%+24px)] opacity-0"
        )}
      >
        <p
          role={snapshot.phase === "failed" ? "alert" : "status"}
          className="text-tau-meta text-ink-1 flex min-w-0 flex-1 items-center gap-[7px]"
        >
          <Status snapshot={snapshot} />
        </p>
        {snapshot.dirty && (
          <Button variant="ghost" disabled={saving} onClick={() => controller.reset()}>
            还原
          </Button>
        )}
        {(snapshot.dirty || snapshot.phase === "failed" || saving) && (
          <Button variant="primary" loading={saving} onClick={() => void controller.save()}>
            {snapshot.saveLabel}
            <kbd className="font-tau-mono text-tau-micro opacity-60">{isMac ? "⌘S" : "Ctrl S"}</kbd>
          </Button>
        )}
      </div>
    </div>
  );
}

/** 离开确认：保存并离开（默认）/ 继续编辑 / 放弃修改 */
export function SettingsLeaveDialog({
  controller,
  title,
}: {
  controller: SettingsDraftController;
  /** 设置分区名 */
  title?: string;
}) {
  const snapshot = useSettingsDraftSnapshot(controller);
  // 回答后保存进行中仍显示对话框，失败时保存条给出原因
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (snapshot.leaving) setOpen(true);
  }, [snapshot.leaving]);
  const visible = open && snapshot.leaving;
  const invalid = snapshot.errors > 0;
  return (
    <Dialog
      open={visible}
      onOpenChange={next => {
        if (next) return;
        setOpen(false);
        controller.answerLeave("stay");
      }}
      title="有修改还没保存"
      context={title}
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft mr-auto"
            onClick={() => {
              setOpen(false);
              controller.answerLeave("discard");
            }}
          >
            放弃修改
          </Button>
          <Button
            variant="secondary"
            data-autofocus={invalid || undefined}
            onClick={() => {
              setOpen(false);
              controller.answerLeave("stay");
            }}
          >
            继续编辑
          </Button>
          <Button
            variant="primary"
            disabled={invalid}
            title={invalid ? "有填写错误，修正后才能保存" : undefined}
            data-autofocus={!invalid || undefined}
            onClick={() => {
              setOpen(false);
              controller.answerLeave("save");
            }}
          >
            保存并离开
          </Button>
        </>
      }
    >
      <DialogBody>
        <p className="text-ink-2">
          {invalid ? "有填写错误，修正后才能保存。" : "离开后这些修改会丢失："}
        </p>
        {snapshot.changes.length > 0 && (
          <ul className="text-ink-2 mt-2 list-disc pl-5">
            {snapshot.changes.map((change, index) => (
              <li key={index}>
                {change.label}
                {change.to !== undefined && (
                  <>
                    ：{change.from || "未填"} →{" "}
                    <b className="text-ink-1 font-medium">{change.to || "未填"}</b>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogBody>
    </Dialog>
  );
}
