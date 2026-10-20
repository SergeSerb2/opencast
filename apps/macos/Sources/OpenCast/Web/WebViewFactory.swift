import AppKit
import WebKit

@MainActor final class AppearanceWebView: WKWebView {
  var appearanceChanged: (() -> Void)?
  override func viewDidChangeEffectiveAppearance() {
    super.viewDidChangeEffectiveAppearance()
    appearanceChanged?()
  }
}
@MainActor final class WebViewFactory: NSObject, WKNavigationDelegate {
  weak var router: NativeRouter?
  let hub: EventHub
  private let schemes = SchemeHandlers()
  private let websiteDataStore: WKWebsiteDataStore = Environment.env["OPENCAST_EPHEMERAL_WEB_STORAGE"] == "1"
    ? .nonPersistent() : .default()
  private var views: [String: AppearanceWebView] = [:]
  private var ready: [String: Any]?
  private var routes: [String: [String: Any]] = [:]
  init(hub: EventHub) {
    self.hub = hub
    super.init()
    hub.web = { [weak self] topic, payload in self?.broadcast(topic, payload) }
  }
  static func trusted(_ url: URL) -> Bool {
    if ["opencast-app", "surgecast-app"].contains(url.scheme ?? "") { return url.host == "app" }
    guard let dev = Environment.env["OPENCAST_DEV_URL"].flatMap(URL.init(string:)) else {
      return false
    }
    return url.scheme == dev.scheme && url.host == dev.host && url.port == dev.port
  }
  func create(_ kind: String) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = websiteDataStore
    for name in ["opencast-app", "surgecast-app", "opencast-icon", "opencast-file", "surgecast-icon", "surgecast-file"] {
      configuration.setURLSchemeHandler(schemes, forURLScheme: name)
    }
    if let router {
      configuration.userContentController.addScriptMessageHandler(
        WebViewBridge(kind: kind, router: router), contentWorld: .page, name: "native")
    }
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    configuration.userContentController.addUserScript(
      WKUserScript(
        source: WebViewBridge.listeners, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let web = AppearanceWebView(frame: .zero, configuration: configuration)
    web.setValue(false, forKey: "drawsBackground")
    web.underPageBackgroundColor = .clear
    web.isInspectable = true
    web.navigationDelegate = self
    web.appearanceChanged = { [weak self, weak web] in
      guard let self, let web else { return }
      self.updateAppearance(web)
      self.hub.emit("appearance.changed", ["appearance": self.appearance(web)])
    }
    views[kind] = web
    installScripts(web, kind: kind)
    if ready != nil { load(web, kind: kind) }
    return web
  }
  private func config(_ kind: String) -> [String: Any] {
    [
      "backendUrl": "ws://127.0.0.1:\(ready?["port"] as? Int ?? 0)/rpc",
      "token": ready?["token"] ?? "", "window": kind, "platform": "macos",
      "macOSMajor": Environment.major, "appVersion": Environment.version,
      "dev": Environment.env["OPENCAST_DEV_URL"] != nil,
    ]
  }
  private func installScripts(_ web: WKWebView, kind: String) {
    let c = web.configuration.userContentController
    c.removeAllUserScripts()
    c.addUserScript(
      WKUserScript(
        source: "window.__OPENCAST__ = \(json(config(kind)));\n" + WebViewBridge.listeners + "\n"
          + appearanceScript(web), injectionTime: .atDocumentStart, forMainFrameOnly: true))
  }
  private func appearance(_ web: WKWebView) -> String {
    web.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? "dark" : "light"
  }
  private func appearanceScript(_ web: WKWebView) -> String {
    "(() => { const apply = () => { const h = document.documentElement; if (!h) return; h.setAttribute('macos', '\(Environment.major)'); h.removeAttribute('dark'); h.removeAttribute('light'); h.setAttribute('\(appearance(web))', ''); }; apply(); document.addEventListener('DOMContentLoaded', apply, { once: true }); })();"
  }
  private func updateAppearance(_ web: WKWebView) {
    web.evaluateJavaScript(appearanceScript(web), completionHandler: nil)
  }
  private func load(_ web: WKWebView, kind: String) {
    // Keep this private origin stable: WebKit scopes stored preferences by origin.
    let base = Environment.env["OPENCAST_DEV_URL"] ?? "surgecast-app://app"
    if let url = URL(
      string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        + "/\(kind == "main" ? "main" : kind).html")
    {
      web.load(URLRequest(url: url))
    }
  }
  func backendReady(_ info: [String: Any]) {
    ready = info
    for (kind, web) in views {
      installScripts(web, kind: kind)
      load(web, kind: kind)
    }
  }
  func route(_ kind: String, _ payload: [String: Any]) {
    routes[kind] = payload
    views[kind]?.evaluateJavaScript(
      "window.__opencastNative?.emit('window.route', \(json(payload)))", completionHandler: nil)
  }
  private func broadcast(_ topic: String, _ payload: Any) {
    for web in views.values {
      web.evaluateJavaScript(
        "window.__opencastNative?.emit(\(json(topic)), \(json(payload)))", completionHandler: nil)
    }
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    updateAppearance(webView as! AppearanceWebView)
    if let kind = views.first(where: { $0.value === webView })?.key, let route = routes[kind] {
      webView.evaluateJavaScript(
        "window.__opencastNative.emit('window.route', \(json(route)))", completionHandler: nil)
    }
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    guard ready != nil, let (kind, web) = views.first(where: { $0.value === webView }) else { return }
    Environment.log("Web content process terminated (\(kind)); reloading")
    // A fresh page must not replay a command route and repeat its side effects.
    routes.removeValue(forKey: kind)
    load(web, kind: kind)
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }
    if Self.trusted(url) {
      decisionHandler(.allow)
    } else {
      if navigationAction.navigationType == .linkActivated { NSWorkspace.shared.open(url) }
      decisionHandler(.cancel)
    }
  }
}
