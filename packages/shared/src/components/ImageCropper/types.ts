/**
 * cropperjs 裁剪/变换参数
 * 用于保存和恢复裁剪状态
 */
export interface CropperTransform {
  // 裁剪选区 (相对于原始图片的像素坐标)
  selection: {
    x: number; // 左上角 x 坐标
    y: number; // 左上角 y 坐标
    width: number; // 选区宽度
    height: number; // 选区高度
    aspectRatio?: number; // 锁定的宽高比
  };

  // 图片变换 (DOMMatrix 值)
  transform?: {
    a: number; // 水平缩放
    b: number; // 垂直倾斜
    c: number; // 水平倾斜
    d: number; // 垂直缩放
    e: number; // 水平平移
    f: number; // 垂直平移
  };

  // 旋转角度 (度数) - 已包含在 transform 中，保留用于向后兼容
  rotation?: number;

  // 版本号 (用于未来兼容性)
  version: "1.0";
}

export interface ImageCropperProps {
  open: boolean;
  onCancel: () => void;
  imageUrl: string;
  initialTransform?: CropperTransform;
  onConfirm: (
    transform: CropperTransform,
    croppedBlob: Blob,
  ) => void | Promise<void>;
  alt?: string;
  isDark?: boolean;
}

export type AspectRatioPreset = {
  label: string;
  value: number | undefined; // undefined 表示自由裁剪
};
