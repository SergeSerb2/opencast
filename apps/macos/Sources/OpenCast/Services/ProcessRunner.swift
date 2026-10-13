import Foundation

struct ProcessResult {
  let status: Int32
  let output: String
  let error: String
}
enum ProcessRunner {
  /// Capture on separate queues so a full stderr pipe cannot deadlock stdout.
  static func run(_ executable: String, _ arguments: [String], timeout: Double = 30) async throws
    -> ProcessResult
  {
    try await Task.detached(priority: .userInitiated) {
      let p = Process()
      p.executableURL = URL(fileURLWithPath: executable)
      p.arguments = arguments
      let out = Pipe()
      let err = Pipe()
      p.standardOutput = out
      p.standardError = err
      try p.run()
      let deadline = DispatchWorkItem {
        if p.isRunning {
          p.terminate()
          DispatchQueue.global().asyncAfter(deadline: .now() + 1) {
            if p.isRunning { kill(p.processIdentifier, SIGKILL) }
          }
        }
      }
      DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: deadline)
      let outputTask = Task.detached { out.fileHandleForReading.readDataToEndOfFile() }
      let errorTask = Task.detached { err.fileHandleForReading.readDataToEndOfFile() }
      p.waitUntilExit()
      deadline.cancel()
      let output = await outputTask.value
      let error = await errorTask.value
      return ProcessResult(
        status: p.terminationStatus, output: String(decoding: output, as: UTF8.self),
        error: String(decoding: error, as: UTF8.self))
    }.value
  }
  static func checked(_ executable: String, _ arguments: [String], timeout: Double = 30)
    async throws -> String
  {
    let r = try await run(executable, arguments, timeout: timeout)
    guard r.status == 0 else {
      if r.error.contains("-1743") || r.error.contains("not authorized") {
        throw RpcError.missing("automation")
      }
      throw RpcError.failure(
        r.error.isEmpty
          ? "Command failed (\(r.status))" : r.error.trimmingCharacters(in: .whitespacesAndNewlines)
      )
    }
    return r.output.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
