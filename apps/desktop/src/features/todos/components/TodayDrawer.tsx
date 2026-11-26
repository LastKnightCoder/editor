import { todosTranslator, useTodosI18n } from "@/features/todos/i18n";
/**
 * 今日概览抽屉（非模态 Drawer，与任务详情同位）：承载 HabitRail（今日打卡 / 本周负荷 / 最近完成）。
 * 工具栏按钮开关；从中打开任务时由任务详情抽屉接替，关掉详情回到概览。Esc 经页面浮层仲裁关闭。
 */

import type { ComponentProps } from "react";
import { Drawer } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import { HabitRail } from "./HabitRail";
const t = todosTranslator.t;

export function TodayDrawer({
  open,
  onClose,
  subtitle,
  ...rail
}: ComponentProps<typeof HabitRail> & {
  open: boolean;
  onClose(): void;
  subtitle: string;
}) {
  useTodosI18n();
  useOverlayDismiss(onClose, open);
  return (
    <Drawer
      modal={false}
      open={open}
      onOpenChange={next => !next && onClose()}
      size="sm"
      title={t("view.today")}
      subtitle={subtitle}
      className="top-0"
      bodyClassName="pl-1 pr-1"
    >
      <HabitRail {...rail} />
    </Drawer>
  );
}
