interface TooltipProps {
  content: string;
  children: React.ReactNode;
  isDark?: boolean;
}

const Tooltip = ({ content, children, isDark }: TooltipProps) => {
  return (
    <div className="group relative inline-block">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 group-hover:block z-50">
        <div
          className={`whitespace-nowrap rounded px-2 py-1 text-xs ${
            isDark ? "bg-zinc-700 text-slate-100" : "bg-zinc-900 text-white"
          }`}
        >
          {content}
          <div
            className={`absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-4 border-transparent ${
              isDark ? "border-t-slate-700" : "border-t-slate-900"
            }`}
          />
        </div>
      </div>
    </div>
  );
};

export default Tooltip;
