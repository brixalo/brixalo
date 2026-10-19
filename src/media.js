// Explicit conversion recipes. Capabilities are checked against locally installed engines.
const entry = (to, kind, codec, extra = {}) => ({ to, label: to.toUpperCase(), kind, codec, ...extra });
export const IMAGE_FORMATS = ['png','jpg','webp','gif','bmp','tiff','avif','heic','ico','jp2','jxl','tga','pcx','ppm','pgm','pbm','pam','pnm','exr','hdr','dpx','psd','qoi'].map(to => entry(to,'image',to));
export const AUDIO_FORMATS = [
 entry('mp3','audio','libmp3lame'),entry('wav','audio','pcm_s16le',{lossless:true}),entry('flac','audio','flac',{lossless:true}),
 entry('ogg','audio','libvorbis'),entry('opus','audio','libopus'),entry('m4a','audio','aac'),entry('aac','audio','aac'),
 entry('aiff','audio','pcm_s16be',{lossless:true}),entry('aif','audio','pcm_s16be',{lossless:true}),
 entry('alac','audio','alac',{lossless:true,extension:'m4a',label:'ALAC'}),entry('wma','audio','wmav2'),entry('ac3','audio','ac3'),entry('mp2','audio','mp2'),entry('caf','audio','pcm_s16le',{lossless:true})
];
export const VIDEO_FORMATS = [entry('mp4','video','libx264'),entry('mkv','video','libx264'),entry('webm','video','libvpx-vp9'),entry('mov','video','libx264'),entry('avi','video','mpeg4'),entry('mpeg','video','mpeg2video'),entry('mpg','video','mpeg2video'),entry('flv','video','flv'),entry('wmv','video','wmv2'),entry('ogv','video','libtheora'),entry('ts','video','libx264'),entry('m4v','video','libx264',{muxer:'mp4'}),entry('gif','video','gif')];
export const ALL_FORMATS = [...IMAGE_FORMATS,...AUDIO_FORMATS,...VIDEO_FORMATS];
export function recipe(kind,to){ return (kind==='image'?IMAGE_FORMATS:[...VIDEO_FORMATS,...AUDIO_FORMATS]).find(x=>x.to===to); }
export function availableTargets(info, caps) {
 const kind=info.kind;
 const source=kind==='image'?IMAGE_FORMATS:kind==='audio'?AUDIO_FORMATS:[...VIDEO_FORMATS,...AUDIO_FORMATS];
 return source.filter(f=>{
  if(f.kind==='image') return caps.image_write?.includes(({jpg:'JPEG',tiff:'TIFF',jp2:'JP2',jxl:'JXL'}[f.to]||f.to.toUpperCase()));
  const required=[f.codec]; if(f.kind==='video'&&f.to!=='gif'&&info.has_audio)required.push(videoAudioCodec(f.to));
  return required.every(c=>caps.encoders?.includes(c));
 });
}
export function videoAudioCodec(to){return to==='webm'?'libopus':to==='ogv'?'libvorbis':to==='wmv'?'wmav2':['mpeg','mpg','avi'].includes(to)?'mp2':'aac';}
export const LOSSLESS_AUDIO = /^(flac|alac|wavpack|ape|tta|truehd|mlp|pcm_.*)$/;
export function summarizeProbe(raw,size=0) {
 const streams=raw.streams||[], v=streams.find(s=>s.codec_type==='video'&&s.disposition?.attached_pic!==1),a=streams.find(s=>s.codec_type==='audio');
 const kind=v?'video':a?'audio':null;
 return {kind,has_audio:!!a,size_bytes:Number(raw.format?.size)||size,duration:Number(raw.format?.duration)||Number(v?.duration)||Number(a?.duration)||0,
 format:raw.format?.format_name||'unknown',video_codec:v?.codec_name||null,audio_codec:a?.codec_name||null,
 width:Number(v?.width)||0,height:Number(v?.height)||0,bitrate:Number(raw.format?.bit_rate)||Number(a?.bit_rate)||0,
 audio_bitrate:Number(a?.bit_rate)||0,sample_rate:Number(a?.sample_rate)||0,channels:Number(a?.channels)||0,
 bit_depth:Number(a?.bits_per_raw_sample)||Number(a?.bits_per_sample)||0,
 audio_lossless:a?(LOSSLESS_AUDIO.test(a.codec_name||'')?'lossless codec':'lossy or unknown codec'):null,
 video_lossless:v?(v.codec_name==='ffv1'?'lossless codec':'not established from metadata'):null};
}
const num=(x,min,max,fallback)=>{const n=Number(x);if(!Number.isFinite(n)||n<min||n>max)throw Error(`Value must be between ${min} and ${max}`);return n||fallback;};
export function normalizeOptions(input={}) {
 const mode=input.mode||'balanced';if(!['balanced','quality','small','lossless','size'].includes(mode))throw Error('Unknown quality mode');
 return {mode,quality: num(input.quality??85,1,100,85),audioKbps:num(input.audioKbps??192,32,320,192),maxDimension:num(input.maxDimension??0,0,16384,0),targetMB:num(input.targetMB??10,.1,100000,10)};
}
export function estimateBytes(info,to,options={}) {
 const o=normalizeOptions(options),f=recipe(info.kind,to);if(!f)return null;
 if(o.mode==='size')return Math.floor(o.targetMB*1e6);
 if(f.kind==='audio'&&!f.lossless&&info.duration)return Math.ceil(info.duration*o.audioKbps*1000/8*1.03);
 return null; // Image and quality-based video sizes depend on content.
}
export function advice(info,to,options={}) {
 const o=normalizeOptions(options),f=recipe(info.kind,to),lines=[];
 if(!f)return ['This conversion is not supported.'];
 if(info.kind==='audio'&&info.audio_lossless==='lossless codec'&&!f.lossless)lines.push('Lossless source to lossy audio: likely smaller, but some information is permanently discarded. Keep your original.');
 if(info.audio_lossless!=='lossless codec'&&f.lossless)lines.push('A lossless output does not restore detail already lost in a lossy source; it may be larger.');
 if(o.mode==='lossless')lines.push('Lossless codec preserves the decoded samples/pixels at its supported depth; colour-space, bit-depth conversion or resizing can still change them.');
 if(f.kind==='audio'&&info.kind==='video')lines.push('Audio only: the video track will be removed.');
 if(o.mode==='size')lines.push('Target size is a best-effort bitrate budget, not a guaranteed upload limit. Check the saved file size.');
 if(to==='ico')lines.push('ICO dimensions are capped at 256 px.');
 if(info.kind==='image')lines.push('Most image outputs use the first frame/page. Animated GIF is preserved only when writing GIF. Transparency, colour depth and metadata can change.');
 return lines;
}
export function conversionCommand(info,to,input,output,options={}) {
 const o=normalizeOptions(options),f=recipe(info.kind,to);if(!f)throw Error('Unsupported output format');
 if(info.kind==='audio'&&f.kind==='video')throw Error('Audio to video needs a visual track and is not supported');
 const budget=o.mode==='size';
 if(info.kind==='image'){
  if(budget)throw Error('Exact image size targets are not supported; use quality and dimensions');
  if(o.mode==='lossless'&&!['png','tiff','bmp','ppm','pgm','pbm','pam','pnm','tga','qoi'].includes(to))throw Error('Choose PNG or TIFF for a lossless image codec');
  const args=[to==='gif'?input:input+'[0]','-auto-orient'];
  if(o.maxDimension||to==='ico'){const edge=to==='ico'?Math.min(o.maxDimension||256,256):o.maxDimension;args.push('-resize',`${edge}x${edge}>`);}
  if(['jpg','bmp','ppm','pgm','pbm','pnm'].includes(to))args.push('-background','white','-alpha','remove','-alpha','off');
  args.push('-quality',String(o.mode==='small'?Math.min(o.quality,60):o.quality),output);
  return {engine:'imagemagick',args};
 }
 const args=['-nostdin','-y','-hide_banner','-loglevel','error','-i',input];
 if(f.kind==='audio'){
  if(o.mode==='lossless'&&!f.lossless)throw Error('Select FLAC, WAV, AIFF, ALAC or CAF for a lossless audio codec');
  if(budget&&f.lossless)throw Error('Lossless audio cannot promise a target size; use a lossy codec');
  let kbps=o.audioKbps;
  if(budget){if(!(info.duration>0))throw Error('Duration is required for a size target');kbps=Math.floor(o.targetMB*1e6*8*.94/info.duration/1000);if(kbps<32||kbps>320)throw Error('Target requires audio outside 32-320 kbps; choose another size or lossless output');}
  args.push('-map','0:a:0','-vn','-c:a',f.codec);
  if(!f.lossless){
   if(to==='mp2'){kbps=[32,48,56,64,80,96,112,128,160,192,224,256,320].filter(n=>n<=kbps).at(-1)||32;}
   if(to==='ac3')kbps=[32,40,48,56,64,80,96,112,128,160,192,224,256,320].filter(n=>n<=kbps).at(-1)||32;
   args.push('-b:a',`${kbps}k`);
  }else if(['wav','aif','aiff','caf'].includes(to))args[args.indexOf(f.codec)]=to==='aif'||to==='aiff'?'pcm_s24be':'pcm_s24le';
  if(to==='alac')args.push('-f','ipod');
  args.push(output);return {engine:'ffmpeg',args};
 }
 if(to==='gif'){
  if(o.mode==='lossless'||budget)throw Error('GIF has no lossless-video or target-size mode; use quality and dimensions');
  const width=o.maxDimension||480;args.push('-vf',`fps=12,scale=min(${width}\\,iw):-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`,'-an',output);return {engine:'ffmpeg',args};
 }
 const lossless=o.mode==='lossless';if(lossless&&to!=='mkv')throw Error('Use MKV for lossless FFV1 video');
 args.push('-map','0:v:0','-map','0:a:0?','-c:v',lossless?'ffv1':f.codec);
 const scale=o.maxDimension?`scale=w=min(${o.maxDimension}\\,iw):h=min(${o.maxDimension}\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2`: 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
 if(o.maxDimension||!lossless)args.push('-vf',scale);
 if(!lossless){
  if(budget){if(!(info.duration>0))throw Error('Duration is required for a size target');const total=Math.floor(o.targetMB*1e6*8*.94/info.duration/1000);const vk=total-(info.has_audio?o.audioKbps:0);if(vk<100)throw Error('Target is too small for this duration and audio bitrate');args.push('-b:v',`${vk}k`);}
  else if(['libx264','libvpx-vp9'].includes(f.codec)){args.push('-crf',String(o.mode==='small'?32:o.mode==='quality'?18:Math.round(38-o.quality*.2)));if(f.codec==='libvpx-vp9')args.push('-b:v','0');}
  else if(f.codec==='libtheora')args.push('-q:v',String(o.mode==='small'?3:o.mode==='quality'?9:7));
  else args.push('-q:v',String(o.mode==='small'?12:o.mode==='quality'?2:5));
  args.push('-pix_fmt','yuv420p');
 }
 if(info.has_audio){args.push('-c:a',lossless?'flac':videoAudioCodec(to));if(!lossless)args.push('-b:a',`${['mpg','mpeg','avi'].includes(to)?192:to==='wmv'?128:o.audioKbps}k`);}
 if(f.muxer)args.push('-f',f.muxer);
 if(['mp4','mov'].includes(to))args.push('-movflags','+faststart');
 args.push(output);return {engine:'ffmpeg',args};
}
