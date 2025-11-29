import React from "react";

interface SettingSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const SettingSection: React.FC<SettingSectionProps> = ({
  title,
  description,
  children,
  className = "",
}) => {
  return (
    <div className={`mb-8 ${className}`}>
      <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {description}
        </p>
      )}
      {children}
    </div>
  );
};

export default SettingSection;
