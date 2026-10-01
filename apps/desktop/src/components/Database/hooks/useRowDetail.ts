import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { RowData } from "../types";

/**
 * 视图内的行详情开合状态。宿主传了 onRowDetailOpen 时由宿主接管打开（如卡片库），
 * showRowDetail 只打开内置详情（新建行后直接进入编辑用）。
 */
export function useRowDetail(onRowDetailOpen?: (row: RowData) => void) {
  const [detailRowId, setDetailRowId] = useState<string | null>(null);

  const openRowDetail = useMemoizedFn((row: RowData) => {
    if (onRowDetailOpen) onRowDetailOpen(row);
    else setDetailRowId(row.id);
  });

  const showRowDetail = useMemoizedFn((rowId: string) => {
    if (!onRowDetailOpen) setDetailRowId(rowId);
  });

  const closeRowDetail = useMemoizedFn(() => setDetailRowId(null));

  return { detailRowId, openRowDetail, showRowDetail, closeRowDetail };
}

export default useRowDetail;
