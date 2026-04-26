import { useCallback, useRef, useState } from "react";
import classNames from "classnames";
import { Volume2, FileText, RefreshCw, Pause } from "lucide-react";
import {
  Button,
  SectionTitle,
  TextArea,
  TextStrong,
  TextSecondary,
} from "./ui";
import { formatTime } from "./utils";
import type { PodcastScriptLine } from "@/types/podcast";
import { extractPodcastSegment } from "@/commands/podcast-audio";
import { remoteResourceToLocal } from "@/utils/resouce";
import { getHomeDir, readBinaryFile } from "@/commands/file";

export interface ResultPreviewProps {
  audioUrl: string;
  duration: number;
  scriptLines: PodcastScriptLine[];
  segmentAudios: Blob[];
  regenerateSegment: (index: number, newText: string) => Promise<void>;
  notify: (
    type: "success" | "error" | "warning" | "info",
    text: string,
  ) => void;
}

export const ResultPreview = ({
  audioUrl,
  duration,
  scriptLines,
  segmentAudios,
  regenerateSegment,
  notify,
}: ResultPreviewProps) => {
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(
    null,
  );
  const [editingSegmentText, setEditingSegmentText] = useState<string>("");
  const [regeneratingSegmentIndex, setRegeneratingSegmentIndex] = useState<
    number | null
  >(null);
  const [extractingAudioIndex, setExtractingAudioIndex] = useState<
    number | null
  >(null);
  const [playingSegmentIndex, setPlayingSegmentIndex] = useState<number | null>(
    null,
  );
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleStartEditSegment = useCallback(
    (index: number, currentText: string) => {
      setEditingSegmentIndex(index);
      setEditingSegmentText(currentText);
    },
    [],
  );

  const handleCancelEditSegment = useCallback(() => {
    setEditingSegmentIndex(null);
    setEditingSegmentText("");
  }, []);

  const handleConfirmEditSegment = useCallback(async () => {
    if (editingSegmentIndex === null) return;

    const newText = editingSegmentText.trim();
    if (!newText) {
      notify("error", "文本不能为空");
      return;
    }

    const oldText = scriptLines[editingSegmentIndex].text;
    if (newText === oldText) {
      notify("info", "文本未改变");
      handleCancelEditSegment();
      return;
    }

    setRegeneratingSegmentIndex(editingSegmentIndex);
    setEditingSegmentIndex(null);
    setEditingSegmentText("");

    try {
      await regenerateSegment(editingSegmentIndex, newText);
    } finally {
      setRegeneratingSegmentIndex(null);
    }
  }, [
    editingSegmentIndex,
    editingSegmentText,
    notify,
    scriptLines,
    regenerateSegment,
    handleCancelEditSegment,
  ]);

  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setPlayingSegmentIndex(null);
  }, []);

  const handlePlaySegment = useCallback(
    async (index: number) => {
      if (playingSegmentIndex === index) {
        stopCurrentAudio();
        return;
      }

      if (currentAudioRef.current) {
        stopCurrentAudio();
      }

      if (segmentAudios[index]) {
        const audio = new Audio(URL.createObjectURL(segmentAudios[index]));
        currentAudioRef.current = audio;
        setPlayingSegmentIndex(index);

        audio.play();

        audio.onended = () => {
          setPlayingSegmentIndex(null);
          currentAudioRef.current = null;
        };

        audio.onerror = () => {
          setPlayingSegmentIndex(null);
          currentAudioRef.current = null;
          notify("error", "音频播放失败");
        };

        return;
      }

      if (!audioUrl) {
        notify("error", "音频不可用");
        return;
      }

      setExtractingAudioIndex(index);
      try {
        let localAudioPath = "";
        if (audioUrl.startsWith("http")) {
          localAudioPath = await remoteResourceToLocal(audioUrl);
        } else if (audioUrl.startsWith("~")) {
          const homeDir = await getHomeDir();
          localAudioPath = `${homeDir}${audioUrl.slice(1)}`;
        } else {
          localAudioPath = audioUrl;
        }

        const { outputPath } = await extractPodcastSegment(
          localAudioPath,
          scriptLines[index].startTime,
          scriptLines[index].duration,
        );

        const audioBuffer = (await readBinaryFile(
          outputPath,
        )) as Uint8Array<ArrayBuffer>;
        const audioBlob = new Blob([audioBuffer.buffer], {
          type: "audio/mpeg",
        });
        const audioBlobUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioBlobUrl);
        currentAudioRef.current = audio;
        setPlayingSegmentIndex(index);

        audio.play();

        audio.onended = () => {
          URL.revokeObjectURL(audioBlobUrl);
          setPlayingSegmentIndex(null);
          currentAudioRef.current = null;
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioBlobUrl);
          setPlayingSegmentIndex(null);
          currentAudioRef.current = null;
          notify("error", "音频播放失败");
        };
      } catch (error) {
        console.error("提取音频片段失败:", error);
        notify("error", "提取音频片段失败");
      } finally {
        setExtractingAudioIndex(null);
      }
    },
    [
      segmentAudios,
      audioUrl,
      notify,
      scriptLines,
      playingSegmentIndex,
      stopCurrentAudio,
    ],
  );

  return (
    <div className="space-y-4">
      <SectionTitle>
        <Volume2 size={16} className="inline-block mr-1" /> 播客音频
      </SectionTitle>
      <audio key={audioUrl} controls className="w-full mb-4" src={audioUrl} />
      <TextSecondary className="text-sm">
        时长: {Math.floor(duration / 60)}:
        {(duration % 60).toString().padStart(2, "0")}
      </TextSecondary>

      <details open className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-slate-200 flex items-center gap-2">
          <FileText size={16} className="inline-block" /> 查看脚本
        </summary>
        <div className="overflow-y-auto flex flex-col gap-3 p-4 rounded max-h-[400px]">
          {scriptLines.map((line, index) => {
            const isEditing = editingSegmentIndex === index;
            const isRegenerating = regeneratingSegmentIndex === index;
            const isExtracting = extractingAudioIndex === index;
            const isPlaying = playingSegmentIndex === index;

            return (
              <div
                key={index}
                className={classNames(
                  "p-3 rounded border transition-colors",
                  isEditing
                    ? "bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30"
                    : isRegenerating
                      ? "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/30"
                      : "bg-gray-50 dark:bg-zinc-800/50 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600",
                )}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <TextStrong>{line.speaker}</TextStrong>
                    <TextSecondary className="text-xs">
                      {formatTime(line.startTime)} -{" "}
                      {formatTime(line.startTime + line.duration)} (
                      {line.duration.toFixed(1)}s)
                    </TextSecondary>
                    {isRegenerating && (
                      <TextSecondary className="text-xs text-yellow-700 dark:text-yellow-400">
                        正在重新生成...
                      </TextSecondary>
                    )}
                  </div>
                  {!isEditing && !isRegenerating && (
                    <div className="flex gap-2">
                      <Button
                        size="small"
                        variant={isPlaying ? "primary" : "text"}
                        icon={
                          isPlaying ? (
                            <Pause size={14} />
                          ) : (
                            <Volume2 size={14} />
                          )
                        }
                        loading={isExtracting}
                        onClick={() => handlePlaySegment(index)}
                      >
                        {isPlaying ? "停止试听" : "试听"}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        icon={<RefreshCw size={14} />}
                        onClick={() => handleStartEditSegment(index, line.text)}
                      >
                        重生成
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <TextArea
                      value={editingSegmentText}
                      onChange={setEditingSegmentText}
                      autoSize={{ minRows: 2, maxRows: 8 }}
                      autoFocus
                      placeholder="请输入文本内容"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="small" onClick={handleCancelEditSegment}>
                        取消
                      </Button>
                      <Button
                        size="small"
                        variant="primary"
                        onClick={handleConfirmEditSegment}
                        disabled={!editingSegmentText.trim()}
                      >
                        确定并重新生成
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-700 dark:text-slate-200 whitespace-pre-wrap">
                    {line.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
};

export default ResultPreview;
