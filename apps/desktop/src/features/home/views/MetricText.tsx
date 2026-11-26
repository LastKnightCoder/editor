/* eslint-disable react-refresh/only-export-components -- 数值插槽与展示组件使用同一标记。 */
import { Fragment, type ReactNode } from "react";

export const METRIC_VALUE = "\uFFFC";

export function MetricText({
  text,
  children,
  className = "text-accent-text font-semibold",
}: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  return text.split(METRIC_VALUE).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <b className={className}>{children}</b>}
      {part}
    </Fragment>
  ));
}
