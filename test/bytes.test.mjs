import assert from 'node:assert/strict';
import {bytesToBinary,binaryToBytes,bytesToHex,hexToBytes,textToBytes,bytesToText} from '../src/bytes.js';
for(const s of ['Hello','नमस्ते 👾','a\0b','']){assert.equal(bytesToText(binaryToBytes(bytesToBinary(textToBytes(s)))),s);assert.equal(bytesToText(hexToBytes(bytesToHex(textToBytes(s)))),s);}assert.throws(()=>binaryToBytes('101'));assert.throws(()=>hexToBytes('zz'));assert.throws(()=>bytesToText(new Uint8Array([255])));console.log('PASS Unicode text/binary/hex round trips; malformed byte input rejected');
