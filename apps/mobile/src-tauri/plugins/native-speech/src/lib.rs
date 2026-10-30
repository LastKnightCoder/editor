use serde_json::Value;
use tauri::{ipc::Channel, plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.native_speech";
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_speech);

struct NativeSpeech<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    #[cfg(not(mobile))]
    _runtime: std::marker::PhantomData<fn() -> R>,
}

#[tauri::command]
async fn start<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    language: String,
    on_event: Channel<Value>,
) -> Result<(), String> {
    #[cfg(mobile)]
    {
        let plugin = app.state::<NativeSpeech<R>>();
        plugin
            .handle
            .run_mobile_plugin_async(
                "start",
                serde_json::json!({ "id": id, "language": language, "onEvent": on_event }),
            )
            .await
            .map_err(|error| error.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, id, language, on_event);
        Err("系统语音识别仅支持 iOS 和 Android".into())
    }
}

#[tauri::command]
async fn stop<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    #[cfg(mobile)]
    {
        app.state::<NativeSpeech<R>>()
            .handle
            .run_mobile_plugin_async("stop", serde_json::json!({ "id": id }))
            .await
            .map_err(|error| error.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, id);
        Err("系统语音识别仅支持 iOS 和 Android".into())
    }
}

#[tauri::command]
async fn cancel<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    #[cfg(mobile)]
    {
        app.state::<NativeSpeech<R>>()
            .handle
            .run_mobile_plugin_async("cancel", serde_json::json!({ "id": id }))
            .await
            .map_err(|error| error.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, id);
        Err("系统语音识别仅支持 iOS 和 Android".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("native-speech")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "NativeSpeechPlugin")?;
            #[cfg(target_os = "ios")]
            let handle = _api.register_ios_plugin(init_plugin_native_speech)?;
            #[cfg(mobile)]
            app.manage(NativeSpeech { handle });
            #[cfg(not(mobile))]
            app.manage(NativeSpeech::<R> {
                _runtime: std::marker::PhantomData,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![start, stop, cancel])
        .build()
}
