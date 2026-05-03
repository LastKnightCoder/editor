import { FC, ReactNode } from "react";

interface EmptyStateProps {
  description: string;
  icon?: ReactNode;
}

const EmptyState: FC<EmptyStateProps> = ({ description, icon }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {icon || (
        <svg
          className="w-16 h-16 text-gray-300 dark:text-slate-600 mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )}
      <p className="text-sm text-gray-500 dark:text-slate-400">{description}</p>
    </div>
  );
};

export default EmptyState;
