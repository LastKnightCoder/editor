import { useEffect } from "react";
import { on, off } from "@/electron";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";

export function useDeviceSyncChanges() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const receive = (_event: unknown, payload: { databaseName: string }) => {
      const current = useSettingStore.getState().setting.database.active;
      if (current.replace(/\.db$/, "") !== payload.databaseName.replace(/\.db$/, "")) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (useSettingStore.getState().setting.database.active !== current) return;
        void queryClient.invalidateQueries({
          predicate: query =>
            ![
              "device-sync",
              "settings",
              "plugins",
              "models",
              "tts",
              "sync",
              "upload",
              "collaboration",
            ].includes(String(query.queryKey[0])),
        });
      }, 100);
    };
    on("device-sync:changed", receive);
    return () => {
      clearTimeout(timer);
      off("device-sync:changed", receive);
    };
  }, []);
}
