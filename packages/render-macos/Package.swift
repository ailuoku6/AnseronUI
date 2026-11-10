// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "AnseronUIRenderMacOS",
    platforms: [.macOS(.v14)],
    products: [.library(name: "AnseronUIRenderMacOS", targets: ["AnseronUIRenderMacOS"])],
    targets: [.systemLibrary(name: "AnseronUICoreC"), .target(name: "AnseronUIRenderMacOS", dependencies: ["AnseronUICoreC"])]
)
