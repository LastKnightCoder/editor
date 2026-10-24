import { getVersion } from "@tauri-apps/api/app";
import { useQuery } from "@tanstack/react-query";

export function useAppVersion() {
  return useQuery({ queryKey: ["app", "version"], queryFn: getVersion, staleTime: Infinity }).data;
}
