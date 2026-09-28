import { useEffect, useState } from "react";
import { message } from "antd";
import { useSlate } from "slate-react";

import { CustomModal } from "@tau/shared";

import useMediaUrlInputStore from "../../stores/useMediaUrlInputStore";
import { MEDIA_TYPE_LABELS, insertMediaByUrl, isProviderSourceUrl } from "../../utils/mediaInsert";

/**
 * "网络地址"插入弹窗：slash 菜单二级项的通用入口之一。
 * 由 openMediaUrlInput 唤起，挂在编辑器根部；全局 store 记录归属编辑器，
 * 同页多编辑器时仅归属者渲染弹窗。
 */
const MediaUrlInputModal = () => {
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

  return (
    <CustomModal
      open={open && isOwner}
      title={`插入网络${label}`}
      okText="插入"
      cancelText="取消"
      onOk={handleOk}
      onCancel={() => {
        setUrl("");
        close();
      }}
      destroyOnClose
      width={520}
    >
      <input
        autoFocus
        type="text"
        className="w-full rounded-[0.75em] border border-gray-200 bg-gray-50 px-[1em] py-[0.875em] text-[0.875em] text-gray-800 shadow-inner outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-[var(--ed-border-focus)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_var(--ed-border-focus)/20] dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_var(--ed-border-focus)/25]"
        placeholder={`https://example.com/${mediaType === "image" ? "image.png" : mediaType === "video" ? "video.mp4" : "audio.mp3"}`}
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            handleOk();
          }
        }}
      />
    </CustomModal>
  );
};

export default MediaUrlInputModal;
