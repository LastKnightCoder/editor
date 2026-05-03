import { FC, ReactNode } from "react";

interface TooltipProps {
  title: string;
  children: ReactNode;
}

const Tooltip: FC<TooltipProps> = ({ title, children }) => {
  return (
    <div className="group relative inline-block">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
        <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs px-2 py-1 rounded whitespace-nowrap">
          {title}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
          <div className="border-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
        </div>
      </div>
    </div>
  );
};

export default Tooltip;
