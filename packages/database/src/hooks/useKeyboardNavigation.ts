import { useEffect, type RefObject } from "react";
import { isEditableTarget } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import { Direction } from "../DatabaseStore";

type DirectionString = "up" | "down" | "left" | "right";

export const useKeyboardNavigation = (
  onMove: (direction: DirectionString | Direction) => void,
  onEdit: (e: KeyboardEvent) => void,
  scope?: RefObject<HTMLElement | null>
) => {
  const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
    if (
      e.defaultPrevented ||
      e.isComposing ||
      e.altKey ||
      e.metaKey ||
      e.ctrlKey ||
      isEditableTarget(e.target) ||
      (scope && (!(e.target instanceof Node) || !scope.current?.contains(e.target)))
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
