import { memo, ButtonHTMLAttributes, ReactNode } from "react";
import useThemeColors from "@/hooks/useThemeColors";

type ButtonVariant = "primary" | "default" | "danger" | "text";
type ButtonSize = "small" | "medium" | "large";

interface SimpleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
  loading?: boolean;
  htmlType?: "button" | "submit" | "reset";
}

const sizeClasses: Record<ButtonSize, string> = {
  small: "px-2 py-1 text-xs",
  medium: "px-3 py-1.5 text-sm",
  large: "px-4 py-2 text-base",
};

const SimpleButton = memo((props: SimpleButtonProps) => {
  const {
    variant = "default",
    size = "medium",
    icon,
    block = false,
    loading = false,
    disabled,
    className = "",
    children,
    htmlType = "button",
    ...rest
  } = props;

  const { primaryButtonClass, hoverClass, borderClass, textClass } = useThemeColors();

  const isDisabled = disabled || loading;

  // 根据 variant 动态生成样式
  const getVariantClasses = () => {
    switch (variant) {
      case "primary":
        return primaryButtonClass;
      case "danger":
        return "bg-red-500/80 text-white border-red-500/50 hover:bg-red-600/90";
      case "text":
        return `bg-transparent border-transparent ${textClass} ${hoverClass}`;
      default:
        return `bg-surface/80 backdrop-blur-sm ${textClass} ${borderClass} ${hoverClass}`;
    }
  };

  return (
    <button
      type={htmlType}
      disabled={isDisabled}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border transition-all ${getVariantClasses()} ${sizeClasses[size]} ${block ? "w-full" : ""} ${isDisabled ? "cursor-not-allowed opacity-50" : ""} ${className} `}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children && <span>{children}</span>}
    </button>
  );
});

SimpleButton.displayName = "SimpleButton";

export default SimpleButton;
