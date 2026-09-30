/** 把已加载的 img 画进画布导出为 PNG（复制到剪贴板用）；跨域无 CORS 的图片画布被污染时返回 null */
export async function imageElementToBlob(img: HTMLImageElement): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  } catch (error) {
    console.error("获取图片数据失败:", error);
    return null;
  }
}

/** 复制图片到剪贴板，成功返回 true */
export async function copyImageElement(img: HTMLImageElement): Promise<boolean> {
  const blob = await imageElementToBlob(img);
  if (!blob) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch (error) {
    console.error("复制图片失败:", error);
    return false;
  }
}
