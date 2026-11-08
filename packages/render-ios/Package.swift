// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AnseronUIRenderIOS",
    platforms: [.iOS(.v15)],
    products: [.library(name: "AnseronUIRenderIOS", targets: ["AnseronUIRenderIOS"])],
    targets: [.systemLibrary(name: "AnseronUICoreC"), .target(name: "AnseronUIRenderIOS", dependencies: ["AnseronUICoreC"])]
)
