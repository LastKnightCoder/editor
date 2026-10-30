fn main() {
    tauri_plugin::Builder::new(&["start", "stop", "cancel"])
        .android_path("../../native/android")
        .ios_path("../../native/ios")
        .build();
}
