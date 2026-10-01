import { type ImageElement } from "../../../types/index";

/** 图片组件注册的运行时动作，供菜单命令调用 */
export const imageActionsMap = new WeakMap<
  ImageElement,
  {
    showOverview: () => void;
    deleteImage: () => void;
    startCrop: () => void;
    runMediaAction: (actionId: string) => void;
    showDescEditor: () => void;
    getImageBlob: () => Promise<Blob | null>;
  }
>();
