// Bounded candidate decoding, not cryptanalysis. Scores are only heuristics.
import {bytesToText,textToBytes,bytesToHex,hexToBytes,bytesToBinary,binaryToBytes} from './bytes.js';
const shift=(s,n)=>s.replace(/[a-z]/gi,c=>String.fromCharCode((c.charCodeAt(0)-(c<='Z'?65:97)+n+26)%26+(c<='Z'?65:97)));
const atbash=s=>s.replace(/[a-z]/gi,c=>String.fromCharCode((c<='Z'?90:122)-(c.charCodeAt(0)-(c<='Z'?65:97))));
const MORSE={'.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z','-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9'};
function baseDecode(s,alphabet,bits){let buffer=0,n=0,out=[];for(const c of s.replace(/=+$/,'')){const v=alphabet.indexOf(c);if(v<0)throw Error('Invalid alphabet');buffer=(buffer<<bits)|v;n+=bits;while(n>=8){n-=8;out.push((buffer>>n)&255);}}return new Uint8Array(out);}
function base58(s){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of s){const v=alphabet.indexOf(c);if(v<0)throw Error('Invalid Base58');n=n*58n+BigInt(v);}const out=[];while(n>0){out.unshift(Number(n&255n));n>>=8n;}for(const c of s){if(c!=='1')break;out.unshift(0);}return new Uint8Array(out);}
function score(s){if(!s.length)return 0;const readable=[...s].filter(c=>c==='\n'||c==='\t'||(!/\p{C}/u.test(c))).length/[...s].length;const english=(s.match(/\b(the|and|hello|world|this|is|to|a|of|you|secret|message|test|file)\b/gi)||[]).length;return Math.round(readable*60+Math.min(35,english*7)+Math.min(5,(s.match(/ /g)||[]).length));}
export function decodeCandidates(input){
 if(input.length>16384)throw Error('Auto-detect is limited to 16 KiB.');
 const s=input.trim(),out=[],seen=new Set();
 function add(label,fn){try{const value=fn();if(!value||value===s||seen.has(value)||score(value)<45)return;seen.add(value);out.push({label,value,score:score(value)});}catch{}}
 if(/^[a-f\d\s]+$/i.test(s)&&s.replace(/\s/g,'').length%2===0)add('Hex → UTF-8',()=>bytesToText(hexToBytes(s)));
 if(/^[01\s]+$/.test(s))add('8-bit binary → UTF-8',()=>bytesToText(binaryToBytes(s)));
 if(/^[a-z\d+/_=-]+$/i.test(s)&&s.length>=4)add('Base64 → UTF-8',()=>bytesToText(baseDecode(s.replace(/-/g,'+').replace(/_/g,'/'),'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',6)));
 if(/^[A-Z2-7=]+$/.test(s)&&s.length>=8)add('Base32 → UTF-8',()=>bytesToText(baseDecode(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',5)));
 if(s.length<=2048&&/^[1-9A-HJ-NP-Za-km-z]+$/.test(s))add('Base58 → UTF-8',()=>bytesToText(base58(s)));
 if(/%[a-f\d]{2}|\+/.test(s))add('URL percent encoding',()=>decodeURIComponent(s.replace(/\+/g,' ')));
 if(/&(?:#\d+|#x[a-f\d]+|amp|lt|gt|quot|apos);/i.test(s))add('HTML entities (plain text)',()=>s.replace(/&(#x[a-f\d]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,x)=>{if(x[0]==='#'){const n=x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):parseInt(x.slice(1),10);return String.fromCodePoint(n);}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x.toLowerCase()];}));
 if(/^[.\- /]+$/.test(s))add('Morse (spaces between letters, / between words)',()=>s.split(/\s*\/\s*/).map(w=>w.trim().split(/\s+/).map(c=>{if(!MORSE[c])throw Error();return MORSE[c];}).join('')).join(' '));
 if(/[a-z]/i.test(s)){for(let n=1;n<26;n++)add(`Caesar shift ${n} (toy)`,()=>shift(s,n));add('Atbash (toy)',()=>atbash(s));}
 const hash=[];if(/^[a-f\d]+$/i.test(s)){for(const [len,label]of [[32,'MD5-sized'],[40,'SHA-1-sized'],[64,'SHA-256-sized'],[128,'SHA-512-sized']])if(s.length===len)hash.push(`${label} hex pattern, not proof of a hash. Hashes are not reversible.`);}
 return {candidates:out.sort((a,b)=>b.score-a.score).slice(0,12),hints:hash};
}
export function toyEncode(text){return 'BRX-TOY1:'+bytesToHex(textToBytes(shift(text,13))).split(' ').reverse().join('');}
export function toyDecode(text){if(!text.startsWith('BRX-TOY1:'))throw Error('Not a BRX-TOY1 toy string');const h=text.slice(9);if(!/^(?:[a-f\d]{2})*$/i.test(h))throw Error('Malformed toy bytes');return shift(bytesToText(hexToBytes((h.match(/../g)||[]).reverse().join(''))),13);}
export function initDecoder(){
 const dialog=document.getElementById('decoder-dialog'),body=document.getElementById('decoder-body');document.getElementById('close-decoder').onclick=()=>dialog.close();
 document.getElementById('decoder-tool').onclick=()=>{
  dialog.showModal();body.innerHTML='<h2>Decode text</h2><p>Paste text. See the best guess. Stays on your computer.</p><textarea id="decode-input" class="byte-preview" aria-label="Unknown encoded text" maxlength="16384" placeholder="Paste up to 16 KiB of unknown text"></textarea><button id="decode-run">Decode</button><p class="decode-note">Known encodings only. Real encryption needs its key. Results can be wrong.</p><div id="decode-results" role="status"></div><details><summary>Brixalo cipher: Experimental</summary><p>ROT13 + reversed hex bytes. Decorative obfuscation, easy to reverse. Never use for passwords, private messages or corporate files.</p><button id="toy-encode">Toy encode</button> <button id="toy-decode">Toy decode</button></details>';
  const result=document.getElementById('decode-results');function display(items,hints=[]){result.replaceChildren();for(const hint of hints){const p=document.createElement('p');p.textContent=hint;result.append(p);}const render=(c,parent)=>{const h=document.createElement('p');h.className='decode-label';h.textContent=c.label+(c.score?` · best guess, ${c.score}/100`:'');const pre=document.createElement('pre');pre.textContent=c.value;parent.append(h,pre);};if(items[0])render(items[0],result);if(items.length>1){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`Other guesses (${items.length-1})`;details.append(summary);for(const c of items.slice(1))render(c,details);result.append(details);}}
  document.getElementById('decode-run').onclick=()=>{try{const x=decodeCandidates(document.getElementById('decode-input').value);display(x.candidates,x.hints);if(!x.candidates.length&&!x.hints.length)result.textContent='No readable candidate found. It may need a key, another encoding, or not be encoded text.';}catch(e){result.textContent=e.message;}};
  for(const [id,fn]of [['toy-encode',toyEncode],['toy-decode',toyDecode]])document.getElementById(id).onclick=()=>{try{display([{label:'Brixalo experimental output - not for secrets alone',value:fn(document.getElementById('decode-input').value)}]);}catch(e){result.textContent=e.message;}};
 };
}
