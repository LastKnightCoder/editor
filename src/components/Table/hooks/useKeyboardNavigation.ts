import { useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Direction } from "../TableStore";

type DirectionString = "up" | "down" | "left" | "right";

export const useKeyboardNavigation = (
  onMove: (direction: DirectionString | Direction) => void,
  onEdit: (e: KeyboardEvent) => void,
) => {
  const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        onMove("up");
        break;
      case "ArrowDown":
        onMove("down");
        break;
      case "ArrowLeft":
        onMove("left");
        break;
      case "ArrowRight":
        onMove("right");
        break;
      case "Enter":
      case " ":
        onEdit(e);
        break;
    }
  });

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
};

export default useKeyboardNavigation;
