import { useContext } from "react";
import { useStore } from "zustand";
import { useMemoizedFn } from "ahooks";
import {
  MentionPanelContext,
  MentionPanelStoreType,
  IMentionPanelState,
  IMentionPanelActions,
} from "./MentionPanelContext";

export function useMentionPanelStore<T = MentionPanelStoreType>(
  selector?: (state: IMentionPanelState & IMentionPanelActions) => T,
): T {
  const store = useContext(MentionPanelContext);

  if (!store) {
    throw new Error(
      "useMentionPanelStore must be used within a MentionPanelContext.Provider",
    );
  }

  const defaultSelector = useMemoizedFn(() => store as unknown as T);

  return useStore(store, selector || defaultSelector);
}

export default useMentionPanelStore;
