import Foundation
import Security
import Tauri

private struct AccessArgs: Decodable {
  let namespace: String
  let operation: String
  let key: String?
  let value: String?
}

class PluginSecretsPlugin: Plugin {
  @objc public func access(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(AccessArgs.self)
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "tau.plugin-secrets." + args.namespace,
      kSecAttrSynchronizable as String: false
    ]
    if args.operation != "clear" {
      guard let key = args.key else { invoke.reject("缺少凭据键"); return }
      query[kSecAttrAccount as String] = key
    }
    var status: OSStatus
    switch args.operation {
    case "get":
      query[kSecReturnData as String] = true
      var item: CFTypeRef?
      status = SecItemCopyMatching(query as CFDictionary, &item)
      if status == errSecItemNotFound { invoke.resolve([:]); return }
      if status == errSecSuccess {
        guard let data = item as? Data, let value = String(data: data, encoding: .utf8)
        else { invoke.reject("凭据格式无效"); return }
        invoke.resolve(["value": value])
        return
      }
    case "set":
      guard let value = args.value else { invoke.reject("缺少凭据值"); return }
      let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8)]
      var item = query.merging(attributes) { _, new in new }
      item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
      status = SecItemAdd(item as CFDictionary, nil)
      if status == errSecDuplicateItem {
        status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
      }
    case "delete", "clear":
      status = SecItemDelete(query as CFDictionary)
      if status == errSecItemNotFound { status = errSecSuccess }
    default:
      invoke.reject("无效的凭据操作")
      return
    }
    if status == errSecSuccess { invoke.resolve([:]) }
    else { invoke.reject("Keychain (\(status))") }
  }
}

@_cdecl("init_plugin_plugin_secrets")
func initPlugin() -> Plugin { PluginSecretsPlugin() }
