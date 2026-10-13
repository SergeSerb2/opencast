import WebKit

@MainActor final class WebViewBridge: NSObject, WKScriptMessageHandlerWithReply {
  let kind: String
  weak var router: NativeRouter?
  init(kind: String, router: NativeRouter) {
    self.kind = kind
    self.router = router
  }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    guard message.frameInfo.isMainFrame, let url = message.frameInfo.request.url,
      WebViewFactory.trusted(url)
    else {
      replyHandler(
        ["error": RpcError(code: -32006, message: "Untrusted native bridge origin").object], nil)
      return
    }
    guard let body = message.body as? [String: Any], let method = body["method"] as? String else {
      replyHandler(["error": RpcError.invalid("Expected method and params").object], nil)
      return
    }
    Task {
      do {
        guard let router else { throw RpcError.failure("Router unavailable") }
        if let params = body["params"], !(params is NSNull), !(params is [String: Any]) {
          throw RpcError.invalid("Params must be an object")
        }
        var params = body["params"] as? [String: Any] ?? [:]
        if method.hasPrefix("window."), params["kind"] == nil { params["kind"] = kind }
        replyHandler(["result": try await router.call(method, params)], nil)
      } catch let error as RpcError { replyHandler(["error": error.object], nil) } catch {
        replyHandler(["error": RpcError.failure(error.localizedDescription).object], nil)
      }
    }
  }
  static let listeners = """
    (() => {
      const listeners = new Map();
      window.__surgecastNative = {
        emit(topic, payload) { for (const fn of [...(listeners.get(topic) || [])]) { try { fn(payload); } catch (error) { console.error(error); } } },
        on(topic, fn) { if (!listeners.has(topic)) listeners.set(topic, new Set()); listeners.get(topic).add(fn); return () => listeners.get(topic)?.delete(fn); }
      };
    })();
    """
}
