/**
 * lucide 缺的几枚属性图标（线宽 / 圆角 / 草图 / 虚线 / 内边距 / 阴影 / 箭头端点），
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

export const LineWidthIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 6h18" strokeWidth={1} />
    <path d="M3 12h18" strokeWidth={2} />
    <path d="M3 18h18" strokeWidth={3.2} />
  </Icon>
);
export const CornerIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 20V10a6 6 0 0 1 6-6h10" />
  </Icon>
);
export const DashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 12h4M10 12h4M17 12h4" />
  </Icon>
);
export const PaddingIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
    <rect x="8" y="8" width="8" height="8" rx="1" />
  </Icon>
);
export const ShadowIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <path d="M21 7v12a2 2 0 0 1-2 2H7" />
  </Icon>
);
export const MarkerStartIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M21 12H6" />
    <path d="m10 7-5 5 5 5" />
  </Icon>
);
export const MarkerEndIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 12h15" />
    <path d="m14 7 5 5-5 5" />
  </Icon>
);
