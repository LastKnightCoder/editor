import React from "react";

interface SettingContainerProps {
  children: React.ReactNode;
  className?: string;
}

const SettingContainer: React.FC<SettingContainerProps> = ({
  children,
  className = "",
}) => {
  return (
    <div className={`h-full overflow-y-auto p-6 ${className}`}>
      <div className="max-w-[1400px] mx-auto">{children}</div>
    </div>
  );
};

export default SettingContainer;
