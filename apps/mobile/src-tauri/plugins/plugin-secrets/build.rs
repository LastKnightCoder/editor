fn main() {
    tauri_plugin::Builder::new(&["access"])
        .android_path("../../native-secrets/android")
        .ios_path("../../native-secrets/ios")
        .build();
}
