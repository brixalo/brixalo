import { summarizeProbe,availableTargets,conversionCommand,normalizeOptions,estimateBytes,advice,recipe } from './media.js';
export const bytes=n=>!Number.isFinite(Number(n))?'unknown':Number(n)>=1e6?`${(n/1e6).toFixed(2)} MB`:`${(n/1e3).toFixed(1)} kB`;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function imageInfo(raw){return {kind:'image',size_bytes:Number(raw.size_bytes)||0,width:Number(raw.width)||0,height:Number(raw.height)||0,bit_depth:Number(raw.bit_depth)||0,image_format:raw.image_format,quality_tag:raw.quality_tag,compression:raw.compression};}
export function describe(info) {
 const facts=[bytes(info.size_bytes)];
 if(info.width)facts.push(`${info.width} × ${info.height}`);
 if(info.duration)facts.push(`${info.duration.toFixed(1)} seconds`);
 if(info.video_codec)facts.push(`Video: ${info.video_codec}; ${info.video_lossless}`);
 if(info.audio_codec)facts.push(`Audio: ${info.audio_codec}; ${info.audio_lossless}`);
 if(info.bitrate)facts.push(`${Math.round(info.bitrate/1000)} kbps overall`);
 if(info.audio_bitrate)facts.push(`${Math.round(info.audio_bitrate/1000)} kbps audio`);
 if(info.sample_rate)facts.push(`${info.sample_rate} Hz / ${info.channels} channels`);
 if(info.bit_depth)facts.push(`${info.bit_depth}-bit`);
 if(info.image_format)facts.push(`Image codec: ${info.image_format}; compression: ${info.compression||'unknown'}`);
 if(info.quality_tag)facts.push(`Image quality tag: ${info.quality_tag} (metadata, not a perceptual score)`);
 return facts;
}
export async function configureConversion(path,selected,T,onConvert) {
 const dialog=document.getElementById('conversion-dialog'),body=document.getElementById('conversion-body');
 let info,caps;
 dialog.showModal();body.innerHTML='<p role="status">Reading local metadata and installed encoders...</p>';
 try {
  if(!T)throw Error('Browser preview only. Open the desktop app to inspect a real file and convert it.');
  const [raw,c]=await Promise.all([T.core.invoke('inspect_file',{input:path}),T.core.invoke('media_capabilities')]);
  if(!dialog.open)return;
  info=raw.image?imageInfo(raw):summarizeProbe(raw,raw.size_bytes);caps=c;
  if(!info.kind)throw Error('No supported media stream found. Documents and archives are not media conversions.');
 }catch(e){body.innerHTML=`<h2>Cannot inspect this file</h2><p>${escape(e)}</p>`;return;}
 const formats=availableTargets(info,caps);
 if(!formats.length){body.innerHTML='<h2>No compatible output encoder</h2><p>Install FFmpeg and ImageMagick with the codecs you need.</p>';return;}
 body.innerHTML=`<div class="inspect-heading"><span class="eyebrow">SOURCE INSPECTOR</span><h2>${escape(path.split(/[\\/]/).pop())}</h2><p class="muted">Codec metadata describes the file, not how good it sounds or looks.</p></div>
 <div class="source-facts">${describe(info).map(x=>`<span>${escape(x)}</span>`).join('')}</div>
 <form id="conversion-form"><div class="convert-grid">
 <label>Output format<select id="output-format">${formats.map(f=>`<option value="${f.to}">${f.label}${f.lossless?' (lossless codec)':''}${f.kind==='audio'&&info.kind==='video'?' - audio only':''}</option>`).join('')}</select></label>
 <label>Mode<select id="convert-mode"><option value="balanced">Balanced</option><option value="quality">High quality</option><option value="small">Smaller file</option><option value="lossless">Lossless codec</option><option value="size">Target file size (best effort)</option></select></label>
 <label id="quality-label">Image / video quality <input id="convert-quality" type="number" min="1" max="100" value="85"><small>1-100; not comparable across codecs</small></label>
 <label id="audio-label">Audio bitrate (kbps)<select id="convert-bitrate">${[32,48,64,96,128,160,192,256,320].map(n=>`<option ${n===192?'selected':''}>${n}</option>`).join('')}</select></label>
 <label id="dimension-label">Longest edge (px)<input id="convert-dimension" type="number" min="0" max="16384" value="0"><small>0 keeps dimensions; never upscales</small></label>
 <label id="target-label">Target size (decimal MB)<input id="convert-target" type="number" min="0.1" max="100000" step="0.1" value="10"><small>Not a hard cap. Check output before uploading.</small></label>
 </div><div id="conversion-advice" role="status"></div><p class="muted">Sources are kept. More bitrate or a lossless codec cannot recover detail already lost. The same format is allowed for recompression.</p><button id="convert-submit" type="submit">Convert a new copy</button></form>`;
 const $=id=>document.getElementById(id),form=$('conversion-form');
 if(formats.some(f=>f.to===selected))$('output-format').value=selected;
 const options=()=>normalizeOptions({mode:$('convert-mode').value,quality:$('convert-quality').value,audioKbps:$('convert-bitrate').value,maxDimension:$('convert-dimension').value,targetMB:$('convert-target').value});
 function update(){
  const to=$('output-format').value,f=recipe(info.kind,to),mode=$('convert-mode').value;
  $('quality-label').hidden=info.kind==='audio'||f.kind==='audio'||mode==='lossless'||mode==='size';
  $('audio-label').hidden=info.kind==='image'||f.lossless||(f.kind==='video'&&!info.has_audio)||mode==='lossless'||(mode==='size'&&f.kind==='audio');
  $('dimension-label').hidden=f.kind==='audio';$('target-label').hidden=mode!=='size';
  $('convert-mode').querySelector('[value=size]').disabled=info.kind==='image'||to==='gif';
  try{
   const o=options();if(o.mode==='lossless'&&f.kind==='video'&&!caps.encoders.includes('ffv1'))throw Error('Your FFmpeg build has no FFV1 lossless encoder');conversionCommand(info,to,path,'preview.'+(f.extension||to),o);
   const size=estimateBytes(info,to,o),notes=advice(info,to,o);if(size)notes.unshift(`Estimated output: ${bytes(size)}${info.size_bytes?` vs ${bytes(info.size_bytes)} now`:''}. Estimate only; container overhead varies.`);
   if(!size)notes.unshift('Output size cannot be predicted reliably in this mode.');
   $('conversion-advice').innerHTML=notes.map(n=>`<p>${escape(n)}</p>`).join('');$('convert-submit').disabled=false;
  }catch(e){$('conversion-advice').innerHTML=`<p class="warning">${escape(e.message)}</p>`;$('convert-submit').disabled=true;}
 }
 form.addEventListener('input',update);form.addEventListener('change',update);
 form.addEventListener('submit',e=>{e.preventDefault();try{const to=$('output-format').value,o=options();conversionCommand(info,to,path,'preview.'+(recipe(info.kind,to).extension||to),o);dialog.close();onConvert(info,to,o);}catch(e){$('conversion-advice').textContent=e.message;}});update();
}
