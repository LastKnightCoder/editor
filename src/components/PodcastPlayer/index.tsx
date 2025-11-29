import useLocalPath from "@/hooks/useLocalPath";
import { LoadingOutlined, MoreOutlined } from "@ant-design/icons";
import { useMemo, useRef, useState } from "react";
import AudioPlayer, { AudioPlayerRef } from "./AudioPlayer";
import { Dropdown, MenuProps, App } from "antd";
import { IPodcast } from "@/types/podcast";
import type { PodcastScriptLine } from "@/types/minimax";
import useTheme from "@/hooks/useTheme";
import { BsFillVolumeMuteFill, BsFillVolumeUpFill } from "react-icons/bs";
import { AiOutlinePauseCircle, AiOutlinePlayCircle } from "react-icons/ai";
import classNames from "classnames";
import CustomModal from "@/components/CustomModal";

interface PodCastPlayerProps {
  defaultPodcast: IPodcast;
  onDelete?: () => void;
  onEdit?: () => void;
}

const playbackSpeeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const PodCastPlayer = (props: PodCastPlayerProps) => {
  const { defaultPodcast, onDelete, onEdit } = props;
  const podcast = defaultPodcast;
  const { localPath, loading } = useLocalPath(podcast.audioUrl);
  const [scriptDetailOpen, setScriptDetailOpen] = useState(false);
  const { isDark } = useTheme();
  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  const [playing, setPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(false);
  const [showWaveform, setShowWaveform] = useState<boolean>(false);
  const { modal } = App.useApp();
  const menuItems = useMemo(
    () =>
      [
        {
          key: "editPodcast",
          label: "编辑播客",
          onClick: () => {
            onEdit?.();
          },
        },
        {
          key: "script",
          label: "脚本详情",
          onClick: () => {
            setScriptDetailOpen(true);
          },
        },
        {
          key: "waveform",
          label: showWaveform ? "隐藏波形" : "显示波形",
          onClick: () => {
            setShowWaveform(!showWaveform);
          },
        },
        {
          key: "playbackSpeed",
          label: "播放速度",
          children: playbackSpeeds.map((speed) => ({
            key: speed,
            label: `${speed.toFixed(2)}x`,
          })),
          onClick: (e) => {
            if (audioPlayerRef.current) {
              audioPlayerRef.current.setPlaybackSpeed(Number(e.key));
            }
          },
        },
        {
          key: "download",
          label: "下载音频",
          onClick: () => {
            audioPlayerRef.current?.downloadAudio();
          },
        },
        {
          key: "delete",
          label: "删除播客",
          onClick: () => {
            modal.confirm({
              title: "删除播客",
              content: "确定要删除该播客吗？",
              okButtonProps: {
                danger: true,
              },
              onOk: () => {
                onDelete?.();
              },
            });
          },
        },
      ] as MenuProps["items"],
    [onDelete, showWaveform, modal, onEdit],
  );

  const toggleMute = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.toggleMute(muted, volume);
      setMuted(!muted);
    }
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    if (audioPlayerRef.current) {
      if (muted) {
        setMuted(false);
      }
      audioPlayerRef.current.toggleMute(muted, newVolume);
      setVolume(newVolume);
    }
  };

  const togglePlay = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.togglePlay();
      setPlaying(!playing);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <LoadingOutlined spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border border-[#f0f0f0] dark:border-[#202020] rounded-md p-5 mb-8 relative">
      <div className="flex justify-between items-center px-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={togglePlay}
            className={`flex items-center justify-center rounded-full cursor-pointer`}
            style={{ color: isDark ? "#6666ff" : "#3311db" }}
          >
            {playing ? (
              <AiOutlinePauseCircle className="h-7 w-7 " />
            ) : (
              <AiOutlinePlayCircle className="h-7 w-7 " />
            )}
          </button>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-base font-medium">
                {podcast.name || "未命名播客"}
              </div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {podcast.speakers.map((speaker) => speaker.name).join(", ")}
            </div>
          </div>
        </div>
        <Dropdown menu={{ items: menuItems }}>
          <MoreOutlined className="cursor-pointer" />
        </Dropdown>
      </div>
      <div className="flex items-center gap-2 px-4 mb-4">
        <button
          onClick={toggleMute}
          style={{ color: isDark ? "#6666ff" : "#3311db" }}
        >
          {muted || volume === 0 ? (
            <BsFillVolumeMuteFill className="h-7 w-7 " />
          ) : (
            <BsFillVolumeUpFill className="h-7 w-7 " />
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          onChange={handleVolume}
          style={{
            accentColor: isDark ? "#6666ff" : "#3311db",
            height: "2px",
            borderRadius: "10px",
            width: "100%",
          }}
          className="w-24 cursor-pointer"
        />
      </div>
      <AudioPlayer
        ref={audioPlayerRef}
        src={localPath}
        height={80}
        className={classNames({ hidden: !showWaveform })}
      />
      <CustomModal
        open={scriptDetailOpen}
        onCancel={() => setScriptDetailOpen(false)}
        footer={null}
        title="脚本详情"
        width={800}
        contentClassName="p-0"
      >
        <div
          style={{
            maxHeight: "calc(100vh - 200px)",
            height: 600,
            overflow: "hidden",
          }}
        >
          <div className="overflow-y-auto flex flex-col gap-3 p-4 rounded whitespace-pre-wrap max-h-full">
            {podcast.scriptLines && podcast.scriptLines.length > 0 ? (
              <div className="flex flex-col gap-4">
                {podcast.scriptLines.map(
                  (line: PodcastScriptLine, index: number) => (
                    <div key={index} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-600">
                          {line.speaker}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTime(line.startTime)}
                        </span>
                      </div>
                      <div className="text-gray-800">{line.text}</div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              podcast.script
                .split("\n")
                .map((line, index) => <div key={index}>{line}</div>)
            )}
          </div>
        </div>
      </CustomModal>
    </div>
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default PodCastPlayer;
