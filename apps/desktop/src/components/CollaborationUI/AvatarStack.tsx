/** 头像叠放：在线优先，超出收为 +N */

import { memo } from "react";
import { cn } from "@tau/ui";
import { Avatar } from "./Avatar";

export const AvatarStack = memo(function AvatarStack({
  members,
  max = 3,
  size = 20,
  className,
}: {
  members: { deviceId: string; nickname: string; online?: boolean }[];
  max?: number;
  size?: number;
  /** 叠放描边色，默认 ring-surface */
  className?: string;
}) {
  const sorted = [...members].sort((a, b) => Number(b.online) - Number(a.online));
  const shown = sorted.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <span className="inline-flex flex-none items-center">
      {shown.map((member, index) => (
        <Avatar
          key={member.deviceId}
          id={member.deviceId}
          name={member.nickname}
          size={size}
          className={cn("ring-2", index > 0 && "-ml-1.5", className)}
        />
      ))}
      {rest > 0 && <span className="text-ink-3 ml-1 text-[11.5px] tabular-nums">+{rest}</span>}
    </span>
  );
});
