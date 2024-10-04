import { readBinaryFile } from '@tauri-apps/api/fs';

export const filePathToArrayBuffer = async (filePath: string): Promise<ArrayBuffer> => {
  const file = await readBinaryFile(filePath);
  return file.buffer;
}

export const fileToArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  return await file.arrayBuffer();
}

export const urlToArrayBuffer = async (url: string): Promise<ArrayBuffer> => {
  return await (await fetch(url)).arrayBuffer();
}

export const getImageInfo = async (file: File): Promise<{ width: number, height: number } | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = URL.createObjectURL(file);
  });
}
