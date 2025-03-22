export const getImageInfo = async (
  file: File,
): Promise<{ width: number; height: number } | null> => {
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
};

export const getVideoInfo = async (
  file: File,
): Promise<{ width: number; height: number } | null> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      resolve(null);
    };
    video.src = URL.createObjectURL(file);
  });
};
