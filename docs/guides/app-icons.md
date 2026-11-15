# 应用图标

独立应用在 `anseronui.config.json` 的 `app.icon` 中配置图标。`npm run check` 校验配置和图片；各平台 `build` 在打包时生成并接入资源。Web 的 `dev:web` 同样提供 favicon。

本功能面向 `anseronui create` 创建的应用，包括 `--local-framework` 工程。仓库自带的 iOS、Android、macOS 和 Web 演示宿主也读取根配置中的 `app.icon`。`integrate` 接入已有业务宿主时，图标仍由业务宿主负责。

## 新建 App 的默认图标

`anseronui create` 会自动复制一套蓝色 A 标志到 `assets/icons/`，并写入 `app.icon`，首次构建即可获得图标：

- `app.png`：1024 × 1024 不透明默认图，用于 iOS 浅色、Android 普通图标、macOS 和 Web。
- `app-dark.png`：iOS 深色图和 Android night 普通图。
- `app-tinted.png`：iOS 灰度着色图。
- `android-foreground.xml` / `android-monochrome.xml`：自适应前景和主题单色图层，背景随默认/night 资源配置。
- `app.svg`：可编辑的矢量源图；运行时使用 PNG 或原生 XML，SVG 不会自动转换。

这些是应用自己的源文件，应提交到应用仓库。可以直接替换图片或修改 `app.icon` 指向品牌资源；默认图标不需要额外下载。已有工程升级 SDK 后不会自动覆盖原图标。

仓库演示使用根目录 `assets/icons/` 中的同款资源；维护默认图稿可修改 `scripts/generate-default-icons.mjs`，运行 `node scripts/generate-default-icons.mjs` 同步生成演示和模板资源。

## 一张图片用于四端

准备一张 **1024 × 1024、没有透明像素的正方形 PNG**：

```json
{
  "app": {
    "name": "MyApp",
    "applicationId": "com.example.myapp",
    "framework": ".anseronui/sdk",
    "icon": "assets/icons/default.png"
  }
}
```

所有图标路径都相对于配置所在的应用目录，包括本地框架模式。不能引用 `.anseronui/` 内的缓存或生成文件。PNG 必须为正方形，最大 4096 × 4096；用于 iOS 图片模式的输入必须为 1024 × 1024。其他平台输入自动缩放，建议提供足够分辨率的源图。

此配置生成 iOS 默认图标、Android 各密度普通启动图标、macOS `.icns` 和 Web favicon。Android 自适应和主题图标需要专用配置。图标不需要再按普通图片资源规则手动复制到宿主。

未配置 `app.icon` 时保留宿主原有行为。删除配置后重新构建，会清理该目标生成的资源及引用；Web 默认构建也会清理上次的 favicon。`--no-build` 使用已有产物，修改图标后需要重新构建。

## 按平台配置

`app.icon` 可以使用对象。`default` 等价于单图用法，各平台配置优先于默认图片。可以只配置部分平台，未配置且没有 `default` 的平台保留宿主原有行为。

```json
{
  "app": {
    "icon": {
      "default": "assets/icons/default.png",
      "ios": {
        "type": "images",
        "light": "assets/icons/ios-light.png",
        "dark": "assets/icons/ios-dark.png",
        "tinted": "assets/icons/ios-tinted.png"
      },
      "android": {
        "legacy": "assets/icons/android-legacy.png",
        "adaptive": {
          "foreground": "assets/icons/android-foreground.png",
          "background": { "color": "#F4F6FA" },
          "monochrome": "assets/icons/android-monochrome.xml"
        },
        "night": {
          "background": { "color": "#15171C" }
        }
      },
      "macos": "assets/icons/mac.png",
      "web": "assets/icons/favicon.png"
    }
  }
}
```

`macos` 接受 PNG 或已有 `.icns`；`web` 接受 PNG，生成 256 × 256 favicon。Web 通过 CLI 的 Vite 插件接入，支持 `base` 子路径部署；直接调用 `vite` 时需自行接入图标。Web 开发时修改图片后刷新页面；修改配置路径则重启 `dev:web`。

## iOS 浅色、深色和着色图标

`ios.type` 默认为 `images`。要求 Xcode 16+，兼容应用现有的 iOS 15 最低部署版本；Dark / Tinted 外观由 iOS 18+ 使用，旧系统使用默认图标。

| 字段 | 含义与约束 |
| --- | --- |
| `light` | 默认 Any 外观；缺省使用 `default`；必须不含透明像素 |
| `dark` | 可选 Dark 外观；允许透明像素 |
| `tinted` | 可选 Tinted 外观；可见像素必须为灰度，允许透明像素，由系统着色 |

三张图片均需为 1024 × 1024 PNG。默认图片导出时去除 alpha 通道；其他变体保留透明度。不要预先裁出系统圆角。

深色与着色图稿由设计师提供，构建器不会自动反色或转成单色。缺少变体时由系统决定回退或派生外观。图标外观取决于用户的主屏幕设置，用户可以固定浅色、深色或选择自动；它不绑定到 App 内部主题。

### Icon Composer 与 Liquid Glass

复杂分层、材质、深色和单色外观可在 Apple Icon Composer 中制作，再接入完整 `.icon` 包，要求 **Xcode 26+**：

```json
{
  "app": {
    "icon": {
      "default": "assets/icons/default.png",
      "ios": {
        "type": "composer",
        "source": "assets/icons/AppIcon.icon"
      }
    }
  }
}
```

`.icon` 在 Finder 中显示为文件，实际是包含 `icon.json` 及图层资源的目录，应完整提交到版本控制。框架复制整个包并加入 Xcode 资源编译，由 Apple 工具处理各外观及旧系统兼容图像。此模式不能同时配置 `light`、`dark`、`tinted`。示例中的 `default` 供其他平台使用，不作为 iOS Composer 的旧系统替代图稿。

### 已有 AppIcon 图标集

需要精确控制原生尺寸、设备或外观时，可以接入已有 `.appiconset`。下面为 `app.icon` 内的片段：

```json
{
  "ios": {
    "type": "appiconset",
    "source": "assets/icons/Brand.appiconset"
  }
}
```

目录必须包含 `Contents.json` 和其引用图片，构建时统一以 `AppIcon` 名称放入生成的 Asset Catalog。原生字段、图片规范与部署版本兼容性由 Xcode 校验；框架不重写图稿。不能与 `light`、`dark`、`tinted` 混用。

## Android 自适应与主题图标

当前模板最低 Android 8.0 / API 26，编译 SDK 35。配置 `adaptive` 后生成 API 26 自适应图标；提供 `monochrome` 后另生成 API 33 主题图标资源。

| 字段 | 作用 |
| --- | --- |
| `legacy` | 普通 PNG，缺省使用 `default`；生成 mdpi 至 xxxhdpi 的 48–192 px 图片 |
| `round` | 可选的独立圆形 PNG，作为 `android:roundIcon`；未配置时引用主图标 |
| `adaptive.foreground` | 必填前景，透明 PNG 或 Android Vector Drawable XML |
| `adaptive.background` | 必填背景，`{ "color": "#RRGGBB" }`、`{ "color": "#AARRGGBB" }` 或 `{ "image": "..." }`，颜色和图片二选一 |
| `adaptive.monochrome` | 可选单色图层，透明 PNG 或 Vector Drawable XML，供系统着色 |

`legacy` 与 `adaptive` 至少有一个，也可同时存在。支持自适应资源的设备通常优先使用自适应图标。`round` 为独立 PNG，不自动从前景层生成圆形设计。

PNG 自适应图层代表 **108 × 108 dp 完整画布**，按密度生成 108–432 px 图片，不额外插入边距。核心内容应放在中央直径 66 dp 的安全区内，避免被设备遮罩裁切；背景覆盖完整画布。矢量图建议 viewport 为 `108 × 108`，宽高为 `108dp`。

单色图层应以透明背景和 alpha 轮廓表达标志及镂空，避免整块不透明背景的黑白图。系统和 Launcher 根据壁纸、主题及深浅外观配色，要求用户启用主题图标且桌面支持。构建器不会从彩色图标自动推导主题图稿。

支持原生 Vector Drawable XML；通用 SVG 不会自动转成 Android XML。引用其他原生资源的复杂矢量图，使用下方完整目录方式。

### night 覆盖

下面为 `app.icon` 内的 Android 片段：

```json
{
  "android": {
    "legacy": "assets/icons/android-light.png",
    "adaptive": {
      "foreground": "assets/icons/foreground.xml",
      "background": { "color": "#FFFFFF" },
      "monochrome": "assets/icons/mono.xml"
    },
    "night": {
      "legacy": "assets/icons/android-dark.png",
      "foreground": "assets/icons/foreground-dark.xml",
      "background": { "image": "assets/icons/background-dark.png" },
      "monochrome": "assets/icons/mono-dark.xml"
    }
  }
}
```

`night` 中各字段可选，还支持 `night.round`，未覆盖部分沿用默认资源。`legacy`、`round`、`monochrome` 覆盖要求存在对应默认资源；前景和背景覆盖要求存在 `adaptive`。

**night 资源不保证所有桌面即时换图。** 框架生成合法的 `-night` 资源，但不同 Launcher 的资源选择、缓存和刷新时机不同，有些桌面不会在系统切换暗黑后立即更换彩色图标。适配系统主题时优先提供 `adaptive.monochrome`；指定品牌深色彩色图稿时再加 night，并在目标设备验证。App 的 DayNight 主题不能替代桌面对图标的处理。

### 完整 Android 原生资源目录

复杂矢量、资源引用、额外 qualifier 或手工图标集，可以直接提供 `res` 风格目录：

```json
{
  "android": {
    "resources": "assets/icons/android-res"
  }
}
```

此为 `app.icon` 内的片段。目录需包含 `mipmap-anydpi-v26/ic_launcher.xml`、`mipmap-anydpi/ic_launcher.xml` 或 `mipmap-mdpi/ic_launcher.png`，并定义引用的 drawable、color 等资源。可以额外定义 `ic_launcher_round`。框架复制完整目录并接入 Gradle，资源完整性与原生格式由 Android 构建工具校验。不能与 `legacy`、`round`、`adaptive`、`night` 混用，目录内不支持符号链接。

## 生成资源与旧工程

生成文件位于 `.anseronui/icons/`，不应手工修改或提交：

| 平台 | 生成与接入 |
| --- | --- |
| iOS | `ios/Assets.xcassets` 或 `ios/AppIcon.icon`，加入工程 Resources 阶段及 AppIcon 编译设置 |
| Android | `android/res`、图标 Manifest overlay 和 `android.gradle`，保留插件权限声明 |
| macOS | `macos/AppIcon.icns`，复制入 Resources 并设置 `CFBundleIconFile`；图标输入参与已有构建校验 |
| Web | `web/anseronui-icon.png`，输出到 Web 产物并向 HTML 注入 favicon |

升级 SDK 后先 `npm run setup`，再配置并重新构建。旧的 `create` 工程无需重建：iOS 在原有工程生成器执行后补入图标引用；Android 首次带图标构建时向 `platforms/android/app/build.gradle` 追加一次条件加载代码，该小段应提交到业务仓库。原始 Manifest、Info.plist 和自定义资源不被覆盖。删除配置后，条件加载保留，生成脚本变为无操作。

若宿主已有其他 AppIcon 资源，应先移除冲突的手工主图标设置。自定义 Android Gradle 若在追加接入点之后重新设置 Manifest 或资源目录，需自行协调顺序。

本功能提供构建时主图标和外观变体，不包含动态切换 Alternate App Icons / Activity Alias 的运行时 API，也不包含 App Store、Google Play 素材上传。

## 验证

```sh
npm run check
npm run build:ios
npm run build:android
```

`check` 不依赖 Xcode 或 Android SDK，检查未知字段、路径、PNG 格式／尺寸、iOS 默认图透明度及 Tinted 灰度、互斥字段等。原生目录及 Composer 的完整平台语义由相应构建工具进一步校验。构建时检查 iOS 图片模式 Xcode 16+、Composer 模式 Xcode 26+。

发布前应在设备检查 iOS 浅色／深色／着色及 Composer 外观，Android 多种遮罩、主题图标开关、暗黑切换。资源编译通过不能替代桌面视觉验证。

维护时 `npm run test:tooling` 包含图标配置、生成及 Web 接入测试；完整工具链环境可执行原生资源编译测试：

```sh
ANSERONUI_TEST_NATIVE_ICONS=1 node --test scripts/app-icons.test.mjs
```

原生 Android 测试使用 SDK 35、build-tools 35.0.0，并按 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 查找 SDK。

平台规则参考：[Apple Asset Catalog](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)、[Icon Composer](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer)、[Android Adaptive Icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)。
