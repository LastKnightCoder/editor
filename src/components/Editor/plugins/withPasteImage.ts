import {Editor, Transforms} from "slate";
import {insertImage, replaceGithubUrlToCDNUrl, uploadSingleImage} from "../utils";
import {v4 as uuid} from "uuid";

export const withPasteImage = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = (data: DataTransfer) => {
    const { files } = data;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
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
      reader.addEventListener('load', async () => {
        const res = reader.result as string;
        let fileName = file.name;
        fileName = fileName.split('.')[0] + '_' + uuid() + '.' + fileName.split('.')[1];
        const uploadRes = await uploadSingleImage(res.split(',')[1], fileName);
        if (!uploadRes) {
          Transforms.setNodes(editor, {
            pasteUploading: false
          }, {
            at: insertPath
          });
          return;
        }
        const { content: { download_url } } = uploadRes as any;
        const [image] = Editor.nodes(editor, {
          at: insertPath,
        });
        console.log(image, download_url);
        Transforms.setNodes(editor, {
          url: replaceGithubUrlToCDNUrl(download_url),
          pasteUploading: false
        }, {
          at: insertPath
        });
      });
      reader.readAsDataURL(file);
      return;
    }
    insertData(data);
  }

  return editor;
}