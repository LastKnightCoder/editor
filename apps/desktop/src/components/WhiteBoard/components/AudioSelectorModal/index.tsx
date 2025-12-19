import React, { useRef, useState, useEffect } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import RemoteAudioSelectModal from "@/components/RemoteAudioSelectModal";
import TTSGenerateModal from "@/components/TTSGenerateModal";
import type { IResource } from "@/types";
import Board from "../../Board";
import { AudioUtil } from "../../utils";

interface AudioSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string; // "local" | "resource" | "url" | "tts"
}

const AudioSelectorModal = ({
  open,
  onClose,
  board,
  action,
}: AudioSelectorModalProps) => {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const { message } = App.useApp();

  // Modal states for different actions
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [ttsModalOpen, setTTSModalOpen] = useState(false);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);

  // Trigger corresponding action based on action prop
  useEffect(() => {
    if (!open) return;

    switch (action) {
      case "local":
        audioInputRef.current?.click();
        break;
      case "resource":
        setResourcePickerOpen(true);
        break;
      case "url":
        setUrlModalOpen(true);
        break;
      case "tts":
        setTTSModalOpen(true);
        break;
    }
  }, [open, action]);

  const resetState = useMemoizedFn(() => {
    setUrlModalOpen(false);
    setTTSModalOpen(false);
    setResourcePickerOpen(false);
  });

  const handleClose = useMemoizedFn(() => {
    resetState();
    onClose();
  });

  const handleAddAudio = useMemoizedFn(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      handleClose();
    },
  );

  const handleInsertFromResource = useMemoizedFn(
    async (resources: IResource[]) => {
      if (!resources.length) {
        setResourcePickerOpen(false);
        handleClose();
        return;
      }
      message.loading({
        key: "uploading-audio",
        content: "正在插入音频，请稍候...",
        duration: 0,
      });
      try {
        for (const resource of resources) {
          await AudioUtil.insertAudioFromPath(resource.path, board);
        }
      } finally {
        message.destroy("uploading-audio");
        setResourcePickerOpen(false);
        handleClose();
      }
    },
  );

  const handleRemoteConfirm = useMemoizedFn(async (url: string) => {
    try {
      await AudioUtil.insertAudioFromUrl(url, board);
      setUrlModalOpen(false);
      handleClose();
    } catch (error) {
      console.error("添加远程音频失败:", error);
      message.error("添加远程音频失败");
    }
  });

  const handleTTSConfirm = useMemoizedFn(
    async (audioBlob: Blob, text: string) => {
      try {
        message.loading({
          key: "uploading-tts-audio",
          content: "正在保存音频...",
          duration: 0,
        });
        await AudioUtil.insertAudioFromTTS(audioBlob, text, board);
        setTTSModalOpen(false);
        handleClose();
        message.success("音频添加成功");
      } catch (error) {
        console.error("添加 TTS 音频失败:", error);
        message.error("添加音频失败");
      } finally {
        message.destroy("uploading-tts-audio");
      }
    },
  );

  return (
    <>
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={handleAddAudio}
      />

      {/* URL input modal */}
      <RemoteAudioSelectModal
        open={urlModalOpen}
        onCancel={handleClose}
        onConfirm={handleRemoteConfirm}
      />

      {/* TTS modal */}
      <TTSGenerateModal
        open={ttsModalOpen}
        onCancel={handleClose}
        onConfirm={handleTTSConfirm}
      />

      {/* Resource picker modal */}
      <ResourcePickerModal
        open={resourcePickerOpen}
        onCancel={handleClose}
        allowedTypes={["audio"]}
        multiple
        title="选择音频"
        onConfirm={handleInsertFromResource}
      />
    </>
  );
};

export default AudioSelectorModal;
