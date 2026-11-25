import { PluginEntries } from "../../plugins/PluginEntries";
import { useFeatureEntries } from "../../featureEntries/useFeatureEntries";
import { SettingsPage } from "../SettingsPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function SettingsScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  const features = useFeatureEntries();

  return (
    <SettingsPage
      pluginEntries={<PluginEntries />}
      features={features}
      safeSetting={app.syncSettings.safeSetting}
      databases={app.bootstrap.databases}
      versions={app.bootstrap.versions}
      isSavingSetting={app.syncSettings.isSavingSetting}
      isSyncing={app.syncSettings.isSyncing}
      onOpenModule={module => navigator.push("settingsModule", { module })}
      onOpenSearch={() => navigator.push("search")}
      onSwitchDatabase={app.handleSwitchDatabase}
      onSaveSetting={app.handleSaveSetting}
      onCheckVersions={app.handleCheckVersions}
      onSyncUpload={app.handleSyncUpload}
      onSyncDownload={app.handleSyncDownload}
      resourceSyncProgress={app.resourceSync.progress}
      resourceSyncStatusFile={app.resourceSync.statusFile}
      isResourceSyncing={app.resourceSync.isResourceSyncing}
      onResourceSyncRefresh={app.handleResourceSyncRefresh}
      onResourceSyncStart={app.handleResourceSyncStart}
      onResourceSyncRetryFailed={app.handleResourceSyncRetryFailed}
      onResourceSyncCancel={app.handleResourceSyncCancel}
      updateSetting={app.syncSettings.updateSetting}
    />
  );
}

export default definePage({
  key: "settings",
  match: "single",
  params: {},
  component: SettingsScreen,
});
