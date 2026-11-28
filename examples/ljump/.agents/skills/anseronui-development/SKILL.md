---
name: anseronui-development
description: Build or edit shared AnseronUI TSX pages, components, hooks, styles and TypeScript in an app created with npx anseronui create.
---

# AnseronUI App Development

Use this skill for shared app pages. Read the generated `anseronui.config.json`, relevant source files and `package.json` before editing. Preserve AnseronUI's TSX and lifecycle model; do not assume React, React Native or browser semantics.

## TSX Compared With React

AnseronUI uses familiar JSX syntax and function components, but it is not a React renderer. The JSX is lowered by AnseronUI's compiler and statically compiled by scriptc to native or Wasm code. JSX syntax, TypeScript typechecking, or success in the Web reference runtime alone does not prove that a platform AOT build will work.

- Import UI components, types and hooks from `anseronui/ui`. Do not import React, React DOM or React Native for shared pages. The app uses AnseronUI's own component runtime and `react-jsx` is only the TypeScript JSX type/runtime configuration.
- Use `View`, `Text`, `RichText`, `TextInput`, `Button`, `ScrollView`, `Image`, `Video` and AnseronUI function components. Lowercase DOM tags such as `<div>` and `<input>` are not host elements. The shared Core has no `window`, `document`, `HTMLElement` or DOM event system.
- Use AnseronUI hooks such as `useState`, `useReducer`, `useRef`, `useEffect`, `useMemo`, `useCallback`, `useContext` and `useServices`. Hooks must run at the top level of a component or custom hook in a stable order. Do not call them in conditions, loops, event handlers or nested callbacks.
- `<View {...props} />` and other JSX spread attributes are unsupported by the current lowering. Forward known props explicitly. Namespaced JSX props and runtime-computed tag names are unsupported; use statically named components and explicit branches.
- AnseronUI `View` and JSX elements are not React elements. React classes and APIs such as `memo`, `forwardRef`, Suspense and React-specific libraries are not compatibility promises. Use the documented AnseronUI component, ref and slot APIs.
- `TextInput` is controlled: provide `value` and update it in `onChangeText`. Platform keyboard and media behavior is provided by native hosts and can differ.

## TypeScript and Runtime Limits

AnseronUI compiles a supported TypeScript/JavaScript subset. TypeScript declarations do not add missing runtime APIs, and a cast cannot make unsupported code compile or behave correctly.

- Prefer explicit, stable object shapes. Records with different layouts, dynamic writes to heterogeneous objects and casts between incompatible record shapes can fail or produce copies. Convert boundary data field by field.
- Narrow unions with `typeof` or a discriminant before using variant-specific fields; some union widening across different native representations is restricted. Keep generic helpers statically resolvable; avoid nested generic functions, generic class expressions, dynamic method dispatch and complex generic callbacks when a concrete helper is clearer.
- Parse external JSON as `unknown`, validate it, then narrow it. Avoid using `any` or assertions to hide unchecked input or compiler errors.
- Keep interface/class methods statically resolvable. Do not detach a method that depends on `this` as a callback (`onClick={() => instance.method()}` preserves its receiver); do not rely on runtime method mixing or replacement.
- Do not use generators, `eval`, `Function`/`new Function`, runtime-computed `import(path)`, Node `vm`, Node addons/islands, workers, sockets or filesystem APIs in shared Core. Static imports still need to be part of the configured build graph. Put device, file and platform-specific work in `useServices()` modules or native extensions.
- `async`/`await` and `Promise` are supported, but this does not enable all Node asynchronous APIs. Use `useServices().http` for HTTP; do not use `fetch` or Node networking in shared TSX. Use the AnseronUI `setTimeout`/`clearTimeout` adapter or `useTimers()`, not `setInterval`, Node timer objects or `timers/promises`.
- `useServices().invoke()` crosses an asynchronous host boundary. Arguments/results are JSON values only, not callbacks, functions, native objects, `BigInt` or cyclic data. Handle rejection and cancellation; component teardown cancels the waiter, but a native operation stops only if its host handler implements cancellation.
- Do not rely on `WeakRef` or garbage-collection finalizers (`FinalizationRegistry` cleanup callbacks do not run here) to release native resources. Cancel work and subscriptions in effect cleanup or call the owning service's explicit disposal API.
- Pages are compiled only when listed in `anseronui.config.json`. Adding a file without registering its `definePage` export does not add it to the app.
- Virtualized list rows may unmount offscreen, so their Hook state and refs are temporary. Keep selection, drafts and other durable row data in the parent model keyed by item identity.
- `createNativeComponent()` is a UI extension, while `useServices().invoke()` is a platform Module call. A native component needs a registered host implementation on each claimed platform; a Module needs a host handler and JSON protocol. Follow the native extension guide instead of assuming one platform implementation is portable.

## Implementation and Verification

1. Import runtime APIs from `anseronui/ui`; use `import type` for types such as `Style`, `UIElement` and `Component`.
2. Keep hooks at component top level. Keep native resources and subscriptions inside effects with cleanup.
3. For conditional UI, use explicit branches and stable component functions. Do not recreate HOC/component types during render.
4. Run `npm run typecheck`, then build and run the affected target (`npm run build:<platform>` and `npm run <platform>`). A typecheck is not an AOT build.
5. Confirm behavior in the target runtime. When a build diagnostic comes from TSX lowering or scriptc, use the first diagnostic and source location, then make a small reproduction.

Read the packaged [TypeScript / TSX reference](../../../node_modules/anseronui/dist/sdk/docs/reference/typescript.md), [component reference](../../../node_modules/anseronui/dist/sdk/docs/reference/components.md), [component composition guide](../../../node_modules/anseronui/dist/sdk/docs/guides/ui/component-composition.md), [styles](../../../node_modules/anseronui/dist/sdk/docs/guides/ui/styles.md), [events and gestures](../../../node_modules/anseronui/dist/sdk/docs/guides/ui/interactions.md), [virtual lists](../../../node_modules/anseronui/dist/sdk/docs/guides/ui/virtual-list.md), [services](../../../node_modules/anseronui/dist/sdk/docs/guides/services/native-services.md), [native extensions](../../../node_modules/anseronui/dist/sdk/docs/guides/services/native-extensions.md) or [timers](../../../node_modules/anseronui/dist/sdk/docs/guides/navigation/timers.md) when the task needs full API details.
