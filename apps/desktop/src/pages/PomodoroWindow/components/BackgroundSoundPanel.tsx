import React from "react";
import { Popover, Slider } from "antd";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import { BACKGROUND_SOUND_OPTIONS } from "@/constants/backgroundSounds";
import { HiOutlineVolumeUp } from "react-icons/hi";
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
    <div className="w-64 p-1">
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-2.5 tracking-wide">
        背景音
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BACKGROUND_SOUND_OPTIONS.map((option) => (
          <button
            key={option.value || "none"}
            className={classNames(
              "px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer",
              backgroundSound === option.value
                ? "bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900"
                : "bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/[0.12]",
            )}
            onClick={() => setBackgroundSound(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {backgroundSound && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-1">
            <HiOutlineVolumeUp className="text-sm" />
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
