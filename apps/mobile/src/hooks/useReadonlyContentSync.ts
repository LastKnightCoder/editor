import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import { normalizeEditorContent } from "../features/cards/editorContentUtils";
import {
  createContentSyncSourceId,
  subscribeContentUpdate,
} from "../features/cards/contentSyncBus";

type UseReadonlyContentSyncOptions = {
  initialContent?: Descendant[];
  onContentSync: (content: Descendant[]) => void;
};

export function useReadonlyContentSync(
  contentId: number | undefined,
  options: UseReadonlyContentSyncOptions,
): void {
  const sourceIdRef = useRef(createContentSyncSourceId());
  const notifyContentSync = useMemoizedFn((content?: Descendant[]) => {
    options.onContentSync(normalizeEditorContent(content ?? []));
  });

  useEffect(() => {
    notifyContentSync(options.initialContent);
  }, [contentId, notifyContentSync, options.initialContent]);

  useEffect(() => {
    const nextId = contentId ?? -1;
    if (nextId <= 0) {
      return;
    }
    return subscribeContentUpdate(
      nextId,
      sourceIdRef.current,
      (nextContent) => {
        notifyContentSync(nextContent);
      },
    );
  }, [contentId, notifyContentSync]);
}

export default useReadonlyContentSync;
