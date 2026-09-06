import { FC } from "react";

interface SpinnerProps {
  size?: "small" | "default" | "large";
}

const Spinner: FC<SpinnerProps> = ({ size = "default" }) => {
  const sizeClasses = {
    small: "w-4 h-4 border-2",
    default: "w-6 h-6 border-2",
    large: "w-8 h-8 border-3",
  };

  return (
    <div
      className={`${sizeClasses[size]} animate-spin rounded-full border-[var(--th-accent)] border-t-transparent`}
    />
  );
};

export default Spinner;
