import type { SVGProps } from "react";

/** 实心右三角（折叠箭头）；随字号缩放，展开时由调用方旋转 90° */
export function CaretRight({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden
      data-icon="caret-right"
      className={className}
      {...props}
    >
      <path d="M6 3.5v9a.6.6 0 0 0 1 .45l5-4.5a.6.6 0 0 0 0-.9l-5-4.5A.6.6 0 0 0 6 3.5Z" />
    </svg>
  );
}
