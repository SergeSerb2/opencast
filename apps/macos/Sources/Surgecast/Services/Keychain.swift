import Foundation
import Security

enum Keychain {
  static func call(_ method: String, _ p: [String: Any]) throws -> Any {
    let account = try p.string("account")
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.surgecast",
      kSecAttrAccount as String: account,
    ]
    var status: OSStatus
    switch method {
    case "keychain.get":
      var q = query
      q[kSecReturnData as String] = true
      q[kSecMatchLimit as String] = kSecMatchLimitOne
      var result: CFTypeRef?
      status = SecItemCopyMatching(q as CFDictionary, &result)
      if status == errSecItemNotFound { return NSNull() }
      guard status == errSecSuccess, let data = result as? Data,
        let value = String(data: data, encoding: .utf8)
      else { throw RpcError.failure("Keychain read failed (\(status))") }
      return value
    case "keychain.set":
      let value = Data(try p.string("value", allowEmpty: true).utf8)
      status = SecItemUpdate(
        query as CFDictionary, [kSecValueData as String: value] as CFDictionary)
      if status == errSecItemNotFound {
        var q = query
        q[kSecValueData as String] = value
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        status = SecItemAdd(q as CFDictionary, nil)
      }
    case "keychain.delete":
      status = SecItemDelete(query as CFDictionary)
      if status == errSecItemNotFound { return NSNull() }
    default: throw RpcError.unsupported("Unknown keychain method")
    }
    guard status == errSecSuccess else {
      throw RpcError.failure("Keychain operation failed (\(status))")
    }
    return NSNull()
  }
}
