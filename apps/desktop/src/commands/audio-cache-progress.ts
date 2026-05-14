export interface AudioCacheProgress {
  requestId?: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
}

let clientRequestCounter = Date.now();

export function getNextAudioCacheRequestId(): number {
  clientRequestCounter += 1;
  return clientRequestCounter;
}

export function createScopedAudioProgressHandler<T extends AudioCacheProgress>(
  requestId: number,
  onProgress: (progress: T) => void,
) {
  return (_event: any, data: T) => {
    if (data.requestId === requestId) {
      onProgress(data);
    }
  };
}
