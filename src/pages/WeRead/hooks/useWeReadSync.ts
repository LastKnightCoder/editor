import { useWeReadPersistence } from "./useWeReadPersistence";

interface UseWeReadSyncOptions {
  isConnected: boolean;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export const useWeReadSync = (options: UseWeReadSyncOptions) => {
  const { rows, detailMap, syncing, error, lastSyncedAt, syncBooks } =
    useWeReadPersistence(options);

  return {
    rows,
    detailMap,
    syncing,
    error,
    lastSyncedAt,
    syncBooks,
  };
};
