/**
 * 协作头像：成员色取 @tau/collaboration 的 memberColor——与编辑器远端光标、名牌、选区
 * 同色，一眼对上「谁在哪」；它是按设备派生的身份色（设计数据色），不进主题词表。
 */

import { memo, type CSSProperties } from "react";
import { memberColor, type Member } from "@tau/collaboration";
import { cn } from "@tau/ui";
import { memberActivity, type MemberActivity } from "./model";

const ACTIVITY_DOT: Record<MemberActivity, string> = {
  editing: "bg-ok",
  viewing: "bg-info",
  background: "bg-ink-3",
  offline: "",
};

const activityLabel = (activity: MemberActivity) =>
  activity === "offline" ? "离线" : memberActivity({ online: true, activity } as Member);

export const Avatar = memo(function Avatar({
  id,
  name,
  activity,
  size = 22,
  className,
}: {
  id: string;
  name: string;
  /** 传入则在右下角画活动点（编辑 ok / 查看 info / 后台 ink-3；离线整体褪色） */
  activity?: MemberActivity;
  size?: number;
  /** 活动点与叠放描边的底色，默认 surface（放在 page 上时传 ring-page） */
  className?: string;
}) {
  const color = memberColor(id);
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.46)),
    color,
    background: `color-mix(in oklch, ${color} 16%, transparent)`,
  } satisfies CSSProperties;
  return (
    <span
      className={cn(
        "ring-surface relative inline-grid flex-none select-none place-items-center rounded-full font-[600] leading-none",
        activity === "offline" && "opacity-55 grayscale-[0.85]",
        className
      )}
      style={style}
      title={activity ? `${name} · ${activityLabel(activity)}` : name}
    >
      {(name || "?").trim().slice(0, 1).toUpperCase()}
      {activity && activity !== "offline" && (
        <i
          aria-hidden
          className={cn(
            "absolute -bottom-px -right-px size-[7px] rounded-full ring-2",
            ACTIVITY_DOT[activity]
          )}
        />
      )}
    </span>
  );
});
