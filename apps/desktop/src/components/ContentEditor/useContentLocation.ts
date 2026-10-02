import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReactEditor } from "slate-react";
import type { EditorRef } from "@tau/editor";
import { getLineageAnchor } from "@/commands/lineage";
import { parseEntityLocation } from "@/entity/locate";
import { resolveQuoteAnchor } from "@/entity/quote-anchor";
import useSettingStore from "@/stores/useSettingStore";
import { scrollToAndFlash } from "@/utils/flash-element";

export function useContentLocation(
  editor: ReturnType<EditorRef["getEditor"]> | null,
  contentId: number | undefined,
  at: string | undefined
) {
  const database = useSettingStore(state => state.setting.database.active);
  const location = parseEntityLocation(at);
  const quoteId = location && "quote" in location ? location.quote : null;
  const query = useQuery({
    queryKey: ["lineage-anchor", database, quoteId, contentId],
    queryFn: () => getLineageAnchor(quoteId!, contentId!),
    enabled: quoteId !== null && !!contentId,
  });
  useEffect(() => {
    if (!editor || !at || (quoteId !== null && query.isPending)) return;
    const frame = requestAnimationFrame(() => {
      const target = parseEntityLocation(at);
      const block =
        target && "block" in target
          ? target.block
          : query.data?.quote
            ? resolveQuoteAnchor(editor.children, query.data.quote).blockStart
            : 0;
      const node = editor.children[block] ?? editor.children[0];
      if (!node) return;
      try {
        scrollToAndFlash(ReactEditor.toDOMNode(editor, node));
      } catch {
        /* 正文切换时旧节点可能已卸载。 */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, at, contentId, database, quoteId, query.isPending, query.data]);
}
