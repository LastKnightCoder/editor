import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";

import { Board, BoardContextMenuPayload } from "../types";

export const useContextMenu = (board: Board) => {
  const [context, setContext] = useState<BoardContextMenuPayload | null>(null);

  const hide = useMemoizedFn(() => {
    setContext(null);
  });

  useEffect(() => {
    const handler = (payload: BoardContextMenuPayload) => {
      setContext(payload);
    };
    board.on("context-menu", handler);
    return () => {
      board.off("context-menu", handler);
    };
  }, [board]);

  useEffect(() => {
    if (!context) return;
    // 外点 / Esc / Tab 关闭由 Menu 公共件（useMenuTree）承担；这里只补滚轮平移时收起
    const handleWheel = () => hide();
    document.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      document.removeEventListener("wheel", handleWheel);
    };
  }, [context, hide]);

  useEffect(() => {
    const handleReadonlyChange = () => hide();
    board.on("readonlyChange", handleReadonlyChange);
    return () => {
      board.off("readonlyChange", handleReadonlyChange);
    };
  }, [board, hide]);

  return {
    context,
    hide,
  };
};

export default useContextMenu;
