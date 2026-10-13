import Foundation

public enum ProcessRecovery {
  /// Escalate only while this exact launch still owns the running child.
  public static func terminate(_ child: Process, gracePeriod: TimeInterval = 1, isCurrent: @escaping () -> Bool) {
    guard child.isRunning, isCurrent() else { return }
    child.terminate()
    DispatchQueue.main.asyncAfter(deadline: .now() + gracePeriod) { [weak child] in
      guard let child, isCurrent(), child.isRunning else { return }
      kill(child.processIdentifier, SIGKILL)
    }
  }
}
