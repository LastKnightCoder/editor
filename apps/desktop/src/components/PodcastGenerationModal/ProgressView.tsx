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
      <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${stageProgress}%` }}
        />
      </div>

      <details open className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-slate-200 flex items-center justify-between">
          详细日志
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto space-y-1 bg-gray-50 dark:bg-zinc-800/60 p-2 rounded">
          {logs.map((log, index) => (
            <div
              key={index}
              className="text-sm text-gray-700 dark:text-slate-200"
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
