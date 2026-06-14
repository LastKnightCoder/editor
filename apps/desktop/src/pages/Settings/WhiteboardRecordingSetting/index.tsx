import { useState } from "react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import { selectFile } from "@/commands";
import useSettingStore, {
  type WhiteboardRecordingOutputFormat,
} from "@/stores/useSettingStore";
import {
  SettingButton,
  SettingContainer,
  SettingInput,
  SettingSection,
  SettingSelect,
  SettingSwitch,
} from "../components";

const outputFormatOptions: Array<{
  label: string;
  value: WhiteboardRecordingOutputFormat;
}> = [
  { label: "WebM（浏览器原生）", value: "webm" },
  { label: "MP4（ffmpeg 转码）", value: "mp4" },
  { label: "MOV（ffmpeg 转码）", value: "mov" },
  { label: "MKV（ffmpeg 转码）", value: "mkv" },
];

const WhiteboardRecordingSetting = () => {
  const setting = useSettingStore((state) => state.setting.whiteboardRecording);
  const [error, setError] = useState("");

  const updateSetting = useMemoizedFn(
    <K extends keyof typeof setting>(key: K, value: (typeof setting)[K]) => {
      useSettingStore.setState(
        produce((state) => {
          state.setting.whiteboardRecording[key] = value;
        }),
      );
    },
  );

  const handleSelectSaveDirectory = useMemoizedFn(async () => {
    setError("");
    try {
      const paths = await selectFile({
        properties: ["openDirectory", "createDirectory"],
      });
      if (!paths || paths.length === 0) {
        return;
      }
      updateSetting("saveDirectory", paths[0]);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "User canceled file selection"
      ) {
        return;
      }
      setError(
        `选择保存目录失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  return (
    <SettingContainer>
      <SettingSection
        title="白板录制"
        description="用于演示模式的屏幕录制、麦克风和摄像头画中画。录制控制会显示在独立浮窗中，不会进入成片。"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-slate-700 dark:bg-zinc-900/60">
            <SettingSwitch
              label="进入演示后自动开始录制"
              description="默认关闭，避免进入演示时立即触发系统权限请求。"
              checked={setting.autoStartRecording}
              onChange={(checked) =>
                updateSetting("autoStartRecording", checked)
              }
            />
            <SettingSwitch
              label="默认录制麦克风"
              description="开启后开始录制时会请求麦克风权限，用于保存讲解声音。"
              checked={setting.microphoneEnabledByDefault}
              onChange={(checked) =>
                updateSetting("microphoneEnabledByDefault", checked)
              }
            />
            <SettingSwitch
              label="默认开启摄像头画中画"
              description="开启后开始录制时请求摄像头权限，并在白板右下角显示圆形预览。"
              checked={setting.cameraEnabledByDefault}
              onChange={(checked) =>
                updateSetting("cameraEnabledByDefault", checked)
              }
            />
          </div>

          <SettingSelect
            label="导出格式"
            value={setting.outputFormat}
            options={outputFormatOptions}
            onChange={(value) =>
              updateSetting(
                "outputFormat",
                value as WhiteboardRecordingOutputFormat,
              )
            }
          />

          <div className="space-y-3">
            <SettingInput
              label="默认保存地址"
              placeholder="留空则保存到系统视频目录下的 Tau Whiteboard 文件夹"
              value={setting.saveDirectory}
              onChange={(event) =>
                updateSetting("saveDirectory", event.target.value)
              }
              description="WebM 会直接保存；MKV 优先无损拷贝；MP4、MOV 会优先尝试硬件编码，失败后自动回退。"
            />
            <div className="flex flex-wrap gap-3">
              <SettingButton
                variant="secondary"
                onClick={handleSelectSaveDirectory}
              >
                选择文件夹
              </SettingButton>
              {setting.saveDirectory && (
                <SettingButton
                  variant="secondary"
                  onClick={() => updateSetting("saveDirectory", "")}
                >
                  使用默认目录
                </SettingButton>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </SettingSection>
    </SettingContainer>
  );
};

export default WhiteboardRecordingSetting;
