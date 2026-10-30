// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "tauri-plugin-native-speech",
  platforms: [.iOS(.v13)],
  products: [.library(name: "tauri-plugin-native-speech", type: .static, targets: ["tauri-plugin-native-speech"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-native-speech", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
