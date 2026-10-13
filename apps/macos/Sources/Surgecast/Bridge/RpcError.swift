import Foundation

struct RpcError: Error {
  let code: Int
  let message: String
  var data: Any? = nil
  var object: [String: Any] {
    var o: [String: Any] = ["code": code, "message": message]
    if let data { o["data"] = data }
    return o
  }
  static func invalid(_ message: String) -> RpcError { .init(code: -32602, message: message) }
  static func missing(_ permission: String) -> RpcError {
    .init(
      code: -32002, message: "Permission required: \(permission)", data: ["permission": permission])
  }
  static func unsupported(_ message: String) -> RpcError { .init(code: -32601, message: message) }
  static func failure(_ message: String) -> RpcError { .init(code: -32603, message: message) }
}
func json(_ value: Any) -> String {
  guard
    let data = try? JSONSerialization.data(
      withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys]),
    let s = String(data: data, encoding: .utf8)
  else { return "null" }
  return s
}
extension Dictionary where Key == String, Value == Any {
  func string(_ key: String, allowEmpty: Bool = false) throws -> String {
    guard let v = self[key] as? String, allowEmpty || !v.isEmpty else {
      throw RpcError.invalid("Missing or invalid \(key)")
    }
    return v
  }
  func number(_ key: String) throws -> Double {
    guard let v = self[key] as? NSNumber, CFGetTypeID(v) != CFBooleanGetTypeID(),
      v.doubleValue.isFinite
    else { throw RpcError.invalid("Missing or invalid \(key)") }
    return v.doubleValue
  }
  func bool(_ key: String) -> Bool { self[key] as? Bool ?? false }
  func boolean(_ key: String) throws -> Bool {
    guard let value = self[key] as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else {
      throw RpcError.invalid("Missing or invalid \(key)")
    }
    return value.boolValue
  }
  func strings(_ key: String) throws -> [String] {
    guard let v = self[key] as? [String] else {
      throw RpcError.invalid("Missing or invalid \(key)")
    }
    return v
  }
}
