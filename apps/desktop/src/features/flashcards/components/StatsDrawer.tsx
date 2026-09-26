/**
 * 概况抽屉（非模态 Drawer，盖在列表右侧，不压暗；Esc 经页面浮层仲裁关闭）：
 * 今日总览 = 近 7 天评分 / 未来 7 天到期（OverviewSide）；选中卡组 = 卡组概况（DeckSide）。
 * 内容由调用方按范围传入，工具栏「概况」按钮开关。
 */

import type { ReactNode } from "react";
import { Drawer } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";

export function StatsDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  useOverlayDismiss(onClose, open);
  return (
    <Drawer
      modal={false}
      open={open}
      onOpenChange={next => !next && onClose()}
      size="sm"
      title={title}
      subtitle={subtitle}
      className="top-0"
      // 侧板组件自带 px-5 / pt-[18px]，抽屉正文内边距收窄以对齐头部
      bodyClassName="pl-0.5 pr-0 pt-0"
    >
      {children}
    </Drawer>
  );
}
