/**
 * 域外入口的「开始专注」（日程事件抽屉、待办抽屉）：
 * 没有进行中的番茄 → 弹预设菜单，选中即开始并关联到该对象；
 * 有进行中的番茄 → 「专注于此」，把当前这次改关联到该对象。
 * 只经命令层与 useActivePomodoro，不依赖番茄域的 store（各窗口由主进程广播自行镜像）。
 */

import { Link2, Play } from "lucide-react";
import { Button, Menu, toast } from "@tau/ui";
import { startPomodoroSession, updatePomodoroBinding } from "@/commands/pomodoro";
import { openPomodoroMiniWindow } from "@/commands/window";
import { isElectron } from "@/electron";
import { useActivePomodoro } from "@/hooks/useActivePomodoro";
import { usePage } from "@/page/PageProvider";
import type { PomodoroBindTarget, PomodoroPreset } from "@/types";
import { sameTarget } from "../bindTargets";
import { presetShort } from "../model";
import { usePomodoroPresets } from "../queries";
import { PresetDot } from "./PomodoroBits";

const targetOfSession = (session: {
  boundEventId?: number;
  boundTodoId?: number;
}): PomodoroBindTarget | null =>
  session.boundEventId != null
    ? { kind: "event", eventId: session.boundEventId }
    : session.boundTodoId != null
      ? { kind: "todo", todoId: session.boundTodoId }
      : null;

export function FocusStartButton({
  target,
  title,
  label = "开始专注",
}: {
  target: PomodoroBindTarget;
  /** 关联对象标题（toast 用） */
  title: string;
  label?: string;
}) {
  const active = useActivePomodoro();
  const presets = usePomodoroPresets();
  const { navigator } = usePage();

  if (active) {
    const bound = sameTarget(targetOfSession(active), target);
    return (
      <Button
        variant="secondary"
        size="sm"
        icon={Link2}
        disabled={bound}
        title={bound ? "当前专注已关联到这里" : "把正在进行的专注关联到这里"}
        onClick={() =>
          void updatePomodoroBinding(target)
            .then(() => toast.success(`当前专注已关联到「${title}」`))
            .catch(() => toast.error("关联失败"))
        }
      >
        {bound ? "专注中" : "专注于此"}
      </Button>
    );
  }

  const start = (preset: PomodoroPreset) =>
    void startPomodoroSession({ presetId: preset.id, target })
      .then(() =>
        toast.success(`已开始专注 · ${preset.name}`, {
          action: isElectron
            ? { label: "打开小窗", onClick: () => void openPomodoroMiniWindow() }
            : undefined,
        })
      )
      .catch(() => toast.error("开始专注失败"));

  return (
    <Menu
      trigger={
        <Button variant="secondary" size="sm" icon={Play} title={`${label}，选一个预设`}>
          {label}
        </Button>
      }
    >
      {presets.active.map(preset => (
        <Menu.Item
          key={preset.id}
          icon={<PresetDot presetId={preset.id} />}
          onSelect={() => start(preset)}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="truncate">{preset.name}</span>
            <span className="text-ink-3 ml-auto shrink-0 tabular-nums">{presetShort(preset)}</span>
          </span>
        </Menu.Item>
      ))}
      {presets.active.length === 0 && (
        <Menu.Item onSelect={() => navigator.push("pomodoro", {})}>去番茄页新建预设</Menu.Item>
      )}
    </Menu>
  );
}
