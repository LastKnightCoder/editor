import { discardRecording } from "../../../services/recording";

export type RecordingPersistence = {
  prepareResource: (src: string) => string;
  flush: () => Promise<void>;
};

/** 正文耐久保存后才能删除找回旁注，失败时保留录音的找回入口。 */
export async function persistRecording<T>(
  persistence: RecordingPersistence,
  id: string,
  src: string,
  write: (reference: string) => T
): Promise<T> {
  const result = write(persistence.prepareResource(src));
  await persistence.flush();
  await discardRecording(id);
  return result;
}
