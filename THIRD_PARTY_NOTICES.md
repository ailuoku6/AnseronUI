# Licensing and third-party components

AnseronUI's own framework, CLI, and template code is licensed under the MIT License in `LICENSE`, copyright (c) 2026 AnseronUI contributors. This license applies to AnseronUI's own code; the third-party components below retain their respective licenses and copyright notices. The same scope applies to the `license: MIT` field in the npm package metadata.

Paths below are relative to the SDK root. In the npm package, the SDK root is `dist/sdk/`; after app setup, it is `.anseronui/sdk/`. The package also includes this document and the AnseronUI MIT license at its root.

## Flexily

Flexily 0.8.5 is licensed under MIT, copyright (c) 2026 Beorn. Its source comes from https://github.com/beorn/flexily at revision `4850f1fb475f8147458059b45fb4f148d14a6ab4`, with AnseronUI layout adaptations. Its original copyright and full permission notice are preserved in `packages/flexily/LICENSE`. Copies or substantial portions of Flexily must retain those notices.

## scriptc

scriptc 0.4.8 is licensed under Apache-2.0 and comes from https://github.com/vercel-labs/scriptc at revision `3d1888ae5e82a01434edd49f59bff5fab7c5a9c7`. Its adapted sources are included under `internal/toolchain/scriptc/`, and its full license is preserved in `internal/toolchain/scriptc/LICENSE` and the package-level license files.

AnseronUI's async embedding adaptations in that directory remain under Apache-2.0. Changed files carry modification notices; `internal/toolchain/async-embedding.patch` records the functional changes, and `internal/toolchain/scriptc.vendor.json` records their upstream provenance and the SDK source inventory. Preserve the Apache license, applicable upstream copyright and attribution notices, and modification notices when redistributing these sources. Apache-2.0 section 4 permits different terms for your own additions while requiring continued compliance for the Apache-licensed work. Its patent grant and termination terms also continue to apply.

scriptc's runtime includes additional third-party code. Its source provenance and license inventory are preserved in `internal/toolchain/scriptc/packages/runtime/vendor/README.md`; license texts remain alongside those sources, including MIT, BSD, ISC, zlib, Boost-1.0, Apache-2.0, and Unicode terms. Some derived-code notices are embedded in runtime source files. These components retain their own terms. When distributing an app containing compiled runtime code, retain the applicable notices and license texts with the app distribution.

For components with a choice of licenses, this distribution follows scriptc's selection: Mbed TLS is used under Apache-2.0, and Ryū is used under the Boost Software License 1.0.

The scriptc LLVM helper uses Apache-2.0 with the LLVM exception and includes its own third-party notices. LLVM helpers, runtime packs, TypeScript, Vite, pnpm, tsx, and other installed npm dependencies retain the licenses and notices shipped in their packages. Preserve the applicable terms when redistributing those dependencies or their code.

## Android Gradle wrapper

The Android template includes the Gradle wrapper under Apache-2.0. A copy of the license is included at `scripts/templates/app/platforms/android/LICENSE-Gradle`, and the original license headers remain in the launcher scripts. Gradle is downloaded by the wrapper and retains its own notices.
