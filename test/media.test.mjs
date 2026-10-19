import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,statSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {summarizeProbe,conversionCommand,availableTargets,IMAGE_FORMATS,AUDIO_FORMATS,VIDEO_FORMATS,estimateBytes,advice,normalizeOptions} from '../src/media.js';
const dir=mkdtempSync(join(tmpdir(),'brixalo-media-'));
const run=(bin,args)=>spawnSync(bin,args,{encoding:'utf8',timeout:90000});
const must=(bin,args)=>{const r=run(bin,args);assert.equal(r.status,0,r.stderr);return r.stdout;};
const probe=f=>JSON.parse(must('ffprobe',['-v','error','-show_format','-show_streams','-of','json',f]));
const audio=join(dir,'source.wav'),video=join(dir,'source.mkv'),image=join(dir,'source.png');
must('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=3','-c:a','pcm_s24le',audio]);
must('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=320x240:rate=15:duration=1','-f','lavfi','-i','sine=duration=1','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',video]);
must('convert',['-size','320x240','gradient:red-blue',image]);
const encoders=must('ffmpeg',['-hide_banner','-encoders']).split('\n').map(x=>x.trim().split(/\s+/)).filter(x=>x[0]?.length===6).map(x=>x[1]);
const image_write=must('convert',['-list','format']).split('\n').map(x=>x.trim().split(/\s+/)).filter(x=>x[2]?.includes('w')).map(x=>x[0].replace('*',''));
const caps={encoders,image_write};let count=0,skip=[];
function convert(info,to,input,opts={},suffix=''){
 const out=join(dir,`${info.kind}-${to}${suffix}.${to==='alac'?'m4a':to}`),before=readFileSync(input);
 const cmd=conversionCommand(info,to,input,out,opts);must(cmd.engine==='ffmpeg'?'ffmpeg':'convert',cmd.args);
 assert(statSync(out).size>0);assert.deepEqual(readFileSync(input),before);count++;return out;
}
const ai=summarizeProbe(probe(audio)),vi=summarizeProbe(probe(video)),ii={kind:'image',size_bytes:statSync(image).size,width:320,height:240};
assert.equal(ai.audio_lossless,'lossless codec');assert.equal(vi.audio_lossless,'lossy or unknown codec');
for(const [info,input,list]of [[ai,audio,AUDIO_FORMATS],[vi,video,VIDEO_FORMATS],[ii,image,IMAGE_FORMATS]]){
 const available=availableTargets(info,caps);
 for(const f of list){if(!available.some(x=>x.to===f.to)){skip.push(f.to);continue;}
  const out=convert(info,f.to,input);
  if(info.kind==='image'){const dimensions=must('identify',['-format','%w %h',out+'[0]']);assert.equal(dimensions,f.to==='ico'?'256 192':'320 240');}
  else {const p=probe(out);assert(p.streams.some(s=>s.codec_type===(f.kind==='audio'?'audio':'video')));assert(Math.abs(Number(p.format.duration)-info.duration)<.6);}
 }
}
for(const f of AUDIO_FORMATS.filter(f=>availableTargets(vi,caps).some(x=>x.to===f.to)))convert(vi,f.to,video,{},'-extract');
const mp3=convert(ai,'mp3',audio,{audioKbps:96},'-96');assert(Math.abs(Number(probe(mp3).streams[0].bit_rate)-96000)<1000);
const resized=convert(vi,'mp4',video,{maxDimension:128,mode:'quality'},'-resize');const rv=probe(resized).streams.find(s=>s.codec_type==='video');assert(rv.width<=128&&rv.height<=128);
const png=convert(ii,'png',image,{maxDimension:100,mode:'lossless'},'-resize');assert.equal(must('identify',['-format','%w %h',png]),'100 75');
const ffv1=convert(vi,'mkv',video,{mode:'lossless'},'-lossless');assert.equal(probe(ffv1).streams[0].codec_name,'ffv1');
assert.throws(()=>conversionCommand(ai,'mp3',audio,'x.mp3',{mode:'lossless'}));
assert.throws(()=>conversionCommand(ai,'flac',audio,'x.flac',{mode:'size'}));
assert.throws(()=>conversionCommand(ii,'jpg',image,'x.jpg',{mode:'lossless'}));
assert.throws(()=>normalizeOptions({quality:'-y'}));assert.throws(()=>normalizeOptions({maxDimension:-3}));
assert(advice(ai,'mp3').some(x=>x.includes('permanently')));assert.equal(estimateBytes(ai,'mp3',{audioKbps:128})>0,true);
assert.equal(availableTargets(ai,{encoders:[],image_write:[]}).length,0);
assert(availableTargets(ai,caps).some(f=>f.to==='wav')); // same-format recompression offered
console.log(`PASS ${count} real extended conversions; metadata, bitrate, resizing, lossless, invalid options and availability checks`);
console.log('Unavailable image/codec outputs excluded:',skip.join(', '));console.log('Fixtures:',dir);
