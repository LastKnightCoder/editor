import { useSyncExternalStore } from "react";
import { useBoard } from "./useBoard";
import { useMemoizedFn } from "ahooks";
import { PresentationSequence } from "../types";

export interface PresentationState {
  isPresentationMode: boolean;
  isCreatingSequence: boolean;
  currentSequence: PresentationSequence | null;
  currentFrameIndex: number | null;
  sequences: PresentationSequence[];
}

export const usePresentationState = () => {
  const board = useBoard();

  const getIsPresentationMode = useMemoizedFn(() => {
    return board.presentationManager.isPresentationMode;
  });

  const getIsCreatingSequence = useMemoizedFn(() => {
    return board.presentationManager.isCreatingSequence;
  });

  const getCurrentSequence = useMemoizedFn(() => {
    return board.presentationManager.currentSequence;
  });

  const getCurrentFrameIndex = useMemoizedFn(() => {
    return board.presentationManager.currentFrameIndex;
  });

  const getSequences = useMemoizedFn(() => {
    return board.presentationManager.sequences;
  });

  const subscribeIsPresentationMode = useMemoizedFn((callback: () => void) => {
    board.presentationManager.on("presentationModeChange", callback);
    return () =>
      board.presentationManager.off("presentationModeChange", callback);
  });

  const subscribeIsCreatingSequence = useMemoizedFn((callback: () => void) => {
    board.presentationManager.on("presentationCreatorChange", callback);
    return () =>
      board.presentationManager.off("presentationCreatorChange", callback);
  });

  const subscribeCurrentSequence = useMemoizedFn((callback: () => void) => {
    board.presentationManager.on("presentationCurrentSequenceChange", callback);
    return () =>
      board.presentationManager.off(
        "presentationCurrentSequenceChange",
        callback,
      );
  });

  const subscribeCurrentFrameIndex = useMemoizedFn((callback: () => void) => {
    board.presentationManager.on(
      "presentationCurrentFrameIndexChange",
      callback,
    );
    return () =>
      board.presentationManager.off(
        "presentationCurrentFrameIndexChange",
        callback,
      );
  });

  const subscribeSequences = useMemoizedFn((callback: () => void) => {
    board.presentationManager.on("presentationSequencesChange", callback);
    return () =>
      board.presentationManager.off("presentationSequencesChange", callback);
  });

  const isPresentationMode = useSyncExternalStore(
    subscribeIsPresentationMode,
    getIsPresentationMode,
  );
  const isCreatingSequence = useSyncExternalStore(
    subscribeIsCreatingSequence,
    getIsCreatingSequence,
  );
  const currentSequence = useSyncExternalStore(
    subscribeCurrentSequence,
    getCurrentSequence,
  );
  const currentFrameIndex = useSyncExternalStore(
    subscribeCurrentFrameIndex,
    getCurrentFrameIndex,
  );
  const sequences = useSyncExternalStore(subscribeSequences, getSequences);

  return {
    isPresentationMode,
    isCreatingSequence,
    currentSequence,
    currentFrameIndex,
    sequences,
  };
};

export default usePresentationState;
