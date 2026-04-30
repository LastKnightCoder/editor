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
      <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-gray-900 dark:bg-gray-100 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${stageProgress}%` }}
        />
      </div>

      <details open className="mt-4">
        <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-zinc-400 select-none">
          详细日志
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto space-y-0.5 p-3 rounded-lg bg-gray-50 dark:bg-zinc-800/60 border border-gray-100 dark:border-zinc-700/50">
          {logs.map((log, index) => (
            <div
              key={index}
              className="text-xs font-mono text-gray-600 dark:text-zinc-300 leading-relaxed"
            >
              {log}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};

export default ProgressView;
