import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "../../../../app/AppContext";
import { useMobilePlugins } from "../../../../app/plugins/context";
import { usePageInstanceContext, usePageLifecycle } from "../../../../router";
import { getMobileSettingSnapshot } from "../../../../services/mobileSettingsBridge";
import { mergeTtsSettings } from "../../../../services/provider-config";
import type { SettingCompat } from "../../../../types";
import { getTtsAccounts, getTtsUsage, listTtsProviders } from "../model";

export function useTtsDomain() {
  const app = useAppContext();
  const runtime = useMobilePlugins();
  const { entry, navigator, phase } = usePageInstanceContext();
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [entry.id]);
  usePageLifecycle({
    onDestroy: () => {
      mountedRef.current = false;
    },
  });
  const isPageActive = useCallback(
    () =>
      mountedRef.current &&
      phaseRef.current === "active" &&
      navigator.getActiveScreen()?.id === entry.id,
    [entry.id, navigator]
  );
  const revision = runtime?.getSnapshot();
  const providers = useMemo(
    () => (revision === undefined ? [] : listTtsProviders(runtime)),
    [runtime, revision]
  );
  const setting = app.syncSettings.safeSetting;
  const updateSetting = app.syncSettings.updateSetting;
  const database = setting?.database.active ?? runtime?.workspaceId ?? "";
  const applySnapshot = useCallback(
    async (operation: () => Promise<SettingCompat>): Promise<SettingCompat | null> => {
      const requestDatabase = database;
      const saved = await operation();
      if (saved.database.active !== requestDatabase) return null;
      if (getMobileSettingSnapshot()?.database.active !== requestDatabase) return null;
      let accepted = false;
      updateSetting(previous => {
        if (previous.database.active !== requestDatabase) return previous;
        if (getMobileSettingSnapshot()?.database.active !== requestDatabase) return previous;
        accepted = true;
        return mergeTtsSettings(previous, saved);
      });
      return accepted ? saved : null;
    },
    [database, updateSetting]
  );

  return {
    runtime,
    setting,
    providers,
    accounts: getTtsAccounts(setting),
    usage: getTtsUsage(setting),
    database,
    providerFor: (pluginId: string) =>
      providers.find(provider => provider.context.pluginId === pluginId),
    applySnapshot,
    isPageActive,
  };
}
