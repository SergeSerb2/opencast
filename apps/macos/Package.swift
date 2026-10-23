// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "OpenCast", platforms: [.macOS(.v14)],
  products: [
    .executable(name: "OpenCast", targets: ["OpenCast"]),
    .executable(name: "OpenCastSelfTest", targets: ["OpenCastSelfTest"]),
  ],
  dependencies: [
    .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.0"),
  ],
  targets: [
    .target(name: "OpenCastCore"),
    .executableTarget(
      name: "OpenCast",
      dependencies: ["OpenCastCore", .product(name: "Sparkle", package: "Sparkle")],
      linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]),
    .executableTarget(name: "OpenCastSelfTest", dependencies: ["OpenCastCore"]),
  ], swiftLanguageModes: [.v5])
