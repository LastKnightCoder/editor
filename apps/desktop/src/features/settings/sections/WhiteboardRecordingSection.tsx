/**
 * 白板录制 —— 演示模式录制的默认行为与导出（mockups/settings/index.html 第三版「白板录制」）。
 *
 * 移植 legacy WhiteboardRecordingSetting 全量：三个录制默认开关、导出格式、默认保存目录
 * （选择文件夹走同一个 selectFile 命令，有值时可恢复默认）。保存位置不再提供手填输入框，
 * 只通过系统文件夹选择器设置；选择失败由 legacy 的内联红框改为 toast。
 */

import { produce } from "immer";
import { FolderOpen } from "lucide-react";
import { Button, Select, Switch, toast } from "@tau/ui";
import { selectFile } from "@/commands";
import useSettingStore, {
  type ISetting,
  type WhiteboardRecordingOutputFormat,
} from "@/stores/useSettingStore";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";

type RecordingSetting = ISetting["whiteboardRecording"];

const OUTPUT_FORMAT_OPTIONS: Array<{ value: WhiteboardRecordingOutputFormat; label: string }> = [
  { value: "webm", label: "WebM" },
  { value: "mp4", label: "MP4" },
  { value: "mov", label: "MOV" },
  { value: "mkv", label: "MKV" },
];

export function WhiteboardRecordingSection() {
  const recording = useSettingStore(s => s.setting.whiteboardRecording);

  const update = <K extends keyof RecordingSetting>(key: K, value: RecordingSetting[K]) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.whiteboardRecording[key] = value;
      }),
    }));
  };

  const selectSaveDirectory = async () => {
    try {
      const paths = await selectFile({ properties: ["openDirectory", "createDirectory"] });
      if (!paths || paths.length === 0) return;
      update("saveDirectory", paths[0]);
    } catch (err) {
      if (err instanceof Error && err.message === "User canceled file selection") return;
      toast.error(`选择保存目录失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <>
      <SettingsGroup title="录制默认值" description="录制控制显示在独立浮窗中，不会进入成片">
        <SettingRow
          title="进入演示后自动开始录制"
          description="默认关闭，避免进入演示时立即触发系统权限请求"
        >
          <Switch
            aria-label="进入演示后自动开始录制"
            checked={recording.autoStartRecording}
            onCheckedChange={checked => update("autoStartRecording", checked)}
          />
        </SettingRow>
        <SettingRow title="默认录制麦克风" description="开始录制时请求麦克风权限，用于保存讲解声音">
          <Switch
            aria-label="默认录制麦克风"
            checked={recording.microphoneEnabledByDefault}
            onCheckedChange={checked => update("microphoneEnabledByDefault", checked)}
          />
        </SettingRow>
        <SettingRow
          title="默认开启摄像头画中画"
          description="开始录制时请求摄像头权限，并在白板右下角显示圆形预览"
        >
          <Switch
            aria-label="默认开启摄像头画中画"
            checked={recording.cameraEnabledByDefault}
            onCheckedChange={checked => update("cameraEnabledByDefault", checked)}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="导出">
        <SettingRow title="导出格式">
          <Select
            aria-label="导出格式"
            className="w-[150px]"
            value={recording.outputFormat}
            options={OUTPUT_FORMAT_OPTIONS}
            onValueChange={value => update("outputFormat", value)}
          />
        </SettingRow>
        <SettingRow
          title="保存位置"
          description={
            recording.saveDirectory ? (
              <span className="font-tau-mono break-all">{recording.saveDirectory}</span>
            ) : (
              "未设置时使用默认目录（系统视频目录下的 Tau Whiteboard 文件夹）"
            )
          }
        >
          {recording.saveDirectory && (
            <Button variant="ghost" size="sm" onClick={() => update("saveDirectory", "")}>
              恢复默认
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={FolderOpen}
            onClick={() => void selectSaveDirectory()}
          >
            选择文件夹
          </Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
