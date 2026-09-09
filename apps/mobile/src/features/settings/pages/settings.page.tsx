import { SettingsPage } from "../SettingsPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";
import { useSettingsModule } from "./useSettingsModule";

function SettingsScreen() {
  const navigator = useNavigator();
  const app = useAppContext();
  const { activeModule, onActiveModuleChange } = useSettingsModule();

  return (
    <SettingsPage
      safeSetting={app.syncSettings.safeSetting}
      databases={app.bootstrap.databases}
      versions={app.bootstrap.versions}
      isSavingSetting={app.syncSettings.isSavingSetting}
      isSyncing={app.syncSettings.isSyncing}
      onBack={() => navigator.goBack("ui")}
      activeModule={activeModule}
      onActiveModuleChange={onActiveModuleChange}
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
