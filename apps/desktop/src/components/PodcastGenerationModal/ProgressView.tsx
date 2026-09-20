import { SectionTitle } from "./ui";
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
  return (
    <div className="space-y-4">
      <SectionTitle>
        {stageNames[stage] || stage}
        {stage === "tts" && ` (${ttsCompleted}/${ttsTotal})`}
      </SectionTitle>
      <div className="bg-track h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-accent ease-tau-out h-full rounded-full transition-all duration-300"
          style={{ width: `${stageProgress}%` }}
        />
      </div>

      <details open className="mt-4">
        <summary className="text-ink-3 text-tau-sm cursor-pointer select-none font-medium">
          详细日志
        </summary>
        <div className="border-line-1 rounded-tau-md mt-2 max-h-64 space-y-0.5 overflow-y-auto border p-3">
          {logs.map((log, index) => (
            <div key={index} className="text-ink-2 font-tau-mono text-tau-sm leading-relaxed">
              {log}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};

export default ProgressView;
