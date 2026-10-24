import { useProviderEntries } from "../providerEntries";
export type {
  ProviderEntry as SyncProviderEntry,
  ProviderPanelProps as SyncProviderPanelProps,
} from "../providerEntries";
export function useSyncProviders() {
  return useProviderEntries("sync");
}
