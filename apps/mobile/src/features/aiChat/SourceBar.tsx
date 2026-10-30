// 原文条：就近对话顶部标明来源，点按就地展开正文前几段（选中片段高亮），再点收起。

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { getContentDetail } from "../../services/tauri";
import { richTextPlainText } from "../../utils/richTextText";

const EXCERPT_CHARS = 600;
const LEAD_CHARS = 80;

/** 取正文片段：有选中片段时从它前面一点开始，保证高亮落在可见范围 */
function excerptOf(text: string, quote?: string) {
  const index = quote ? text.indexOf(quote) : -1;
  const start = index > LEAD_CHARS ? index - LEAD_CHARS : 0;
  const body = text.slice(start, start + EXCERPT_CHARS);
  return {
    head: start > 0 ? "…" : "",
    body,
    tail: start + EXCERPT_CHARS < text.length ? "…" : "",
    quoteAt: index >= 0 ? index - start : -1,
  };
}

export function SourceBar(props: { contentId: number; title: string; quote?: string }) {
  const [open, setOpen] = useState(false);
  const { data: text } = useQuery({
    queryKey: ["ai-content-chat-source", props.contentId],
    queryFn: async () => richTextPlainText((await getContentDetail(props.contentId)).content),
    enabled: open,
  });
  const excerpt = text ? excerptOf(text, props.quote) : null;
  const quoteLength = props.quote?.length ?? 0;

  return (
    <div className="bg-surface text-tau-meta text-ink-2 mx-3.5 mb-1.5 shrink-0 rounded-[14px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="flex h-10 w-full items-center gap-2 px-3 text-left"
      >
        <FileText size={15} className="shrink-0" aria-hidden="true" />
        <span className="text-ink-1 min-w-0 flex-1 truncate font-semibold">
          {props.title || "未命名"}
        </span>
        <span className="text-accent-text flex shrink-0 items-center gap-0.5 font-semibold">
          {open ? "收起" : "看原文"}
          {open ? (
            <ChevronUp size={13} aria-hidden="true" />
          ) : (
            <ChevronDown size={13} aria-hidden="true" />
          )}
        </span>
      </button>
      {open && (
        <div className="max-h-32 overflow-y-auto overscroll-contain px-3 pb-2.5 leading-relaxed">
          {!excerpt ? (
            <span className="text-ink-3">{text === "" ? "正文为空" : "读取中…"}</span>
          ) : excerpt.quoteAt >= 0 ? (
            <>
              {excerpt.head}
              {excerpt.body.slice(0, excerpt.quoteAt)}
              <mark className="text-ink-1 rounded-[3px] bg-[color-mix(in_srgb,var(--tau-accent)_22%,transparent)]">
                {excerpt.body.slice(excerpt.quoteAt, excerpt.quoteAt + quoteLength)}
              </mark>
              {excerpt.body.slice(excerpt.quoteAt + quoteLength)}
              {excerpt.tail}
            </>
          ) : (
            <>
              {excerpt.head}
              {excerpt.body}
              {excerpt.tail}
            </>
          )}
        </div>
      )}
    </div>
  );
}
