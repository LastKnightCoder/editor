const LINES = ["w-11/12", "w-4/5", "w-full", "w-3/5"];

/** 可编辑正文在插件会话落定前的占位：只占编辑区，页面其他部分照常可用。 */
export function EditorKitPending({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="正在准备编辑器"
      className={`flex flex-col gap-3 py-2 ${className}`}
    >
      {LINES.map(width => (
        <div key={width} className={`bg-hover h-3.5 animate-pulse rounded ${width}`} />
      ))}
    </div>
  );
}
