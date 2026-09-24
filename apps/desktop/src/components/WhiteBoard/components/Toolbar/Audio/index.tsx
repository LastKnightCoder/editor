import { useRef, useState } from "react";
import { App, Popover, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import { Upload, Link, Mic } from "lucide-react";
import RemoteAudioSelectModal from "@/components/RemoteAudioSelectModal";
import TTSGenerateModal from "@/components/TTSGenerateModal";
import ToolbarMenu, { ToolbarMenuItem } from "../ToolbarMenu";

import { useBoard } from "../../../hooks";
import { AudioUtil } from "../../../utils";

interface AudioProps {
  className?: string;
  style?: React.CSSProperties;
}

const Audio = (props: AudioProps) => {
  const { className, style } = props;
  const board = useBoard();

  const audioInputRef = useRef<HTMLInputElement>(null);
  const { message } = App.useApp();

  const handleAddAudio = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      message.loading({
        key: "uploading-audio",
        content: "正在处理音频，请稍候...",
        duration: 0,
      });
      await AudioUtil.insertAudio(file, board);
      message.destroy("uploading-audio");
    }
    event.target.value = "";
  });

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [ttsModalOpen, setTTSModalOpen] = useState(false);

  const handleRemoteConfirm = useMemoizedFn(async (url: string) => {
    try {
      await AudioUtil.insertAudioFromUrl(url, board);
      setRemoteModalOpen(false);
      setPopoverOpen(false);
    } catch (error) {
      console.error("添加远程音频失败:", error);
      message.error("添加远程音频失败");
    }
  });

  const handleTTSConfirm = useMemoizedFn(async (audioBlob: Blob, text: string) => {
    try {
      message.loading({
        key: "uploading-tts-audio",
        content: "正在保存音频...",
        duration: 0,
      });
      await AudioUtil.insertAudioFromTTS(audioBlob, text, board);
      setTTSModalOpen(false);
      setPopoverOpen(false);
      message.success("音频添加成功");
    } catch (error) {
      console.error("添加 TTS 音频失败:", error);
      message.error("添加音频失败");
    } finally {
      message.destroy("uploading-tts-audio");
    }
  });

  const menuItems: ToolbarMenuItem[] = [
    {
      key: "local",
      label: "本地上传",
      icon: <Upload size={16} />,
      description: "选择本地音频文件",
      onSelect: () => {
        setPopoverOpen(false);
        audioInputRef.current?.click();
      },
    },
    {
      key: "url",
      label: "网络地址",
      icon: <Link size={16} />,
      description: "输入音频直链地址",
      onSelect: () => {
        setPopoverOpen(false);
        setRemoteModalOpen(true);
      },
    },
    {
      key: "tts",
      label: "文本转语音",
      icon: <Mic size={16} />,
      description: "输入文字生成语音",
      onSelect: () => {
        setPopoverOpen(false);
        setTTSModalOpen(true);
      },
    },
  ];

  return (
    <>
      <Tooltip title="音频">
        <Popover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          trigger={"click"}
          arrow={false}
          placement="bottom"
          content={<ToolbarMenu items={menuItems} />}
          styles={{
            container: {
              background: "transparent",
              boxShadow: "none",
              padding: 0,
            },
          }}
        >
          <div className={className} style={style} onClick={() => setPopoverOpen(true)}>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={handleAddAudio}
            />
            <Mic size={18} />
          </div>
        </Popover>
      </Tooltip>
      <RemoteAudioSelectModal
        open={remoteModalOpen}
        onCancel={() => setRemoteModalOpen(false)}
        onConfirm={handleRemoteConfirm}
      />
      <TTSGenerateModal
        open={ttsModalOpen}
        onCancel={() => setTTSModalOpen(false)}
        onConfirm={handleTTSConfirm}
      />
    </>
  );
};

export default Audio;
