/**
 * 首页「探究中的问题」：最近有进展的问题在前。第三期改由问题插件注册（PS-046）。
 */

import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { EmptyNote, Panel, PanelAction, PanelNote, PanelTitle } from "@tau/ui";
import type { ActiveQuestionPreview } from "@/types";
import { Composition, GroupDot, StatusRing } from "@/features/questions/components/QuestionBits";
import { describeEvent, relativeDay } from "@/features/questions/model";
import { useHomeSnapshot } from "../../queries";

export function QuestionsPanel() {
  const { data } = useHomeSnapshot();
  const { navigator } = usePage();
  if (!data) return null;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-1.5">
        探究中的问题
        <PanelNote>{data.activeQuestions.length ? "最近有进展的在前" : ""}</PanelNote>
        <PanelAction onClick={() => navigator.push("questions")} title="前往问题">
          前往问题
          <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
      </PanelTitle>
      {data.activeQuestions.length > 0 ? (
        // 只有 1 条时占满整行，避免右半张卡留空
        <div
          className={clsx(
            "grid gap-x-6",
            data.activeQuestions.length > 1 ? "@max-[860px]:grid-cols-1 grid-cols-2" : "grid-cols-1"
          )}
        >
          {data.activeQuestions.map(question => (
            <QuestionRow
              key={question.id}
              question={question}
              onClick={() => navigator.push("questions", { selectedId: question.id })}
            />
          ))}
        </div>
      ) : (
        <EmptyNote>没有正在探究的问题——学习时冒出的疑问，按 Ctrl+K 输入「问题:」记下来</EmptyNote>
      )}
    </Panel>
  );
}

function QuestionRow({
  question,
  onClick,
}: {
  question: ActiveQuestionPreview;
  onClick: () => void;
}) {
  const now = Date.now();
  const progress = question.lastEvent ? describeEvent(question.lastEvent) : null;
  const progressText = progress
    ? progress.tone === "note"
      ? progress.text
      : [
          progress.verb,
          question.lastEventTitle && progress.tone !== "start"
            ? `「${question.lastEventTitle}」`
            : "",
        ].join("")
    : "";
  return (
    <button
      type="button"
      className="rounded-tau-sm ease-tau-out hover:bg-hover flex w-full items-start gap-2.5 px-2.5 py-[9px] text-left transition-[background] duration-[160ms]"
      onClick={onClick}
    >
      <StatusRing status={question.status} className="mt-[3px]" />
      <span className="min-w-0 flex-1">
        <b className="text-tau-meta block truncate font-medium">{question.questionContent}</b>
        <span className="text-ink-3 mt-0.5 flex min-w-0 items-center gap-2.5 text-[11px]">
          <span className="inline-flex shrink-0 items-center gap-[5px]">
            <GroupDot color={question.groupColor} />
            {question.groupTitle}
          </span>
          <Composition counts={question.linkCounts} className="shrink-0" />
          <span className="min-w-0 truncate">
            {relativeDay(question.lastActivityTime, now)}
            {progressText ? ` · ${progressText}` : ""}
          </span>
        </span>
      </span>
    </button>
  );
}
