import type { Flashcard } from "@/types";
import { Button } from "@tau/ui";
import { Check } from "lucide-react";

/** 需要提交的题型（多选 / 填空 / 问答）的作答按钮；单选 / 判断选即提交，不渲染 */
export function AnswerActions({ card, onSubmit }: { card: Flashcard; onSubmit(): void }) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      {card.type !== "qa" && (
        <Button variant="ghost" onClick={onSubmit}>
          不会，看答案
        </Button>
      )}
      <Button variant="primary" icon={card.type === "qa" ? undefined : Check} onClick={onSubmit}>
        {card.type === "qa" ? "显示答案" : "提交"}
        <kbd className="ml-1 rounded-[5px] bg-white/20 px-1.5 font-mono text-[11px] leading-[18px]">
          {card.type === "qa" ? "Space" : "↵"}
        </kbd>
      </Button>
    </div>
  );
}
