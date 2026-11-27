// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "tauri-plugin-plugin-secrets",
  platforms: [.iOS(.v13)],
  products: [.library(name: "tauri-plugin-plugin-secrets", type: .static, targets: ["tauri-plugin-plugin-secrets"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-plugin-secrets", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
