/* eslint-disable react-refresh/only-export-components -- 保存条与同域的草稿接线 hook 一起导出 */
/**
 * 手机插件设置的保存条与离开确认：贴在页面滚动区底部、安全区之上。
 * 返回的拦截由 PluginPageComponentScope 的 guard 接入（每个页面只有一个守卫位）。
 * 草稿状态由插件经 useSettingsDraft 报告，或由宿主提供方表单报告。
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import type { SettingsDraftController } from "@tau/plugins/settings-draft";
import { Button, cn } from "@tau/ui";
import { BottomSheet } from "../../../components/BottomSheet";

export function useSettingsDraftSnapshot(controller: SettingsDraftController) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export function SettingsDraftBar({ controller }: { controller: SettingsDraftController }) {
  const snapshot = useSettingsDraftSnapshot(controller);
  if (!snapshot.attached) return null;
  const saving = snapshot.phase === "saving";
  const shown = snapshot.dirty || snapshot.phase !== "idle";
  const status =
    snapshot.phase === "saving" ? (
      <>
        <LoaderCircle size={15} className="flex-none animate-spin" />
        {snapshot.savingText || "正在保存…"}
      </>
    ) : snapshot.phase === "saved" ? (
      <span className="text-ok flex min-w-0 items-center gap-1.5">
        <CircleCheck size={15} className="flex-none" />
        <span className="min-w-0 truncate">{snapshot.message || "已保存"}</span>
      </span>
    ) : snapshot.phase === "failed" ? (
      <span className="text-danger flex min-w-0 items-center gap-1.5">
        <CircleAlert size={15} className="flex-none" />
        <span className="min-w-0 break-words">{snapshot.message}</span>
      </span>
    ) : snapshot.errors > 0 ? (
      <span className="text-danger">{snapshot.errors} 项填写有误</span>
    ) : (
      <>
        <span aria-hidden className="bg-accent size-[7px] flex-none rounded-full" />
        {snapshot.changes.length ? `${snapshot.changes.length} 项修改未保存` : "有未保存的修改"}
      </>
    );
  return (
    <div className="pointer-events-none sticky bottom-0 z-10 -mx-1 pt-4 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div
        role="region"
        aria-label="未保存的修改"
        aria-hidden={shown ? undefined : true}
        inert={!shown}
        className={cn(
          "bg-surface border-line-1 shadow-float flex items-center gap-2 rounded-2xl border py-2 pr-2 pl-3.5",
          "transition-[translate,opacity] duration-200 ease-out",
          shown ? "pointer-events-auto" : "translate-y-[calc(100%+24px)] opacity-0"
        )}
      >
        <p
          role={snapshot.phase === "failed" ? "alert" : "status"}
          className="text-ink-1 flex min-w-0 flex-1 items-center gap-[7px] text-[13px]"
        >
          {status}
        </p>
        {snapshot.dirty && (
          <Button
            variant="ghost"
            className="min-h-10"
            disabled={saving}
            onClick={() => controller.reset()}
          >
            还原
          </Button>
        )}
        {(snapshot.dirty || snapshot.phase === "failed" || saving) && (
          <Button
            variant="primary"
            className="min-h-10"
            loading={saving}
            onClick={() => void controller.save()}
          >
            {snapshot.saveLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function SettingsLeaveSheet({ controller }: { controller: SettingsDraftController }) {
  const snapshot = useSettingsDraftSnapshot(controller);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (snapshot.leaving) setOpen(true);
  }, [snapshot.leaving]);
  const invalid = snapshot.errors > 0;
  const answer = (choice: "save" | "discard" | "stay") => {
    setOpen(false);
    controller.answerLeave(choice);
  };
  return (
    <BottomSheet
      open={open && snapshot.leaving}
      title="有修改还没保存"
      onClose={() => answer("stay")}
    >
      <p className="text-ink-2 text-[13.5px]">
        {invalid ? "有填写错误，修正后才能保存。" : "离开后这些修改会丢失："}
      </p>
      {snapshot.changes.length > 0 && (
        <ul className="text-ink-2 mt-2 list-disc pl-5 text-[13.5px]">
          {snapshot.changes.map((change, index) => (
            <li key={index}>
              {change.label}
              {change.to !== undefined && (
                <>
                  ：{change.from || "未填"} →{" "}
                  <b className="text-ink-1 font-semibold">{change.to || "未填"}</b>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <Button
          variant="primary"
          className="min-h-11"
          disabled={invalid}
          onClick={() => answer("save")}
        >
          保存并离开
        </Button>
        <Button variant="secondary" className="min-h-11" onClick={() => answer("stay")}>
          继续编辑
        </Button>
        <Button variant="ghost" className="text-danger min-h-11" onClick={() => answer("discard")}>
          放弃修改
        </Button>
      </div>
    </BottomSheet>
  );
}
