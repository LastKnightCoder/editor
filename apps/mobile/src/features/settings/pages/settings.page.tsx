import { SettingsPage } from "../SettingsPage";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";
import { useTodoStore } from "../../todo/store/useTodoStore";

function SettingsScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <SettingsPage
      safeSetting={app.syncSettings.safeSetting}
      databases={app.bootstrap.databases}
      versions={app.bootstrap.versions}
      isSavingSetting={app.syncSettings.isSavingSetting}
      isSyncing={app.syncSettings.isSyncing}
      onOpenModule={module => navigator.push("settingsModule", { module })}
      onOpenTodo={
        app.todoModuleEnabled
          ? () => {
              const databaseName =
                app.syncSettings.safeSetting?.database?.active ??
                app.bootstrap.databases?.activeDatabase ??
                null;
              void useTodoStore.getState().initialize(databaseName);
              navigator.push("todo");
            }
          : undefined
      }
      onOpenPomodoro={app.pomodoroModuleEnabled ? () => navigator.push("pomodoro") : undefined}
      onOpenSearch={() => navigator.push("search")}
      onOpenArticles={() => navigator.push("articles")}
      onOpenProjects={() => navigator.push("projects")}
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
