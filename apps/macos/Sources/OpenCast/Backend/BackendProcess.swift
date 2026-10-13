import AppKit
import OpenCastCore

@MainActor final class BackendProcess {
  private var process: Process?
  private(set) var channel: RpcChannel?
  private var stopping = false
  private var failures = 0
  private var generation = 0
  private var health: Timer?
  var router: RpcChannel.Handler?
  var disconnected: (() -> Void)?
  var ready: (([String: Any]) -> Void)?
  private let hub: EventHub
  init(hub: EventHub) {
    self.hub = hub
    hub.backend = { [weak self] in self?.channel?.notify($0, $1) }
  }
  func start() { Task { await launch() } }
  private func resolveNode() async throws -> String {
    var candidates: [String] = []
    if let override = Environment.env["OPENCAST_NODE"] { candidates.append(override) }
    candidates.append(Environment.resources.appendingPathComponent("node/bin/node").path)
    let shell = Environment.env["SHELL"] ?? "/bin/zsh"
    if let r = try? await ProcessRunner.run(shell, ["-lc", "command -v node"], timeout: 5),
      r.status == 0
    {
      candidates.append(r.output.trimmingCharacters(in: .whitespacesAndNewlines))
    }
    candidates += ["/opt/homebrew/bin/node", "/usr/local/bin/node"]
    for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
      if let r = try? await ProcessRunner.run(path, ["--version"], timeout: 5) {
        let version = r.output.trimmingCharacters(in: .whitespacesAndNewlines).dropFirst().split(
          separator: "."
        ).compactMap { Int($0) }
        if r.status == 0, version.count >= 2,
          version[0] > 22 || (version[0] == 22 && version[1] >= 13)
        {
          return path
        }
      }
    }
    throw RpcError.failure(
      "Node 22.13 or newer is required. Set OPENCAST_NODE to an executable Node binary.")
  }
  private func launch() async {
    guard !stopping else { return }
    generation += 1
    let current = generation
    do {
      let node = try await resolveNode()
      guard !stopping else { return }
      let entry =
        Environment.env["OPENCAST_BACKEND_ENTRY"].map {
          URL(fileURLWithPath: $0).standardizedFileURL
        } ?? Environment.resources.appendingPathComponent("backend/index.mjs")
      guard FileManager.default.fileExists(atPath: entry.path) else {
        throw RpcError.failure("Backend entry missing: \(entry.path)")
      }
      let p = Process()
      p.executableURL = URL(fileURLWithPath: node)
      p.arguments = [
        entry.path, "--data-dir", Environment.dataDir.path, "--resources",
        Environment.resources.path,
      ]
      let input = Pipe()
      let output = Pipe()
      p.standardInput = input
      p.standardOutput = output
      let log = Environment.logDir.appendingPathComponent("backend.log")
      if !FileManager.default.fileExists(atPath: log.path) {
        FileManager.default.createFile(atPath: log.path, contents: nil)
      }
      let stderr = try FileHandle(forWritingTo: log)
      try stderr.seekToEnd()
      p.standardError = stderr
      let rpc = RpcChannel(input: input.fileHandleForWriting, output: output.fileHandleForReading)
      rpc.handler = router
      rpc.onClosed = { [weak self, weak p] in
        guard let self, self.generation == current else { return }
        self.disconnected?()
        self.recover(p, generation: current)
      }
      rpc.onReady = { [weak self, weak p, weak rpc] info in
        guard let self, let rpc, let port = info["port"] as? Int, (1...65535).contains(port),
          let token = info["token"] as? String, !token.isEmpty
        else {
          self?.recover(p, generation: current)
          return
        }
        self.ready?(info)
        self.hub.emit(
          "native.ready", ["version": Environment.version, "macOSMajor": Environment.major])
        Task {
          do {
            _ = try await rpc.request("backend.ping")
          } catch {
            Environment.log("Backend initial ping failed")
            self.recover(p, generation: current)
          }
        }
        self.health?.invalidate()
        self.health = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) {
          [weak self, weak p, weak rpc] _ in
          Task { @MainActor in
            guard let self, self.generation == current, let rpc else { return }
            do {
              _ = try await rpc.request("backend.ping")
              self.failures = 0
            } catch {
              Environment.log("Backend health check failed; restarting")
              self.health?.invalidate()
              self.recover(p, generation: current)
            }
          }
        }
      }
      p.terminationHandler = { [weak self] child in
        DispatchQueue.main.async {
          guard let self, self.generation == current else { return }
          self.channel?.close()
          self.channel = nil
          self.health?.invalidate()
          self.health = nil
          self.process = nil
          try? stderr.close()
          Environment.log("Backend exited (\(child.terminationStatus))")
          self.scheduleRestart()
        }
      }
      try p.run()
      process = p
      channel = rpc
      rpc.start()
      DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self, weak p] in
        guard let self, self.generation == current, self.health == nil else { return }
        Environment.log("Backend ready timeout")
        self.recover(p, generation: current)
      }
    } catch {
      Environment.log(error.localizedDescription)
      scheduleRestart()
    }
  }
  private func recover(_ child: Process?, generation current: Int) {
    guard let child else { return }
    ProcessRecovery.terminate(child) { [weak self, weak child] in
      guard let self, let child else { return false }
      return !self.stopping && self.generation == current && self.process === child
    }
  }
  private func scheduleRestart() {
    guard !stopping else { return }
    failures += 1
    let delay = min(30, pow(2, Double(min(failures - 1, 5))))
    Environment.log("Restarting backend in \(delay)s")
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.start() }
  }
  func shutdown(completion: @escaping () -> Void) {
    stopping = true
    health?.invalidate()
    channel?.close()
    guard let child = process else {
      completion()
      return
    }
    process = nil
    if child.isRunning { child.terminate() }
    DispatchQueue.global(qos: .userInitiated).async {
      for _ in 0..<20 {
        if !child.isRunning { break }
        usleep(50_000)
      }
      if child.isRunning { kill(child.processIdentifier, SIGKILL) }
      child.waitUntilExit()
      DispatchQueue.main.async { completion() }
    }
  }
}
