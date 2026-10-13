import { execFileSync } from 'node:child_process';
const destination=process.argv[2];
if(!destination)throw new Error('Pass absolute output .zip path');
execFileSync('git',['archive','--format=zip',`--output=${destination}`,'HEAD']);
