import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tempRepo, put } from './helpers.mjs';
import { initialize } from '../src/init.mjs';
import { loadConfig } from '../src/config.mjs';
import { writeJson } from '../src/lib/fs.mjs';
import { scan } from '../src/scanner.mjs';

test('project-native evidence can feed graph/runtime findings without code execution', () => {
  const root=tempRepo(); initialize(root,{existing:true});
  put(root,'src/index.ts','export const root = true;\n');
  writeJson(path.join(root,'.greenroom/evidence/graft.json'),{
    version:1,provider:'graft',capabilities:['code-graph'],findings:[{
      kind:'unused-file',confidence:'high',severity:'warning',action:'human-review-required',scope:{files:['src/legacy.ts']},message:'Graft sees no production caller'
    }]
  });
  const result=scan(root,loadConfig(root),{includeProviders:true});
  const hit=result.findings.find((x)=>x.kind==='unused-file' && x.scope.files.includes('src/legacy.ts'));
  assert.ok(hit);
  assert.ok(hit.evidence.some((x)=>x.provider==='graft'));
});
