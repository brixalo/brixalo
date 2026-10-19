import {bytesToBinary,binaryToBytes,bytesToHex,hexToBytes,textToBytes,bytesToText} from './bytes.js';
let url=null;
export function initViewer(T){
 const dialog=document.getElementById('viewer-dialog'),body=document.getElementById('viewer-body');
 dialog.addEventListener('close',()=>{if(url)URL.revokeObjectURL(url);url=null;body.replaceChildren();});
 document.getElementById('close-viewer').onclick=()=>dialog.close();
 document.getElementById('view-pick').onclick=async()=>{
  if(!T?.dialog){dialog.showModal();body.textContent='Desktop app required for local file viewing.';return;}
  const path=await T.dialog.open({multiple:false});if(!path)return;
  dialog.showModal();await show(path,1);
 };
 async function show(path,page){
  body.replaceChildren();const heading=document.createElement('h2');heading.textContent=path.split(/[\\/]/).pop();body.append(heading);
  const status=document.createElement('p');status.textContent='Reading a bounded local preview...';body.append(status);
  try{
   const result=await T.core.invoke('preview_file',{input:path,page});status.textContent=`${(result.size_bytes/1e6).toFixed(2)} MB. Preview only; no scripts or macros are run.`;
   if(result.kind==='image'||result.kind==='media'){
    if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([new Uint8Array(result.bytes)],{type:result.mime}));
    const el=document.createElement(result.kind==='image'?'img':result.mime.startsWith('video/')?'video':'audio');el.src=url;el.className='file-preview';
    if(result.kind==='media'){el.controls=true;el.onerror=()=>{status.textContent='This system WebView cannot play the codec. Use the converter or open with a compatible local player.';};}else el.alt='Local raster preview';body.append(el);
    if(result.pdf){const nav=document.createElement('div');nav.className='page-nav';const input=document.createElement('input');input.type='number';input.min='1';input.max='10000';input.value=String(page);input.setAttribute('aria-label','PDF page');const button=document.createElement('button');button.textContent='Show page';button.onclick=()=>show(path,Number(input.value));nav.append(input,button);body.append(nav);}
    return;
   }
   const bytes=new Uint8Array(result.bytes),limit=result.truncated;
   if(limit)status.textContent+=' Only the first 256 KiB is shown. Representation export is disabled for this partial preview.';
   const select=document.createElement('select');select.setAttribute('aria-label','Preview representation');for(const label of ['UTF-8 text','Hex bytes','Binary bytes']){const o=document.createElement('option');o.textContent=label;select.append(o);}body.append(select);
   const text=document.createElement('textarea');text.className='byte-preview';text.readOnly=true;body.append(text);
   function render(){try{text.value=select.selectedIndex===1?bytesToHex(bytes):select.selectedIndex===2?bytesToBinary(bytes):bytesToText(bytes); }catch{text.value='Not valid UTF-8. Select Hex bytes or Binary bytes.';}}
   select.onchange=render;render();
  }catch(e){status.textContent=String(e);}
 }
 document.getElementById('byte-tool').onclick=()=>{
  dialog.showModal();body.innerHTML='<h2>Text / binary / hex</h2><p>Reversible UTF-8 byte representations, not arbitrary document conversion. No input file is modified.</p><select id="byte-mode" aria-label="Byte conversion"><option>Text to binary</option><option>Binary to text</option><option>Text to hex</option><option>Hex to text</option></select><textarea id="byte-input" class="byte-preview" aria-label="Input text or representation" placeholder="Enter text or complete bytes"></textarea><button id="byte-convert">Convert representation</button><textarea id="byte-output" class="byte-preview" aria-label="Result" readonly></textarea><p id="byte-status" role="status"></p>';
  document.getElementById('byte-convert').onclick=()=>{try{const v=document.getElementById('byte-input').value;if(v.length>262144)throw Error('Input is limited to 256 KiB of text.');const m=document.getElementById('byte-mode').selectedIndex;document.getElementById('byte-output').value=[()=>bytesToBinary(textToBytes(v)),()=>bytesToText(binaryToBytes(v)),()=>bytesToHex(textToBytes(v)),()=>bytesToText(hexToBytes(v))][m]();document.getElementById('byte-status').textContent='Converted. Copy the result to save it.';}catch(e){document.getElementById('byte-status').textContent=e.message;}};
 };
}
