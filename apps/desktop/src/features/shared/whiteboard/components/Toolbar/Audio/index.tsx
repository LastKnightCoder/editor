import { useRef, useState } from "react";
import { toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import { Upload, Link, Mic, AudioLines } from "lucide-react";
import RemoteAudioSelectModal from "@/components/RemoteAudioSelectModal";
import TTSGenerateModal from "@/components/TTSGenerateModal";
import { ToolMenu, type ToolMenuItem } from "@tau/whiteboard";

import { useBoard } from "@tau/whiteboard";
import { AudioUtil } from "@tau/whiteboard";

const Audio = () => {
  const board = useBoard();

  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleAddAudio = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const t = toast.loading("正在处理音频，请稍候…");
      try {
        await AudioUtil.insertAudio(file, board);
      } finally {
        toast.dismiss(t);
      }
    }
    event.target.value = "";
  });

  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [ttsModalOpen, setTTSModalOpen] = useState(false);

  const handleRemoteConfirm = useMemoizedFn(async (url: string) => {
    try {
      await AudioUtil.insertAudioFromUrl(url, board);
      setRemoteModalOpen(false);
    } catch (error) {
      console.error("添加远程音频失败:", error);
      toast.error("添加远程音频失败");
    }
  });

  const handleTTSConfirm = useMemoizedFn(async (audioBlob: Blob, text: string) => {
    const t = toast.loading("正在保存音频…");
    try {
      await AudioUtil.insertAudioFromTTS(audioBlob, text, board);
      setTTSModalOpen(false);
      toast.success("音频添加成功");
    } catch (error) {
      console.error("添加 TTS 音频失败:", error);
      toast.error("添加音频失败");
    } finally {
      toast.dismiss(t);
    }
  });

  const menuItems: ToolMenuItem[] = [
    {
      key: "local",
      label: "本地上传",
      icon: Upload,
      onSelect: () => {
        audioInputRef.current?.click();
      },
    },
    {
      key: "url",
      label: "网络地址",
      icon: Link,
      onSelect: () => {
        setRemoteModalOpen(true);
      },
    },
    {
      key: "tts",
      label: "文本转语音",
      icon: Mic,
      onSelect: () => {
        setTTSModalOpen(true);
      },
    },
  ];

  return (
    <>
      <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={handleAddAudio} />
      <ToolMenu label="音频" icon={<AudioLines strokeWidth={1.75} />} items={menuItems} />
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
