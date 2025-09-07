import { useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Direction } from "../TableStore";

type DirectionString = "up" | "down" | "left" | "right";

export const useKeyboardNavigation = (
  onMove: (direction: DirectionString | Direction) => void,
  onEdit: () => void,
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
        e.preventDefault();
        onMove("up");
        break;
      case "ArrowDown":
        e.preventDefault();
        onMove("down");
        break;
      case "ArrowLeft":
        e.preventDefault();
        onMove("left");
        break;
      case "ArrowRight":
        e.preventDefault();
        onMove("right");
        break;
      case "Enter":
        e.preventDefault();
        onEdit();
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
