import React, { useRef, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import RemoteAudioSelectModal from "@/components/RemoteAudioSelectModal";
import TTSGenerateModal from "@/components/TTSGenerateModal";
import Board from "../../Board";
import { AudioUtil } from "../../utils";

interface AudioSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string; // "local" | "url" | "tts"
}

const AudioSelectorModal = ({ open, onClose, board, action }: AudioSelectorModalProps) => {
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Modal states for different actions
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [ttsModalOpen, setTTSModalOpen] = useState(false);

  // Trigger corresponding action based on action prop
  useEffect(() => {
    if (!open) return;

    switch (action) {
      case "local":
        audioInputRef.current?.click();
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
  });

  const handleClose = useMemoizedFn(() => {
    resetState();
    onClose();
  });

  const handleAddAudio = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const toastId = toast.loading("正在处理音频，请稍候…");
      try {
        await AudioUtil.insertAudio(file, board);
      } finally {
        toast.dismiss(toastId);
      }
    }
    event.target.value = "";
    handleClose();
  });

  const handleRemoteConfirm = useMemoizedFn(async (url: string) => {
    try {
      await AudioUtil.insertAudioFromUrl(url, board);
      setUrlModalOpen(false);
      handleClose();
    } catch (error) {
      console.error("添加远程音频失败:", error);
      toast.error("添加远程音频失败");
    }
  });

  const handleTTSConfirm = useMemoizedFn(async (audioBlob: Blob, text: string) => {
    const toastId = toast.loading("正在保存音频…");
    try {
      await AudioUtil.insertAudioFromTTS(audioBlob, text, board);
      setTTSModalOpen(false);
      handleClose();
      toast.success("音频添加成功");
    } catch (error) {
      console.error("添加 TTS 音频失败:", error);
      toast.error("添加音频失败");
    } finally {
      toast.dismiss(toastId);
    }
  });

  return (
    <>
      <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={handleAddAudio} />

      {/* URL input modal */}
      <RemoteAudioSelectModal
        open={urlModalOpen}
        onCancel={handleClose}
        onConfirm={handleRemoteConfirm}
      />

      {/* TTS modal */}
      <TTSGenerateModal open={ttsModalOpen} onCancel={handleClose} onConfirm={handleTTSConfirm} />
    </>
  );
};

export default AudioSelectorModal;
