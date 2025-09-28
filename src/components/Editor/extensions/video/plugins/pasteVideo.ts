import { Editor, Transforms } from "slate";
import { insertVideo } from "@editor/utils";
import { uploadResource } from "@/hooks/useUploadResource.ts";
import { message } from "antd";
import { isYoutubeUrl, parseYoutubeUrl } from "@/utils/youtube/parser";
import { isBilibiliUrl, quickCheckBilibiliUrl } from "@/utils/bilibili";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import useSettingStore from "@/stores/useSettingStore";

export const pasteVideo = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    const { files } = data;

    // 识别纯文本 URL（Bilibili/YouTube）
    const text = data.getData("text/plain");
    if (text && (isYoutubeUrl(text) || isBilibiliUrl(text))) {
      if (isYoutubeUrl(text)) {
        const { videoId } = parseYoutubeUrl(text);
        if (!videoId) {
          insertData(data);
          return;
        }
        const setting = useSettingStore.getState().setting;
        const info = await getYoutubeVideoInfo(
          videoId,
          setting.integration.youtube.proxy,
        ).catch(() => null);
        if (!info) {
          message.error("无法获取 YouTube 视频信息");
          insertData(data);
          return;
        }
        const bestVideo =
          info.videoFmts.find((f) => f.quality === "highest") ||
          info.videoFmts[0];
        const bestAudio =
          info.audioFmts.find((f) => f.quality === "highest") ||
          info.audioFmts[0];
        insertVideo(editor, {
          src: text,
          uploading: false,
          metaInfo: {
            type: "youtube",
            videoId: info.videoId,
            videoFormat: bestVideo,
            audioFormat: bestAudio,
          },
        });
        return;
      }

      if (isBilibiliUrl(text)) {
        const quick = await quickCheckBilibiliUrl(text);
        if (!quick.isValid || !quick.bvid) {
          message.error(quick.error || "无效的 Bilibili 链接");
          insertData(data);
          return;
        }
        insertVideo(editor, {
          src: text,
          uploading: false,
          metaInfo: {
            type: "bilibili",
            bvid: quick.bvid,
            cid: "", // 首次未知，进入时会获取并写回 metaInfo
          },
        });
        return;
      }
    }
    if (files && files.length > 0) {
      const file = files[0];
      const [mime] = file.type.split("/");
      if (mime !== "video") {
        insertData(data);
        return;
      }
      const insertPath = insertVideo(editor, {
        src: "",
        uploading: true,
      });
      if (!insertPath) {
        return;
      }
      const src = await uploadResource(file);
      if (!src) {
        message.error("上传失败");
        Editor.withoutNormalizing(editor, () => {
          Transforms.delete(editor, {
            at: insertPath,
          });
          Transforms.insertNodes(
            editor,
            {
              type: "paragraph",
              children: [{ type: "formatted", text: "" }],
            },
            {
              at: insertPath,
              select: true,
            },
          );
        });
        return;
      }
      Transforms.setNodes(
        editor,
        {
          src,
          uploading: false,
        },
        {
          at: insertPath,
        },
      );
      return;
    }
    insertData(data);
  };

  return editor;
};
