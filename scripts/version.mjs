import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import './bundled-audio.mjs';
const git=(args,fallback)=>{try{return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return fallback;}};
const version={sha:(process.env.CF_PAGES_COMMIT_SHA||process.env.GITHUB_SHA||git(['rev-parse','HEAD'],'uncommitted')).slice(0,12),branch:process.env.CF_PAGES_BRANCH||process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME||git(['branch','--show-current'],'local'),builtAt:new Date().toISOString()};
writeFileSync('apps/web/src/version.json',JSON.stringify(version,null,2)+'\n');
writeFileSync('public/version.json',JSON.stringify(version,null,2)+'\n');
