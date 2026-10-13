import AVFoundation

@MainActor final class Speech {
  private let synth = AVSpeechSynthesizer()
  func say(_ p: [String: Any]) throws {
    let utterance = AVSpeechUtterance(string: try p.string("text"))
    if let id = p["voice"] as? String {
      guard
        let voice = AVSpeechSynthesisVoice(identifier: id) ?? AVSpeechSynthesisVoice(language: id)
      else { throw RpcError.invalid("Voice unavailable: \(id)") }
      utterance.voice = voice
    }
    synth.speak(utterance)
  }
  func stop() { synth.stopSpeaking(at: .immediate) }
}
