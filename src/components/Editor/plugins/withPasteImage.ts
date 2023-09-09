import { Editor, Transforms } from "slate";
import { insertImage } from "../utils";
import {
  uploadFileFromFile,
  transformGithubUrlToCDNUrl,
} from '@/utils';
import useSettingStore from "@/stores/useSettingStore.ts";

export const withPasteImage = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    const { files } = data;
    if (files && files.length > 0) {
      const file = files[0];
      const [mime] = file.type.split('/');
      if (mime !== 'image') {
        insertData(data);
        return;
      }
      const insertPath = insertImage(editor, {
        url: '',
        pasteUploading: true,
      });
      if (!insertPath) {
        return;
      }
      const githubInfo = useSettingStore.getState().setting.imageBed.github;
      const uploadRes = await uploadFileFromFile(file, githubInfo);
      if (!uploadRes) {
        Transforms.setNodes(editor, {
          pasteUploading: false
        }, {
          at: insertPath
        });
        return;
      }
      const { content: { download_url } } = uploadRes as any;
      Transforms.setNodes(editor, {
        url: transformGithubUrlToCDNUrl(download_url, githubInfo.branch),
        pasteUploading: false
      }, {
        at: insertPath
      });
      return;
    }
    insertData(data);
  }

  return editor;
}