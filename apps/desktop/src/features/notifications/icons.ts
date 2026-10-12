import {
  Bell,
  CalendarClock,
  Check,
  Download,
  RotateCw,
  Rocket,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";

/**
 * 系统通知的图标注册表：payload 的 icon 字段跨 IPC 只传字符串键（组件不可序列化），
 * 推送端与展示端各自维护键到组件的映射，新增键须两端同步登记。
 * 未登记 / 未传 icon 时由 Notification 卡按 tone 取默认图标（铃铛 / 对勾 / 警示）。
 */
export const NOTIFICATION_ICONS = {
  /** 通用提醒（无更具体语义时的中性兜底） */
  bell: Bell,
  /** 任务到期 / 逾期提醒（todo-reminder） */
  calendarClock: CalendarClock,
  /** 番茄会话（开始 / 结束提醒） */
  timer: Timer,
  /** 操作成功回执 */
  check: Check,
  /** 下载完成（应用更新后台下载就绪） */
  download: Download,
  /** 应用更新（与 useAutoUpdateCheck 的「新版本已就绪」一致） */
  rotateCw: RotateCw,
  /** 升级后的更新公告（与 useAutoUpdateCheck 的「已更新到 vX」一致） */
  sparkles: Sparkles,
  /** 站点发布（publishRunStore 的发布结果） */
  rocket: Rocket,
} satisfies Record<string, LucideIcon>;

export type NotificationIconKey = keyof typeof NOTIFICATION_ICONS;
