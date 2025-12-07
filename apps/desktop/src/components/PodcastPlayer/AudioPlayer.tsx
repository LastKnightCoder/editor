import { useMemoizedFn } from "ahooks";
import {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import WaveSurfer from "wavesurfer.js";

type AudioPlayerProps = {
  src: string;
  waveColor?: string;
  progressColor?: string;
  cursorColor?: string;
  barWidth?: number;
  barRadius?: number;
  barGap?: number;
  height?: number;
  className?: string;
};

export type AudioPlayerRef = {
  toggleMute: (muted: boolean, volume: number) => void;
  togglePlay: () => void;
  downloadAudio: () => void;
  setPlaybackSpeed: (speed: number) => void;
};

const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  (
    {
      src,
      waveColor = "#a3aed0",
      progressColor = "#3311db",
      cursorColor = "#6666ff",
      barWidth = 2,
      barRadius = 2,
      barGap = 1,
      height = 100,
      className = "",
    },
    ref,
  ) => {
    const waveformRef = useRef<HTMLDivElement | null>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);

    const [currentTime, setCurrentTime] = useState<string>("0:00");
    const [duration, setDuration] = useState<string>("0:00");

    const handleInit = useMemoizedFn((src: string) => {
      if (!waveformRef.current) return;
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor,
        progressColor,
        cursorColor,
        barWidth,
        barGap,
        barRadius,
        height,
        normalize: true,
        audioRate: 1,
      });

      wavesurfer.current.load(src);

      wavesurfer.current.on("ready", () => {
        setDuration(formatTime(wavesurfer.current?.getDuration() || 0));
      });

      wavesurfer.current.on("audioprocess", () => {
        setCurrentTime(formatTime(wavesurfer.current?.getCurrentTime() || 0));
      });
    });

    useEffect(() => {
      handleInit(src);

      return () => {
        wavesurfer.current?.destroy();
      };
    }, [handleInit, src]);

    useImperativeHandle(ref, () => ({
      toggleMute: (muted: boolean, volume: number) => {
        toggleMute(muted, volume);
      },
      togglePlay: () => {
        togglePlay();
      },
      downloadAudio: () => {
        handleDownloadAudio();
      },
      setPlaybackSpeed: (speed: number) => {
        if (wavesurfer.current) {
          wavesurfer.current.setPlaybackRate(speed);
        }
      },
    }));

    const togglePlay = () => {
      if (wavesurfer.current) {
        wavesurfer.current.playPause();
      }
    };

    const toggleMute = (muted: boolean, volume: number) => {
      if (wavesurfer.current) {
        wavesurfer.current.setVolume(muted ? 0 : volume);
      }
    };

    const formatTime = (seconds: number) => {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
    };

    const handleDownloadAudio = async () => {
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "audio.mp3";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.log(error);
      }
    };

    return (
      <div
        className={`flex w-full flex-col items-center rounded-lg p-4 ${className}`}
      >
        <div className="flex w-full justify-between text-sm text-gray-400">
          <span>{currentTime}</span>
          <span>{duration}</span>
        </div>

        <div ref={waveformRef} className="my-2 w-full " />
      </div>
    );
  },
);

export default AudioPlayer;
