// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "tauri-plugin-native-record",
  platforms: [.iOS(.v13)],
  products: [.library(name: "tauri-plugin-native-record", type: .static, targets: ["tauri-plugin-native-record"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-native-record", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
