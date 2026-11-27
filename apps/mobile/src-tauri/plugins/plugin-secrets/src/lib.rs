use tauri::{plugin::TauriPlugin, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.plugin_secrets";
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_plugin_secrets);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("plugin-secrets")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin(PLUGIN_IDENTIFIER, "PluginSecretsPlugin")?;
            #[cfg(target_os = "ios")]
            _api.register_ios_plugin(init_plugin_plugin_secrets)?;
            Ok(())
        })
        .build()
}
