#!/usr/bin/env node
import path from 'node:path';
import {parseArgs} from 'node:util';
import {readProjectDocument} from './lib/development-gate.mjs';
import {captureBaseline} from './lib/execution-evidence.mjs';
try {
  const {values}=parseArgs({options:{'project-root':{type:'string',default:'.'},checkpoint:{type:'string'}}});
  const root=path.resolve(values['project-root']);const state=readProjectDocument(root,values.checkpoint);
  const excluded=[values.checkpoint,...state.slices.map(s=>s.review_ref),state.overall?.review_ref].filter(Boolean);
  console.log(JSON.stringify({baseline_snapshot_ref:captureBaseline(root,excluded),checkpoint_ref:values.checkpoint}));
}catch(error){console.error(error.message);process.exitCode=1;}
