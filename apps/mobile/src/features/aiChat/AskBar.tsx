import { useAskI18n } from "./askI18n";
// 「今天」页问答条：点按进入新对话，建议问题点按直接带着问题进入并发送。
// 按住麦克风在对话页里说，这里只是入口，避免首页挂上录音会话。

import { Mic, Sparkles } from "lucide-react";
import { useMemo, useRef } from "react";
import { useEdgeFadeX } from "../../hooks/useScrollState";
import { useNavigator } from "../../router";
import { suggestionsFor, suggestionPrompt } from "./suggestions";

export function AskBar() {
  const { t } = useAskI18n();
  const navigator = useNavigator();
  const suggestions = useMemo(() => suggestionsFor(), []);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  useEdgeFadeX(suggestionsRef);
  const open = (prompt?: string) =>
    navigator.push("aiChat", {
      sessionId: crypto.randomUUID(),
      isNew: "1",
      ...(prompt ? { prompt } : {}),
    });
  return (
    <div className="px-4 pt-4">
      <button
        type="button"
        onClick={() => open()}
        className="bg-surface shadow-card flex h-12 w-full items-center gap-2.5 rounded-2xl pr-2 pl-3.5 text-left transition-transform active:scale-[0.99]"
      >
        <Sparkles size={18} className="text-accent shrink-0" aria-hidden="true" />
        <span className="text-ink-3 text-tau-body flex-1">{t("placeholder")}</span>
        <span className="bg-page text-ink-1 grid h-[34px] w-[34px] place-items-center rounded-[11px]">
          <Mic size={17} aria-hidden="true" />
        </span>
      </button>
      <div
        ref={suggestionsRef}
        className="edge-fade-x-scroll scrollbar-hide mt-2.5 flex gap-2 overflow-x-auto"
      >
        {suggestions.map(key => (
          <button
            key={key}
            type="button"
            onClick={() => open(suggestionPrompt(key))}
            className="bg-surface text-ink-2 text-tau-sm h-[30px] shrink-0 rounded-full px-3 transition-transform active:scale-95"
          >
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}
