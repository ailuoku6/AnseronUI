import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('iOS sample project generation works in a clean checkout and can be repeated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'anseronui ios project '));
  try {
    const script = join(root, 'scripts/generate-ios-project.py');
    await mkdir(join(root, 'scripts'));
    await cp(new URL('../generate-ios-project.py', import.meta.url), script);
    const project = join(root, 'examples/native/ios/AnseronUIDemo.xcodeproj');
    for (let run = 0; run < 2; run++) {
      execFileSync('python3', [script], { stdio: 'pipe' });
      const pbxproj = await readFile(join(project, 'project.pbxproj'), 'utf8');
      assert.match(pbxproj, /"productType" = "com\.apple\.product-type\.application"/);
      assert.match(pbxproj, /"name" = "SharedCoreUITests"/);
      assert.match(pbxproj, /"name" = "RenderViewTests"/);
      const scheme = await readFile(join(project, 'xcshareddata/xcschemes/AnseronUIDemo.xcscheme'), 'utf8');
      assert.match(scheme, /BlueprintName="AnseronUIDemo"/);
      assert.match(scheme, /BlueprintName="SharedCoreUITests"/);
      assert.match(scheme, /BlueprintName="RenderViewTests"/);
      assert.equal((scheme.match(/<TestableReference skipped="NO">/g) ?? []).length, 2);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
