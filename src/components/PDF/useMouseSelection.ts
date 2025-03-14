import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";

interface IUseMouseSelection {
  onSelectEnd: (start: any, end: any) => void;
}

const useMouseSelection = (options: IUseMouseSelection) => {
  const { onSelectEnd } = options;
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);

  const canSelect = useRef(false);

  const handleMouseUp = useMemoizedFn((e: any) => {
    document.removeEventListener("mouseup", handleMouseUp);
    if (canSelect.current) {
      const end = e.target.getBoundingClientRect();
      setEnd(end);
      canSelect.current = false;
      if (start && end) {
        onSelectEnd(start, end);
      }
    }
  });

  const handleMouseDown = useMemoizedFn((e: any) => {
    // 是否在 textLayer 上按下鼠标
    if (e.target.closest(".page")) {
      canSelect.current = true;
      setStart(e.target.getBoundingClientRect());
    }

    document.addEventListener("mouseup", handleMouseUp);
  });

  useEffect(() => {
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [handleMouseDown]);

  return {
    start,
    end,
  };
};

export default useMouseSelection;
