import {Editor, Transforms} from "slate";
import { replaceGithubUrlToCDNUrl, uploadSingleImage } from "../utils";
import {v4 as uuid} from "uuid";

export const withPasteImage = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = (data: DataTransfer) => {
    const { files } = data;
    console.log(files);
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      const [mime] = file.type.split('/');
      if (mime !== 'image') {
        insertData(data);
        return;
      }
      Editor.insertNode(editor, {
        type: 'image',
        url: '',
        pasteUploading: true,
        children: [{
          type: 'formatted',
          text: ''
        }]
      });
      reader.addEventListener('load', async () => {
        const res = reader.result as string;
        let fileName = file.name;
        fileName = fileName.split('.')[0] + '_' + uuid() + '.' + fileName.split('.')[1];
        const uploadRes = await uploadSingleImage(res.split(',')[1], fileName);
        const { content: { download_url } } = uploadRes as any;
        Transforms.setNodes(editor, {
          url: replaceGithubUrlToCDNUrl(download_url),
          pasteUploading: false
        });
      });
      reader.readAsDataURL(file);
      return;
    }
    insertData(data);
  }

  return editor;
}