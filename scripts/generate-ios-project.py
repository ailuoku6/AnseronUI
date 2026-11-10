"""Generate the small sample Xcode project without third-party project tools."""
from pathlib import Path
import json
import shutil
import shlex
root = Path(__file__).resolve().parent.parent
objects = {}
def add(kind, **values):
    key = f'{len(objects)+1:024X}'
    objects[key] = {'isa': kind, **values}
    return key
files = []
build_files = []
for path, filetype in [
    ('App.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/Extensions.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/StandardServices.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/ApplicationServices.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/RadioServices.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/Renderer.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/Animation.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/IOSHost.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/AnseronUIRenderView.swift', 'sourcecode.swift'),
    ('../../../packages/render-ios/Sources/AnseronUIRenderIOS/NativeCore.swift', 'sourcecode.swift'),
    ('../../../packages/core/native/transport.c', 'sourcecode.c.c'),
]:
    ref = add('PBXFileReference', lastKnownFileType=filetype, path=path, sourceTree='SOURCE_ROOT')
    files.append(ref)
    build_files.append(add('PBXBuildFile', fileRef=ref))
product = add('PBXFileReference', explicitFileType='wrapper.application', path='AnseronUIDemo.app', sourceTree='BUILT_PRODUCTS_DIR')
products = add('PBXGroup', children=[product], name='Products', sourceTree='<group>')
group = add('PBXGroup', children=[*files, products], sourceTree='<group>')
sources = add('PBXSourcesBuildPhase', buildActionMask='2147483647', files=build_files, runOnlyForDeploymentPostprocessing='0')
settings = {
    'PRODUCT_NAME': 'AnseronUIDemo', 'PRODUCT_BUNDLE_IDENTIFIER': 'org.anseronui.demo',
    'INFOPLIST_FILE': 'Info.plist', 'SDKROOT': 'iphoneos', 'SUPPORTED_PLATFORMS': 'iphoneos iphonesimulator',
    'IPHONEOS_DEPLOYMENT_TARGET': '15.0', 'TARGETED_DEVICE_FAMILY': '1,2',
    'ARCHS': 'arm64', 'SWIFT_VERSION': '5.0', 'CLANG_ENABLE_MODULES': 'YES', 'CODE_SIGN_STYLE': 'Automatic',
    'HEADER_SEARCH_PATHS': ['$(inherited)', '$(SRCROOT)/../../../packages/core/native/include'],
    'SWIFT_INCLUDE_PATHS': ['$(inherited)', '$(SRCROOT)/../../../packages/render-ios/Sources/AnseronUICoreC'],
    'CORE_LIBRARY': '$(SRCROOT)/../../../.verification/core-ios-device/entry.lib.a',
    'CORE_LIBRARY[sdk=iphonesimulator*]': '$(SRCROOT)/../../../.verification/core-ios-simulator/entry.lib.a',
}
configs = [add('XCBuildConfiguration', name=name, buildSettings={**settings, 'SWIFT_OPTIMIZATION_LEVEL': '-Onone' if name=='Debug' else '-O', 'ENABLE_TESTABILITY': 'YES' if name=='Debug' else 'NO'}) for name in ['Debug', 'Release']]
config_list = add('XCConfigurationList', buildConfigurations=configs, defaultConfigurationIsVisible='0', defaultConfigurationName='Release')
core_ref = add('PBXFileReference', lastKnownFileType='archive.ar', path='$(CORE_LIBRARY)', sourceTree='<absolute>')
objects[group]['children'].append(core_ref)
frameworks = add('PBXFrameworksBuildPhase', buildActionMask='2147483647', files=[add('PBXBuildFile', fileRef=core_ref)], runOnlyForDeploymentPostprocessing='0')
asset_ref = add('PBXFileReference', lastKnownFileType='folder', path='../../components/assets', sourceTree='SOURCE_ROOT')
objects[group]['children'].append(asset_ref)
manifest_ref = add('PBXFileReference', lastKnownFileType='text.json', path='core.manifest.json', sourceTree='SOURCE_ROOT')
objects[group]['children'].append(manifest_ref)
resources = add('PBXResourcesBuildPhase', buildActionMask='2147483647', files=[add('PBXBuildFile', fileRef=asset_ref), add('PBXBuildFile', fileRef=manifest_ref)], runOnlyForDeploymentPostprocessing='0')
check_core = add('PBXShellScriptBuildPhase', name='Verify Core matches sources', buildActionMask='2147483647', files=[], inputPaths=[], outputPaths=[], alwaysOutOfDate='1', shellPath='/bin/sh', shellScript=f'exec {shlex.quote(shutil.which("node") or "node")} "$SRCROOT/../../../scripts/check-ios-core.mjs"\n', runOnlyForDeploymentPostprocessing='0')
target = add('PBXNativeTarget', buildConfigurationList=config_list, buildPhases=[check_core, sources, frameworks, resources], buildRules=[], dependencies=[], name='AnseronUIDemo', productName='AnseronUIDemo', productReference=product, productType='com.apple.product-type.application')
test_ref = add('PBXFileReference', lastKnownFileType='sourcecode.swift', path='SharedCoreUITests.swift', sourceTree='SOURCE_ROOT')
objects[group]['children'].append(test_ref)
test_product = add('PBXFileReference', explicitFileType='wrapper.cfbundle', path='SharedCoreUITests.xctest', sourceTree='BUILT_PRODUCTS_DIR')
objects[products]['children'].append(test_product)
test_sources = add('PBXSourcesBuildPhase', buildActionMask='2147483647', files=[add('PBXBuildFile', fileRef=test_ref)], runOnlyForDeploymentPostprocessing='0')
test_settings = {'PRODUCT_NAME':'SharedCoreUITests', 'PRODUCT_BUNDLE_IDENTIFIER':'org.anseronui.demo.uitests', 'GENERATE_INFOPLIST_FILE':'YES', 'SDKROOT':'iphoneos', 'IPHONEOS_DEPLOYMENT_TARGET':'15.0', 'TARGETED_DEVICE_FAMILY':'1,2', 'SWIFT_VERSION':'5.0', 'TEST_TARGET_NAME':'AnseronUIDemo', 'CODE_SIGN_STYLE':'Automatic'}
test_configs = [add('XCBuildConfiguration', name=name, buildSettings=test_settings) for name in ['Debug','Release']]
test_list = add('XCConfigurationList', buildConfigurations=test_configs, defaultConfigurationIsVisible='0', defaultConfigurationName='Release')
dependency = add('PBXTargetDependency', target=target)
test_target = add('PBXNativeTarget', buildConfigurationList=test_list, buildPhases=[test_sources], buildRules=[], dependencies=[dependency], name='SharedCoreUITests', productName='SharedCoreUITests', productReference=test_product, productType='com.apple.product-type.bundle.ui-testing')
unit_ref = add('PBXFileReference', lastKnownFileType='sourcecode.swift', path='RenderViewTests.swift', sourceTree='SOURCE_ROOT')
objects[group]['children'].append(unit_ref)
unit_product = add('PBXFileReference', explicitFileType='wrapper.cfbundle', path='RenderViewTests.xctest', sourceTree='BUILT_PRODUCTS_DIR')
objects[products]['children'].append(unit_product)
unit_sources = add('PBXSourcesBuildPhase', buildActionMask='2147483647', files=[add('PBXBuildFile', fileRef=unit_ref)], runOnlyForDeploymentPostprocessing='0')
unit_settings = {**test_settings, 'PRODUCT_NAME': 'RenderViewTests', 'PRODUCT_BUNDLE_IDENTIFIER': 'org.anseronui.demo.renderviewtests', 'TEST_HOST': '$(BUILT_PRODUCTS_DIR)/AnseronUIDemo.app/AnseronUIDemo', 'BUNDLE_LOADER': '$(TEST_HOST)', 'SWIFT_INCLUDE_PATHS': settings['SWIFT_INCLUDE_PATHS'], 'HEADER_SEARCH_PATHS': settings['HEADER_SEARCH_PATHS']}
unit_configs = [add('XCBuildConfiguration', name=name, buildSettings=unit_settings) for name in ['Debug', 'Release']]
unit_list = add('XCConfigurationList', buildConfigurations=unit_configs, defaultConfigurationIsVisible='0', defaultConfigurationName='Release')
unit_dependency = add('PBXTargetDependency', target=target)
unit_target = add('PBXNativeTarget', buildConfigurationList=unit_list, buildPhases=[unit_sources], buildRules=[], dependencies=[unit_dependency], name='RenderViewTests', productName='RenderViewTests', productReference=unit_product, productType='com.apple.product-type.bundle.unit-test')
pc = [add('XCBuildConfiguration', name=name, buildSettings={'ALWAYS_SEARCH_USER_PATHS':'NO'}) for name in ['Debug', 'Release']]
pl = add('XCConfigurationList', buildConfigurations=pc, defaultConfigurationIsVisible='0', defaultConfigurationName='Release')
project = add('PBXProject', attributes={'LastUpgradeCheck':'1600'}, buildConfigurationList=pl, compatibilityVersion='Xcode 14.0', developmentRegion='en', hasScannedForEncodings='0', knownRegions=['en', 'Base'], mainGroup=group, productRefGroup=products, projectDirPath='', projectRoot='', targets=[target, test_target, unit_target])
def encode(value):
    if isinstance(value, dict): return '{\n' + ''.join(f'{json.dumps(k)} = {encode(v)};\n' for k,v in value.items()) + '}'
    if isinstance(value, list): return '(' + ', '.join(encode(v) for v in value) + ')'
    return json.dumps(value)
path = root/'examples/native/ios/AnseronUIDemo.xcodeproj/project.pbxproj'
path.write_text('// !$*UTF8*$!\n'+encode({'archiveVersion':'1','classes':{},'objectVersion':'56','objects':objects,'rootObject':project})+'\n')
print(path)

scheme = path.parent/'xcshareddata/xcschemes/AnseronUIDemo.xcscheme'
scheme.parent.mkdir(parents=True, exist_ok=True)
def reference(identifier, name):
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{identifier}" BuildableName="{name}" BlueprintName="{objects[identifier]["name"]}" ReferencedContainer="container:AnseronUIDemo.xcodeproj"/>'
scheme.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference(target, 'AnseronUIDemo.app')}</BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB"><Testables><TestableReference skipped="NO">{reference(test_target, 'SharedCoreUITests.xctest')}</TestableReference><TestableReference skipped="NO">{reference(unit_target, 'RenderViewTests.xctest')}</TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference(target, 'AnseronUIDemo.app')}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release"/><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''')
