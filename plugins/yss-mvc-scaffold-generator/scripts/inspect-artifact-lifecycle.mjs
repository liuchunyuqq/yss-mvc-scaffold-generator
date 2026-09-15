#!/usr/bin/env node
import path from 'node:path';
import {inspectArtifactLifecycle} from './lib/artifact-lifecycle.mjs';
try { console.log(JSON.stringify(inspectArtifactLifecycle(path.resolve(process.argv[2]??'.')),null,2)); }
catch(error) {console.error(error.message);process.exitCode=1;}
