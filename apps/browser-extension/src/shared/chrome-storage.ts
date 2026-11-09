/** chrome.storage.local 的轻量读写（内容脚本侧通用的本地持久化） */
export const storageGet = async <T>(key: string): Promise<T | undefined> =>
  (await chrome.storage.local.get(key))[key] as T | undefined;

export const storageSet = (key: string, value: unknown) =>
  chrome.storage.local.set({ [key]: value });

export const storageRemove = (key: string) => chrome.storage.local.remove(key);
