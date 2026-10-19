/**
 * 放着真实白板画布的白板块（whiteboard 块的展示态外壳同 doc/Blocks 的 WhiteboardBlock）。
 * 画布区域与白板详情页的纸面等比（1186×834 缩到 678 宽），所以把块放大到纸面大小时，画面与白板窗口里的画布逐像素一致。
 */
import { Maximize } from "lucide-react";
import { BOARD_BOUNDS } from "../../mock/board";
import { BoardCanvas, type BoardReveal, type BoardView } from "./BoardCanvas";

/** 白板详情页纸面在窗口里的位置（侧栏 218 + 缝 4，内容区 px-4、标题栏 46 + pt-1、pb-4） */
export const BOARD_PAPER = { left: 238, top: 50, width: 1186, height: 834 };

/** 板内视口：适配全部内容 */
export const BOARD_FIT: BoardView = { x: BOARD_BOUNDS.x + BOARD_BOUNDS.width / 2, y: BOARD_BOUNDS.y + BOARD_BOUNDS.height / 2, zoom: 1 };

/** 块内画布尺寸（块外框 680 宽减两侧 1px 边框） */
export const LIVE_BLOCK = { width: 678, height: (BOARD_PAPER.height * 678) / BOARD_PAPER.width };

/** 白板一开始的样子：画框里已有「通知」「任务切换」，右边是嵌入的文章卡 */
export const BOARD_INITIAL: BoardReveal = { shapes: [1, 1, 0], arrows: 0, link: 0, mind: [], ref: 0 };

export function LiveBoardBlock() {
  const view = { ...BOARD_FIT, zoom: (BOARD_FIT.zoom * LIVE_BLOCK.width) / BOARD_PAPER.width };
  return (
    <div className="border-line-1 relative w-full overflow-hidden rounded-[0.5em] border border-solid">
      <div className="bg-surface relative overflow-hidden" style={{ width: LIVE_BLOCK.width, height: LIVE_BLOCK.height }}>
        <BoardCanvas view={view} width={LIVE_BLOCK.width} height={LIVE_BLOCK.height} reveal={BOARD_INITIAL} look={{ sketch: false, palette: "classic" }} />
      </div>
      <div className="absolute top-[0.625em] right-[0.625em] rounded-[0.25em] bg-[rgba(38,38,38,0.6)] p-[0.25em] text-white">
        <Maximize size={16} />
      </div>
    </div>
  );
}
