import isHotkey from "is-hotkey";
import { Board, IBoardPlugin } from "../types";

export class HistoryPlugin implements IBoardPlugin {
  name = "history";

  onKeyDown(e: KeyboardEvent, board: Board) {
    if (isHotkey("mod+z", e)) {
      board.undo();
    } else if (isHotkey("mod+shift+z", e)) {
      board.redo();
    }
  }
}
