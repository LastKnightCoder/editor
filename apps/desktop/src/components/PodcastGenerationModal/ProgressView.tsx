import { Spinner } from "@tau/ui";
import { LogPanel } from "./ui";
import { stageNames } from "./utils";

export interface ProgressViewProps {
  stage: string;
  stageProgress: number;
  ttsCompleted: number;
  ttsTotal: number;
  logs: string[];
}

export const ProgressView = ({
  stage,
  stageProgress,
  ttsCompleted,
  ttsTotal,
  logs,
}: ProgressViewProps) => {
  const percent = Math.max(0, Math.min(100, Math.round(stageProgress)));

  return (
    <div className="flex flex-col gap-5 pt-1">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Spinner className="size-3.5" />
          <span className="text-ink-1 text-tau-body font-semibold">
            {stageNames[stage] || stage}
          </span>
          {stage === "tts" && (
            <span className="text-ink-3 text-tau-meta tabular-nums">
              {ttsCompleted}/{ttsTotal} 段
            </span>
          )}
          <span className="flex-1" />
          <span className="text-ink-3 text-tau-meta tabular-nums">{percent}%</span>
        </div>
        <div className="bg-hover h-1 w-full overflow-hidden rounded-full">
          <div
            className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-300"
            style={{ width: `${stageProgress}%` }}
          />
        </div>
      </div>

      <LogPanel logs={logs} />
    </div>
  );
};

export default ProgressView;
