import Foundation

@MainActor final class RpcChannel {
  typealias Handler = (String, [String: Any]) async throws -> Any
  private let input: FileHandle
  private let output: FileHandle
  private var pending: [String: CheckedContinuation<Any, Error>] = [:]
  private var nextID = 0
  private var closed = false
  private let writer = DispatchQueue(label: "app.surgecast.rpc.writer")
  var handler: Handler?
  var onReady: (([String: Any]) -> Void)?
  var onClosed: (() -> Void)?
  init(input: FileHandle, output: FileHandle) {
    self.input = input
    self.output = output
  }
  func start() {
    let reader = output
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      var buffer = Data()
      while true {
        let data = reader.availableData
        if data.isEmpty { break }
        buffer.append(data)
        if buffer.count > 8 * 1024 * 1024 {
          DispatchQueue.main.async { self?.close() }
          break
        }
        while let newline = buffer.firstIndex(of: 10) {
          let line = Data(buffer[..<newline])
          buffer.removeSubrange(...newline)
          DispatchQueue.main.async { self?.receive(line) }
        }
      }
      DispatchQueue.main.async { self?.close() }
    }
  }
  private func send(_ object: [String: Any]) {
    guard !closed else { return }
    let data = Data((json(object) + "\n").utf8)
    let handle = input
    writer.async { [weak self] in
      do { try handle.write(contentsOf: data) } catch { DispatchQueue.main.async { self?.close() } }
    }
  }
  func notify(_ topic: String, _ payload: Any) {
    send(["jsonrpc": "2.0", "method": topic, "params": payload])
  }
  func request(_ method: String, _ params: Any = [String: Any](), timeout: Double = 10) async throws
    -> Any
  {
    guard !closed else { throw RpcError.failure("Backend channel disconnected") }
    nextID += 1
    let id = "native-\(nextID)"
    return try await withCheckedThrowingContinuation { continuation in
      pending[id] = continuation
      send(["jsonrpc": "2.0", "id": id, "method": method, "params": params])
      DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
        self?.pending.removeValue(forKey: id)?.resume(
          throwing: RpcError.failure("Backend request timed out: \(method)"))
      }
    }
  }
  private func receive(_ line: Data) {
    guard !closed, !line.isEmpty else { return }
    guard let value = try? JSONSerialization.jsonObject(with: line),
      let object = value as? [String: Any]
    else {
      send([
        "jsonrpc": "2.0", "id": NSNull(),
        "error": RpcError(code: -32700, message: "Invalid JSON").object,
      ])
      return
    }
    guard object["jsonrpc"] as? String == "2.0" else {
      send([
        "jsonrpc": "2.0", "id": object["id"] ?? NSNull(),
        "error": RpcError(code: -32600, message: "Expected JSON-RPC 2.0").object,
      ])
      return
    }
    if let id = object["id"], !(id is NSNull), !(id is String) {
      guard let number = id as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else {
        send([
          "jsonrpc": "2.0", "id": NSNull(),
          "error": RpcError(code: -32600, message: "Invalid request id").object,
        ])
        return
      }
    }
    if object["method"] != nil && !(object["method"] is String) {
      send([
        "jsonrpc": "2.0", "id": object["id"] ?? NSNull(),
        "error": RpcError(code: -32600, message: "Method must be a string").object,
      ])
      return
    }
    if let method = object["method"] as? String {
      if method == "backend.ready", object["id"] == nil,
        let params = object["params"] as? [String: Any]
      {
        onReady?(params)
        return
      }
      Task {
        let result: [String: Any]
        do {
          if let raw = object["params"], !(raw is NSNull), !(raw is [String: Any]) {
            throw RpcError.invalid("Params must be an object")
          }
          guard let handler else { throw RpcError.failure("Native router unavailable") }
          result = ["result": try await handler(method, object["params"] as? [String: Any] ?? [:])]
        } catch let error as RpcError { result = ["error": error.object] } catch {
          result = ["error": RpcError.failure(error.localizedDescription).object]
        }
        if let id = object["id"], !(id is NSNull) {
          var response = result
          response["jsonrpc"] = "2.0"
          response["id"] = id
          send(response)
        }
      }
    } else if let id = object["id"] as? String,
      let continuation = pending.removeValue(forKey: id)
    {
      if let error = object["error"] as? [String: Any] {
        continuation.resume(
          throwing: RpcError(
            code: error["code"] as? Int ?? -32603,
            message: error["message"] as? String ?? "Backend error", data: error["data"]))
      } else {
        continuation.resume(returning: object["result"] ?? NSNull())
      }
    }
  }
  func close() {
    guard !closed else { return }
    closed = true
    try? input.close()
    let requests = pending
    pending.removeAll()
    for c in requests.values { c.resume(throwing: RpcError.failure("Backend disconnected")) }
    let callback = onClosed
    onReady = nil
    onClosed = nil
    handler = nil
    callback?()
  }
}
