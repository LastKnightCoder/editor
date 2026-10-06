/**
 * 阅读位置：视口顶端所在页 + 页内纵向位置（PDF 坐标）。页码写进 pdfs.last_page（列表的阅读进度也用它），
 * 页内位置只在本机记（按 pdfId，最多保留最近 MAX_ENTRIES 份）；恢复时页码与库里一致才用页内位置。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ReadingPosition {
  /** 从 1 开始 */
  page: number;
  /** 页内纵向位置（PDF 坐标，未乘缩放） */
  y: number;
}

const MAX_ENTRIES = 300;

interface StoredPosition extends ReadingPosition {
  /** 写入时间：超出上限时丢掉最久没读的 */
  at: number;
}

interface ReadingPositionStore {
  positions: Record<number, StoredPosition>;
  save: (pdfId: number, position: ReadingPosition) => void;
}

export const useReadingPositions = create<ReadingPositionStore>()(
  persist(
    set => ({
      positions: {},
      save: (pdfId, position) =>
        set(state => {
          const positions = { ...state.positions, [pdfId]: { ...position, at: Date.now() } };
          const ids = Object.keys(positions);
          if (ids.length > MAX_ENTRIES) {
            const oldest = ids.reduce((a, b) => (positions[+a].at <= positions[+b].at ? a : b));
            delete positions[+oldest];
          }
          return { positions };
        }),
    }),
    { name: "tau-pdf-reading-positions" }
  )
);

/** 打开时的起始位置：库里的页码为准，本机记的页内位置页码对得上才用 */
export function initialReadingPosition(
  pdfId: number,
  lastPage: number | null | undefined
): ReadingPosition | null {
  if (!lastPage || lastPage < 1) return null;
  const local = useReadingPositions.getState().positions[pdfId];
  return { page: lastPage, y: local?.page === lastPage ? local.y : 0 };
}
