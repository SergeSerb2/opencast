// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "OpenCast", platforms: [.macOS(.v14)],
  products: [
    .executable(name: "OpenCast", targets: ["OpenCast"]),
    .executable(name: "OpenCastSelfTest", targets: ["OpenCastSelfTest"]),
  ],
  targets: [
    .target(name: "OpenCastCore"),
    .executableTarget(name: "OpenCast", dependencies: ["OpenCastCore"]),
    .executableTarget(name: "OpenCastSelfTest", dependencies: ["OpenCastCore"]),
  ], swiftLanguageModes: [.v5])
