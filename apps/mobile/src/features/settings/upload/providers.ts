import { useProviderEntries } from "../providerEntries";
export type { ProviderEntry as UploadProviderEntry } from "../providerEntries";
export const LOCAL_UPLOAD_ID = "local";
export function useUploadProviders() {
  return useProviderEntries("upload");
}
