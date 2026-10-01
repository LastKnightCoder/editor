import { useEffect, useState } from "react";
import { useSlate } from "slate-react";

import { Button, Dialog, DialogBody, Input } from "@tau/ui";

import { useNotifier } from "@tau/editor/api";
import useMediaUrlInputStore from "../../stores/useMediaUrlInputStore";
import { OverlayBackDismiss } from "@tau/editor/api";
import { MEDIA_TYPE_LABELS, insertMediaByUrl, isProviderSourceUrl } from "../../utils/mediaInsert";

/**
 * "网络地址"插入弹窗：slash 菜单二级项的通用入口之一。
 * 由 openMediaUrlInput 唤起，挂在编辑器根部；全局 store 记录归属编辑器，
 * 同页多编辑器时仅归属者渲染弹窗。
 */
const MediaUrlInputModal = () => {
  const message = useNotifier();
  const ownEditor = useSlate();
  const { open, editor, mediaType, close, release } = useMediaUrlInputStore();
  const [url, setUrl] = useState("");
  const isOwner = editor === ownEditor;

  useEffect(() => () => release(ownEditor), [ownEditor, release]);

  const label = MEDIA_TYPE_LABELS[mediaType];

  const handleOk = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      message.warning(`请输入${label}地址`);
      return;
    }
    if (!editor) {
      return;
    }
    if (mediaType === "video" && isProviderSourceUrl(editor, trimmed)) {
      message.error("该地址属于特殊内容源，请通过对应入口创建视频");
      return;
    }
    if (!insertMediaByUrl(editor, mediaType, trimmed)) {
      message.warning("当前选区无法插入，请将光标置于正文空行后重试");
      return;
    }
    setUrl("");
    close();
  };

  const handleCancel = () => {
    setUrl("");
    close();
  };

  return (
    <Dialog
      open={open && isOwner}
      onOpenChange={next => !next && handleCancel()}
      title={`插入网络${label}`}
      width={460}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleCancel}>
            取消
          </Button>
          <Button variant="primary" size="sm" disabled={!url.trim()} onClick={handleOk}>
            插入
          </Button>
        </>
      }
    >
      <OverlayBackDismiss open={open && isOwner} onDismiss={handleCancel} />
      <DialogBody>
        <Input
          data-autofocus
          placeholder={`https://example.com/${mediaType === "image" ? "image.png" : mediaType === "video" ? "video.mp4" : "audio.mp3"}`}
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleOk();
            }
          }}
        />
      </DialogBody>
    </Dialog>
  );
};

export default MediaUrlInputModal;
