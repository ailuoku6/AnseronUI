"""Generate this app’s Xcode project using the configured local framework."""
from pathlib import Path
import json
import shutil
import shlex
import os
import plistlib
root = Path(__file__).resolve().parent.parent
config = json.loads((root/'anseronui.config.json').read_text())
framework = (root/config['app']['framework']).resolve()
ios = root/'platforms/ios'
def framework_path(path):
    return os.path.relpath(framework/path, ios)
objects = {}
def add(kind, **values):
    key = f'{len(objects)+1:024X}'
    objects[key] = {'isa': kind, **values}
    return key
plugin_dir = root/'.anseronui/plugins'
plugins = json.loads((plugin_dir/'ios.json').read_text())
with (ios/'Info.plist').open('rb') as file:
    info = plistlib.load(file)
# App-owned descriptions take precedence over library defaults.
info = {**plugins['infoPlist'], **info}
with (plugin_dir/'Info.plist').open('wb') as file:
    plistlib.dump(info, file)
files = []
build_files = []
source_inputs = [
    ('App.swift', 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/Extensions.swift'), 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/StandardServices.swift'), 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/ApplicationServices.swift'), 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/RadioServices.swift'), 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/Renderer.swift'), 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/Animation.swift'), 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/IOSHost.swift'), 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/AnseronUIRenderView.swift'), 'sourcecode.swift'),
    (framework_path('packages/render-ios/Sources/AnseronUIRenderIOS/NativeCore.swift'), 'sourcecode.swift'),
    (framework_path('packages/core/native/transport.c'), 'sourcecode.c.c'),
]
source_inputs += [(os.path.relpath(plugin_dir/'GeneratedPlugins.swift', ios), 'sourcecode.swift')]
source_inputs += [(os.path.relpath(path, ios), 'sourcecode.swift') for path in plugins['sources']]
for path, filetype in source_inputs:
    ref = add('PBXFileReference', lastKnownFileType=filetype, path=path, sourceTree='SOURCE_ROOT')
    files.append(ref)
    build_files.append(add('PBXBuildFile', fileRef=ref))
product = add('PBXFileReference', explicitFileType='wrapper.application', path='App.app', sourceTree='BUILT_PRODUCTS_DIR')
products = add('PBXGroup', children=[product], name='Products', sourceTree='<group>')
group = add('PBXGroup', children=[*files, products], sourceTree='<group>')
sources = add('PBXSourcesBuildPhase', buildActionMask='2147483647', files=build_files, runOnlyForDeploymentPostprocessing='0')
settings = {
    'PRODUCT_NAME': 'App', 'PRODUCT_BUNDLE_IDENTIFIER': config['app']['applicationId'],
    'INFOPLIST_FILE': '../../.anseronui/plugins/Info.plist', 'SDKROOT': 'iphoneos', 'SUPPORTED_PLATFORMS': 'iphoneos iphonesimulator',
    'IPHONEOS_DEPLOYMENT_TARGET': '15.0', 'TARGETED_DEVICE_FAMILY': '1,2',
    'ARCHS': 'arm64', 'SWIFT_VERSION': '5.0', 'CLANG_ENABLE_MODULES': 'YES', 'CODE_SIGN_STYLE': 'Automatic',
    'HEADER_SEARCH_PATHS': ['$(inherited)', '$(SRCROOT)/' + framework_path('packages/core/native/include')],
    'SWIFT_INCLUDE_PATHS': ['$(inherited)', '$(SRCROOT)/' + framework_path('packages/render-ios/Sources/AnseronUICoreC')],
    'CORE_LIBRARY': '$(SRCROOT)/../../.verification/core-ios-device/entry.lib.a',
    'CORE_LIBRARY[sdk=iphonesimulator*]': '$(SRCROOT)/../../.verification/core-ios-simulator/entry.lib.a',
}
settings['OTHER_LDFLAGS'] = ['$(inherited)'] + [flag for name in plugins['frameworks'] for flag in ['-framework', name]]
configs = [add('XCBuildConfiguration', name=name, buildSettings={**settings, 'SWIFT_OPTIMIZATION_LEVEL': '-Onone' if name=='Debug' else '-O', 'ENABLE_TESTABILITY': 'YES' if name=='Debug' else 'NO'}) for name in ['Debug', 'Release']]
config_list = add('XCConfigurationList', buildConfigurations=configs, defaultConfigurationIsVisible='0', defaultConfigurationName='Release')
core_ref = add('PBXFileReference', lastKnownFileType='archive.ar', path='$(CORE_LIBRARY)', sourceTree='<absolute>')
objects[group]['children'].append(core_ref)
frameworks = add('PBXFrameworksBuildPhase', buildActionMask='2147483647', files=[add('PBXBuildFile', fileRef=core_ref)], runOnlyForDeploymentPostprocessing='0')
asset_ref = add('PBXFileReference', lastKnownFileType='folder', path='../../assets', sourceTree='SOURCE_ROOT')
objects[group]['children'].append(asset_ref)
manifest_ref = add('PBXFileReference', lastKnownFileType='text.json', path='core.manifest.json', sourceTree='SOURCE_ROOT')
objects[group]['children'].append(manifest_ref)
resources = add('PBXResourcesBuildPhase', buildActionMask='2147483647', files=[add('PBXBuildFile', fileRef=asset_ref), add('PBXBuildFile', fileRef=manifest_ref)], runOnlyForDeploymentPostprocessing='0')
check_core = add('PBXShellScriptBuildPhase', name='Verify Core matches sources', buildActionMask='2147483647', files=[], inputPaths=[], outputPaths=[], alwaysOutOfDate='1', shellPath='/bin/sh', shellScript=f'exec {shlex.quote(shutil.which("node") or "node")} "$SRCROOT/../../scripts/check-ios-core.mjs"\n', runOnlyForDeploymentPostprocessing='0')
target = add('PBXNativeTarget', buildConfigurationList=config_list, buildPhases=[check_core, sources, frameworks, resources], buildRules=[], dependencies=[], name='App', productName='App', productReference=product, productType='com.apple.product-type.application')
pc = [add('XCBuildConfiguration', name=name, buildSettings={'ALWAYS_SEARCH_USER_PATHS':'NO'}) for name in ['Debug', 'Release']]
pl = add('XCConfigurationList', buildConfigurations=pc, defaultConfigurationIsVisible='0', defaultConfigurationName='Release')
project = add('PBXProject', attributes={'LastUpgradeCheck':'1600'}, buildConfigurationList=pl, compatibilityVersion='Xcode 14.0', developmentRegion='en', hasScannedForEncodings='0', knownRegions=['en', 'Base'], mainGroup=group, productRefGroup=products, projectDirPath='', projectRoot='', targets=[target])
def encode(value):
    if isinstance(value, dict): return '{\n' + ''.join(f'{json.dumps(k)} = {encode(v)};\n' for k,v in value.items()) + '}'
    if isinstance(value, list): return '(' + ', '.join(encode(v) for v in value) + ')'
    return json.dumps(value)
path = root/'platforms/ios/App.xcodeproj/project.pbxproj'
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text('// !$*UTF8*$!\n'+encode({'archiveVersion':'1','classes':{},'objectVersion':'56','objects':objects,'rootObject':project})+'\n')
print(path)

scheme = path.parent/'xcshareddata/xcschemes/App.xcscheme'
scheme.parent.mkdir(parents=True, exist_ok=True)
def reference(identifier, name):
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{identifier}" BuildableName="{name}" BlueprintName="{objects[identifier]["name"]}" ReferencedContainer="container:App.xcodeproj"/>'
scheme.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference(target, 'App.app')}</BuildActionEntry></BuildActionEntries></BuildAction>

<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference(target, 'App.app')}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release"/><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''')
