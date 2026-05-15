export default function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2 pt-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg px-3 py-3">
          <div className="h-3.5 w-4/5 rounded bg-gray-200 dark:bg-zinc-700" />
          <div className="mt-2 h-2.5 w-3/5 rounded bg-gray-100 dark:bg-zinc-800" />
          <div className="mt-2 flex gap-2">
            <div className="h-2 w-8 rounded bg-gray-100 dark:bg-zinc-800" />
            <div className="h-2 w-14 rounded bg-gray-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}
