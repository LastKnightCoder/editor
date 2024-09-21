import Board, { IBoardPlugin } from '../Board.ts';

export class BoardPlugin implements IBoardPlugin {
  name = 'board-plugin';

  isMouseDown = false;
  boardOriginOffset: { x: number; y: number } = { x: 0, y: 0 };

  init(board: Board) {
    const hooks = board.hooks;

    const { onMouseDown, onMouseMove, onMouseUp } = hooks;

    onMouseDown.tap('onMouseDown', (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      this.isMouseDown = true;
      this.boardOriginOffset = { x: e.clientX, y: e.clientY };
    });

    onMouseMove.tap('onMouseMove', (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (!this.isMouseDown) return;

      const { x, y } = { x: e.clientX, y: e.clientY }
      // change board offset
      console.log('onMouseMove', x, y);
    });

    onMouseUp.tap('onGlobalMouseUp', (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      this.isMouseDown = false;
    });
  }
}