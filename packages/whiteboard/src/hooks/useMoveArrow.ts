import { useEffect, useRef, MutableRefObject } from "react";
import { Point } from "../types";
import { useBoard } from "./useBoard";
import { ArrowConnectTracker } from "../utils/ArrowConnectTracker";

export type {
  ArrowConnectPointData,
  CandidateConnectPointData,
} from "../utils/ArrowConnectTracker";

export const useMoveArrow = ({
  isMoved,
  currentPoint,
}: {
  isMoved: MutableRefObject<boolean | null>;
  currentPoint: MutableRefObject<Point | null>;
}) => {
  const board = useBoard();

  const trackerRef = useRef<ArrowConnectTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new ArrowConnectTracker(board, {
      isMoved: () => isMoved.current === true,
      currentPoint: () => currentPoint.current,
      zoom: () => board.viewPort.zoom,
    });
  }
  const tracker = trackerRef.current;

  useEffect(() => {
    return tracker.attach();
  }, [board, tracker]);

  return {
    getUpdateArrowElement: tracker.getUpdateArrowElement,
    setAltMode: tracker.setAltMode.bind(tracker),
  };
};

export default useMoveArrow;
