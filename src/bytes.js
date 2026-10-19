// Byte representations, not format transcoding. UTF-8 text is explicit.
export function bytesToBinary(bytes){return [...bytes].map(n=>n.toString(2).padStart(8,'0')).join(' ');}
export function binaryToBytes(text){const s=text.replace(/\s/g,'');if(!/^[01]*$/.test(s)||s.length%8)throw Error('Binary must contain complete 8-bit bytes, using only 0 and 1.');return Uint8Array.from(s.match(/.{8}/g)||[],x=>parseInt(x,2));}
export function bytesToHex(bytes){return [...bytes].map(n=>n.toString(16).padStart(2,'0')).join(' ');}
export function hexToBytes(text){const s=text.replace(/\s/g,'');if(!/^[a-f\d]*$/i.test(s)||s.length%2)throw Error('Hex must contain pairs of hexadecimal digits.');return Uint8Array.from(s.match(/.{2}/g)||[],x=>parseInt(x,16));}
export function textToBytes(text){return new TextEncoder().encode(text);}
export function bytesToText(bytes){return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
