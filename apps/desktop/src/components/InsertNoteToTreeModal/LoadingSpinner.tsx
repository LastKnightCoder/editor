import { memo } from "react";
import { Spinner, cn } from "@tau/ui";

interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

const sizeClasses = {
  small: "size-4",
  medium: "size-6",
  large: "size-8 border-[3px]",
};

/** 兼容旧调用的薄封装：内部即 @tau/ui 的 Spinner，新代码请直接用 Spinner / Loading */
const LoadingSpinner = memo((props: LoadingSpinnerProps) => {
  const { size = "medium", className = "" } = props;
  return <Spinner className={cn(sizeClasses[size], className)} />;
});

LoadingSpinner.displayName = "LoadingSpinner";

export default LoadingSpinner;
