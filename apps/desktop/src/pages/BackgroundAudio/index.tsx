import React, { useEffect, useRef } from "react";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import { BACKGROUND_SOUND_FILES } from "@/constants/backgroundSounds";
import useInitDatabase from "@/hooks/useInitDatabase";

/**
 * 背景音播放页面
 * 这是一个隐藏窗口中运行的页面，专门负责播放番茄钟背景音
 */
const BackgroundAudio: React.FC = () => {
  useInitDatabase();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { activeSession, backgroundSound, backgroundVolume, initPomodoro } =
    usePomodoroStore();

  // 初始化
  useEffect(() => {
    initPomodoro();
  }, [initPomodoro]);

  // 初始化音频元素
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = true;
    audioRef.current.volume = backgroundVolume / 100;

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  // 更新音量
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = backgroundVolume / 100;
    }
  }, [backgroundVolume]);

  // 根据背景音选择切换音频源
  useEffect(() => {
    if (!audioRef.current) return;

    if (backgroundSound && BACKGROUND_SOUND_FILES[backgroundSound]) {
      const newSrc = BACKGROUND_SOUND_FILES[backgroundSound];
      const currentSrc = audioRef.current.src;

      // 只有当源改变时才重新加载
      if (!currentSrc.endsWith(newSrc)) {
        const wasPlaying =
          !audioRef.current.paused && audioRef.current.currentTime > 0;
        audioRef.current.src = newSrc;
        audioRef.current.load();

        // 如果之前在播放且有活动会话且正在运行，切换后继续播放
        if (wasPlaying && activeSession?.status === "running") {
          audioRef.current.play().catch((err) => {
            console.warn("Background sound play failed:", err);
          });
        }
      }
    } else {
      // 无背景音时停止播放
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [backgroundSound, activeSession?.status]);

  // 根据番茄钟状态控制播放/暂停
  useEffect(() => {
    if (!audioRef.current || !backgroundSound) return;

    if (activeSession) {
      if (activeSession.status === "running") {
        // 正在运行时播放
        audioRef.current.play().catch((err) => {
          console.warn("Background sound play failed:", err);
        });
      } else if (activeSession.status === "paused") {
        // 暂停时暂停
        audioRef.current.pause();
      }
    } else {
      // 没有活动会话时停止并重置
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [activeSession, backgroundSound]);

  // 这个页面不需要显示任何内容
  return null;
};

export default BackgroundAudio;
