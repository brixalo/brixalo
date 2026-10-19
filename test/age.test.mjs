// Interoperability proof for the age executable. No homemade cryptography.
import {spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'brixalo-age-'));const run=(bin,args)=>spawnSync(bin,args,{encoding:'utf8',timeout:10000});
const key=run('age-keygen',['-o',join(dir,'identity.txt')]);assert.equal(key.status,0,key.stderr);const recipient=key.stderr.match(/age1[a-z0-9]+/)[0];
const input=join(dir,'source.bin');const data=Buffer.from(Array.from({length:4096},(_,i)=>i%256));writeFileSync(input,data);
let r=run('age',['-r',recipient,'-o',join(dir,'source.age'),'--',input]);assert.equal(r.status,0,r.stderr);
r=run('age',['-d','-i',join(dir,'identity.txt'),'-o',join(dir,'roundtrip.bin'),'--',join(dir,'source.age')]);assert.equal(r.status,0,r.stderr);assert.deepEqual(readFileSync(join(dir,'roundtrip.bin')),data);
const wrong=run('age-keygen',['-o',join(dir,'wrong.txt')]);assert.equal(wrong.status,0);assert.notEqual(run('age',['-d','-i',join(dir,'wrong.txt'),join(dir,'source.age')]).status,0);
const tampered=readFileSync(join(dir,'source.age'));tampered[tampered.length-1]^=1;writeFileSync(join(dir,'tampered.age'),tampered);assert.notEqual(run('age',['-d','-i',join(dir,'identity.txt'),join(dir,'tampered.age')]).status,0);
assert.deepEqual(readFileSync(input),data);console.log('PASS age X25519 binary-file roundtrip; wrong identity and tampering rejected; original unchanged');
