import { Editor } from "slate";

/**
 * 为编辑器添加上传资源功能的插件
 * 这个插件用于兼容粘贴图片时需要使用uploadResource的情况
 */
export const withUploadResource =
  (uploadResource?: (file: File) => Promise<string | null>) =>
  (editor: Editor): Editor => {
    // 将uploadResource作为editor的属性保存
    (editor as any)._uploadResource = uploadResource;

    return editor;
  };

export default withUploadResource;
