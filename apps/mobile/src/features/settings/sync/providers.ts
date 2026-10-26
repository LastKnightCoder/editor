import { useProviderEntries } from "../providerEntries";
export type { ProviderEntry as SyncProviderEntry } from "../providerEntries";
export function useSyncProviders() {
  return useProviderEntries("sync");
}
