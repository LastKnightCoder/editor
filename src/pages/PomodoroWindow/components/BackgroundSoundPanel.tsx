import React from "react";
import { Popover, Slider } from "antd";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import { BACKGROUND_SOUND_OPTIONS } from "@/constants/backgroundSounds";
import {
  HiOutlineVolumeUp,
  HiOutlineVolumeOff,
  HiMusicNote,
} from "react-icons/hi";
import classNames from "classnames";

interface BackgroundSoundPanelProps {
  children: React.ReactNode;
}

const BackgroundSoundPanel: React.FC<BackgroundSoundPanelProps> = ({
  children,
}) => {
  const {
    backgroundSound,
    backgroundVolume,
    setBackgroundSound,
    setBackgroundVolume,
  } = usePomodoroStore();

  const content = (
    <div className="w-64 p-2">
      <div className="mb-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          选择背景音
        </div>
        <div className="grid grid-cols-3 gap-2">
          {BACKGROUND_SOUND_OPTIONS.map((option) => (
            <div
              key={option.value || "none"}
              className={classNames(
                "flex flex-col items-center justify-center p-2 rounded cursor-pointer transition-all",
                {
                  "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400":
                    backgroundSound === option.value,
                  "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400":
                    backgroundSound !== option.value,
                },
              )}
              onClick={() => setBackgroundSound(option.value)}
            >
              {option.value === null ? (
                <HiOutlineVolumeOff className="text-xl mb-1" />
              ) : (
                <HiMusicNote className="text-xl mb-1" />
              )}
              <span className="text-xs text-center">{option.label}</span>
            </div>
          ))}
        </div>
      </div>

      {backgroundSound && (
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
            <HiOutlineVolumeUp className="text-base" />
            <span>音量</span>
          </div>
          <Slider
            min={0}
            max={100}
            value={backgroundVolume}
            onChange={setBackgroundVolume}
            tooltip={{ formatter: (value) => `${value}%` }}
          />
        </div>
      )}
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="top">
      {children}
    </Popover>
  );
};

export default BackgroundSoundPanel;
