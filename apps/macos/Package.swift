// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Surgecast", platforms: [.macOS(.v14)],
  products: [
    .executable(name: "Surgecast", targets: ["Surgecast"]),
    .executable(name: "SurgecastSelfTest", targets: ["SurgecastSelfTest"]),
  ],
  targets: [
    .target(name: "SurgecastCore"),
    .executableTarget(name: "Surgecast", dependencies: ["SurgecastCore"]),
    .executableTarget(name: "SurgecastSelfTest", dependencies: ["SurgecastCore"]),
  ], swiftLanguageModes: [.v5])
