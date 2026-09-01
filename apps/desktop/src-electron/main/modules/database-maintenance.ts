const MIN_RECLAIMABLE_BYTES = 64 * 1024 * 1024;
const MIN_FREE_PAGE_RATIO = 0.25;

export const shouldVacuumDatabase = ({
  pageCount,
  freelistCount,
  pageSize,
}: {
  pageCount: number;
  freelistCount: number;
  pageSize: number;
}) =>
  pageCount > 0 &&
  freelistCount * pageSize >= MIN_RECLAIMABLE_BYTES &&
  freelistCount / pageCount >= MIN_FREE_PAGE_RATIO;
