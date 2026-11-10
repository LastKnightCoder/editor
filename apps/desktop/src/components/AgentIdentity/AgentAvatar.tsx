/**
 * Agent 身份的视觉件：头像（身份色 + 首字 + ✦ 角标）与署名。身份色与正文光标、修订痕迹、
 * 对话里的子 Agent 头像同源（按职责名派生），是设计数据色，经 `--agent` 变量注入，不进主题词表。
 */

import { memo, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@tau/ui";
import { agentColorStyle, agentIdentity } from "@/services/agent-identity";

/** busy 正在干活（转圈）；waiting 在等你处理（橙点）；idle 在场但没动作 */
export type AgentActivityStatus = "busy" | "waiting" | "idle";

const initial = (name: string) => {
  const first = [...name.trim()][0] ?? "?";
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
};

export const AgentAvatar = memo(function AgentAvatar({
  name,
  size = 22,
  status,
  className,
}: {
  name: string | undefined;
  size?: number;
  status?: AgentActivityStatus;
  /** 叠放时的描边等外观覆盖 */
  className?: string;
}) {
  const identity = agentIdentity(name);
  return (
    <span
      className={cn(
        "relative inline-grid flex-none place-items-center rounded-full leading-none font-[600] select-none",
        "bg-[color-mix(in_oklch,var(--agent)_16%,transparent)] text-[var(--agent)]",
        className
      )}
      style={{
        ...agentColorStyle(identity.name),
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.46)),
      }}
      title={identity.name}
    >
      {initial(identity.name)}
      <span
        aria-hidden
        className="bg-surface absolute -right-[3px] -bottom-[3px] grid size-3 place-items-center rounded-full"
      >
        <Sparkles className="size-[9px]" strokeWidth={2} />
      </span>
      {status === "busy" && (
        <span
          aria-hidden
          className="absolute -inset-[3px] animate-spin rounded-full border-[1.5px] border-[var(--agent)] border-r-transparent [animation-duration:1.4s]"
        />
      )}
      {status === "waiting" && (
        <span
          aria-hidden
          className="bg-warn ring-page absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2"
        />
      )}
    </span>
  );
});

/** 署名：身份色加粗，用在卡片头与动态行里 */
export function AgentName({ name, children }: { name: string | undefined; children?: ReactNode }) {
  const identity = agentIdentity(name);
  return (
    <span className="font-[600] text-[var(--agent)]" style={agentColorStyle(identity.name)}>
      {children ?? identity.name}
    </span>
  );
}
