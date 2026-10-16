import type { PluginSidebarIconProps } from "@tau/plugins";

export function CounterIcon({ size = 24, strokeWidth = 2, ...props }: PluginSidebarIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 8h8M8 13h2m4 0h2M8 17h2m4 0h2" />
    </svg>
  );
}
