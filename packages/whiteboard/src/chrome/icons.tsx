/**
 * lucide 缺的几枚属性图标（阴影 / 箭头端点），
 * 画法与 lucide 一致：24 视窗、线性、stroke = currentColor、1.75。
 */
import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const ShadowIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <path d="M21 7v12a2 2 0 0 1-2 2H7" />
  </Icon>
);
export const MarkerEndIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 12h15" />
    <path d="m14 7 5 5-5 5" />
  </Icon>
);
