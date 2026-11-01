fn main() {
    // 不向 WebView 暴露命令：录音路径只由宿主 Rust 决定
    tauri_plugin::Builder::new(&[])
        .android_path("../../native-record/android")
        .ios_path("../../native-record/ios")
        .build();
}
