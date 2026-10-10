import { AudioLines, Upload, Link, Mic } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";

export default function AudioTool({ run }: WhiteboardToolProps) {
  return (
    <ToolMenu
      label="音频"
      icon={<AudioLines strokeWidth={1.75} />}
      items={[
        { key: "local", label: "本地上传", icon: Upload, onSelect: () => run("local") },
        { key: "url", label: "网络地址", icon: Link, onSelect: () => run("url") },
        { key: "tts", label: "文本转语音", icon: Mic, onSelect: () => run("tts") },
      ]}
    />
  );
}
