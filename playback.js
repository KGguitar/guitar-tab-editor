/* ================================================================
   playback.js — 再生イベント列生成とAudio再生責務
   ================================================================
   依存: グローバル変数 song, sel, cur, playback, TPB, GS, TUN, mTk, dc, toast, render
   将来: state.js から state.song/state.sel/state.playback を受け取る形へ移行
   
   このファイルは単独では動かない。index.html から <script src="playback.js"> で読み込む。
   グローバル関数として公開される。
*/

/* ================================================================
   Phase 14: 簡易再生 (Web Audio API)
   ================================================================
   目的: 入力確認のための簡易再生。本格音源は不要。
   将来拡張点:
   - tie: 長さ連結 (buildPlaybackEvents内)
   - slide/hammer/pull: 音程グライド (playNote内)
   - strum: 数十msずらし (playChord内)
   - rest: 無音区間 (schedulePlayback内)
   - Viewer: sharedModel→buildPlaybackEventsFromShared
*/

let audioCtx=null;

function getAudioCtx(){
  if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==="suspended")audioCtx.resume();
  return audioCtx;
}

/* --- 音高変換 --- */
const NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function noteNameToMidi(name){
  if(!name||typeof name!=="string")return 40;
  const m=name.match(/^([A-Ga-g]#?)(\d+)$/);
  if(!m)return 40;
  const n=m[1].toUpperCase();const oct=parseInt(m[2]);
  const idx=NOTE_NAMES.indexOf(n);if(idx<0)return 40;
  return(oct+1)*12+idx;
}
function tuningStringFretToMidi(tuning,stringIndex,fret){
  const base=noteNameToMidi(tuning[stringIndex]||"E2");
  return base+fret;
}
function midiToFreq(midi){return 440*Math.pow(2,(midi-69)/12)}

/* --- tick→秒変換 --- */
function tickToSeconds(tick,tempo,speed){return((tick/TPB)*(60/tempo))/(speed||1.0)}

/* --- 再生イベント列生成 --- */
function buildPlaybackEvents(s){
  const out=[];const total=mTk(s.meta.timeSignature);
  s.measures.forEach((m,mi)=>{
    (m.events||[]).forEach(e=>{
      /* 再生用の安全なコピー — 元のeventを変更しない */
      out.push({id:e.id,measureIdx:mi,tick:e.startTick,stringIndex:e.stringIndex,
        fret:e.fret,durationTick:e.durationTick,attrs:dc(e.attrs||{}),links:dc(e.links||[]),
        absTick:mi*total+e.startTick});
    });
  });
  out.sort((a,b)=>a.absTick-b.absTick);
  return out;
}

/* Phase 16: tickAttrs再生用取得 */
function getTickAttrsForPlayback(measure,tick){
  const key=String(tick);
  return(measure.tickAttrs&&measure.tickAttrs[key])||{strum:null,rest:false};
}

/* tie chain解決 — whileループで末端まで辿る。再生用コピーのみ変更。
   visited setで無限ループ防止。dangling toEventIdは安全に打ち切る。 */
function resolveTieChains(events){
  const evMap={};events.forEach(ev=>{evMap[ev.id]=ev});
  const suppressIds=new Set();
  const processed=new Set();

  events.forEach(ev=>{
    if(processed.has(ev.id))return;
    const tieLk=(ev.links||[]).find(l=>l.type==="tie");
    if(!tieLk||!tieLk.toEventId)return;

    /* whileで末端まで辿る */
    let totalExtra=0;
    let curId=tieLk.toEventId;
    const visited=new Set([ev.id]);

    while(curId&&!visited.has(curId)){
      visited.add(curId);
      const target=evMap[curId];
      if(!target)break;/* dangling — 安全に打ち切り */
      totalExtra+=target.durationTick;
      suppressIds.add(curId);
      processed.add(curId);
      /* 次のtieを辿る */
      const nextTie=(target.links||[]).find(l=>l.type==="tie");
      curId=(nextTie&&nextTie.toEventId)||null;
    }

    ev.durationTick+=totalExtra;
    processed.add(ev.id);
  });

  return events.map(ev=>({...ev,suppress:suppressIds.has(ev.id)}));
}

/* Phase 16: 再生ノート列生成（tie/rest/strum/attrs解釈済み）
   将来: sharedModel再生にも流用可能。buildPlaybackNotesFromShared(shared)等へ拡張可。 */
function buildPlaybackNotes(s,fromMeasureIdx,fromTick){
  const tempo=s.meta.tempo||120;const spd=playback.speed||1.0;
  const total=mTk(s.meta.timeSignature);
  const startAbsTick=fromMeasureIdx*total+fromTick;
  let rawEvents=buildPlaybackEvents(s);
  rawEvents=resolveTieChains(rawEvents);
  rawEvents=rawEvents.filter(e=>e.absTick>=startAbsTick);

  const notes=[];
  /* measure/tickごとにグループ化してrest/strum解釈 */
  const groups={};
  rawEvents.forEach(ev=>{const key=ev.measureIdx+"_"+ev.tick;if(!groups[key])groups[key]={measureIdx:ev.measureIdx,tick:ev.tick,absTick:ev.absTick,events:[]};groups[key].events.push(ev)});
  const sortedGroups=Object.values(groups).sort((a,b)=>a.absTick-b.absTick);

  sortedGroups.forEach(g=>{
    const mi=g.measureIdx;const tick=g.tick;
    const m=s.measures[mi];if(!m)return;
    const ta=getTickAttrsForPlayback(m,tick);

    /* rest優先: rest=trueなら無音 */
    if(ta.rest)return;

    /* 非suppressのeventだけ発音 */
    const playable=g.events.filter(ev=>!ev.suppress);
    if(!playable.length)return;

    /* strum: 弦順でずらし */
    const strumDelay=ta.strum?0.020:0;/* 1弦あたり20ms */
    let sorted;
    if(ta.strum==="down"){sorted=[...playable].sort((a,b)=>a.stringIndex-b.stringIndex)}/* 低音弦(0)→高音弦(5) */
    else if(ta.strum==="up"){sorted=[...playable].sort((a,b)=>b.stringIndex-a.stringIndex)}
    else{sorted=playable}

    sorted.forEach((ev,i)=>{
      const offsetSec=tickToSeconds(ev.absTick-startAbsTick,tempo,spd)+i*strumDelay;
      let durSec=Math.max(0.05,tickToSeconds(ev.durationTick,tempo,spd)*0.9);
      let midi=tuningStringFretToMidi(s.meta.tuning||TUN.standard,ev.stringIndex,ev.fret);
      const at=ev.attrs||{};
      let gainMul=1.0;
      if(at.harmonic){midi+=12}
      if(at.accent){gainMul=1.4}
      if(at.ghost){durSec*=0.5;gainMul=0.4}
      if(at.mute||at.dead){durSec=Math.min(0.04,durSec);gainMul=0.5}
      notes.push({measureIdx:mi,tick,absTick:ev.absTick,startSec:offsetSec,durationSec:durSec,
        freq:midiToFreq(midi),gain:gainMul,attrs:at});
    });
  });

  return notes;
}

/* --- 単音発音（gain倍率対応） --- */
function playNote(freq,startTime,duration,ctx,gainMul){
  const gm=gainMul||1.0;
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  osc.type="triangle";
  osc.frequency.setValueAtTime(freq,startTime);
  gain.gain.setValueAtTime(0,startTime);
  gain.gain.linearRampToValueAtTime(0.3*gm,startTime+0.01);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001,0.15*gm),startTime+Math.min(0.1,duration*0.3));
  gain.gain.exponentialRampToValueAtTime(0.001,startTime+duration);
  osc.connect(gain);gain.connect(ctx.destination);
  osc.start(startTime);osc.stop(startTime+duration+0.05);
  const node={osc,gain,stopTime:startTime+duration+0.05};
  playback.activeNodes.push(node);
  osc.onended=()=>{playback.activeNodes=playback.activeNodes.filter(n=>n!==node)};
  return node;
}

/* --- 再生実行 --- */

/* Phase 21: クリック音（count-in / metronome共用） */
function playClick(startTime,ctx,accent){
  const osc=ctx.createOscillator();const gain=ctx.createGain();
  osc.type="square";
  osc.frequency.setValueAtTime(accent?1200:800,startTime);
  const vol=accent?0.18:0.12;
  gain.gain.setValueAtTime(vol,startTime);
  gain.gain.exponentialRampToValueAtTime(0.001,startTime+0.04);
  osc.connect(gain);gain.connect(ctx.destination);
  osc.start(startTime);osc.stop(startTime+0.06);
  const node={osc,gain,stopTime:startTime+0.06};
  playback.activeNodes.push(node);
  osc.onended=()=>{playback.activeNodes=playback.activeNodes.filter(n=>n!==node)};
}

/* Phase 21: count-in — 再生開始前の1小節分のクリック */
function buildCountInClicks(s,speed){
  const ts=s.meta.timeSignature;const tempo=s.meta.tempo||120;const spd=speed||1.0;
  const beats=ts.beats;const beatTick=ts.beatUnit===8?TPB/2:TPB;
  const clicks=[];
  for(let i=0;i<beats;i++){clicks.push({startSec:tickToSeconds(i*beatTick,tempo,spd),accent:i===0})}
  return clicks;
}

/* Phase 21: メトロノーム — 再生範囲内の拍クリック列 */
function buildMetronomeClicks(s,fromMI,fromTick,toMI,toTick,speed){
  const ts=s.meta.timeSignature;const tempo=s.meta.tempo||120;const spd=speed||1.0;
  const total=mTk(ts);const beatTick=ts.beatUnit===8?TPB/2:TPB;
  const startAbs=fromMI*total+fromTick;
  const endAbs=(toMI!=null?toMI*total+(toTick!=null?toTick+beatTick:total):s.measures.length*total);
  const clicks=[];
  for(let mi=0;mi<s.measures.length;mi++){
    for(let b=0;b<ts.beats;b++){
      const abs=mi*total+b*beatTick;
      if(abs<startAbs||abs>=endAbs)continue;
      clicks.push({startSec:tickToSeconds(abs-startAbs,tempo,spd),accent:b===0});
    }
  }
  return clicks;
}

/* Phase 19: selection→playRange変換 */
function makePlayRangeFromSelection(){
  const total=mTk(song.meta.timeSignature);
  if(sel.type==="measure")return{enabled:true,start:{measureIdx:sel.measureIdx,tick:0},end:{measureIdx:sel.measureIdx,tick:Math.max(0,total-GS)}};
  if(sel.type==="range"&&sel.rangeStart&&sel.rangeEnd)return{enabled:true,start:{...sel.rangeStart},end:{...sel.rangeEnd}};
  if(sel.type==="tick"||sel.type==="note")return{enabled:true,start:{measureIdx:sel.measureIdx,tick:sel.tick},end:{measureIdx:song.measures.length-1,tick:Math.max(0,total-GS)}};
  return{enabled:false,start:null,end:null};
}
function setPlayRangeFromSelection(){playback.playRange=makePlayRangeFromSelection();toast("再生範囲を設定");render()}
function clearPlayRange(){playback.playRange={enabled:false,start:null,end:null};toast("再生範囲を解除");render()}

/* 再生（範囲・ループ対応） */
function playFromPosition(fromMeasureIdx,fromTick,toMeasureIdx,toTick,isLoopRestart){
  if(playback.isPlaying)stopPlayback();
  const ctx=getAudioCtx();const spd=playback.speed||1.0;
  const notes=buildPlaybackNotes(song,fromMeasureIdx,fromTick);
  let filtered=notes;
  if(toMeasureIdx!=null&&toTick!=null){
    const total=mTk(song.meta.timeSignature);
    const endAbs=toMeasureIdx*total+toTick+cur.dur;
    filtered=notes.filter(n=>n.absTick<endAbs);
  }
  if(!filtered.length&&!playback.countInEnabled){toast("再生する音がありません");return}

  playback.isPlaying=true;playback.stopRequested=false;
  playback.currentMeasureIdx=fromMeasureIdx;playback.currentTick=fromTick;
  updatePlaybackUI();

  /* Phase 21: count-in（初回のみ、ループ折り返し時は入れない） */
  let countInDur=0;
  if(playback.countInEnabled&&!isLoopRestart){
    const ciClicks=buildCountInClicks(song,spd);
    const baseCI=ctx.currentTime+0.05;
    ciClicks.forEach(c=>{playClick(baseCI+c.startSec,ctx,c.accent)});
    if(ciClicks.length){countInDur=ciClicks[ciClicks.length-1].startSec+tickToSeconds(song.meta.timeSignature.beatUnit===8?TPB/2:TPB,song.meta.tempo,spd)}
  }

  const baseTime=ctx.currentTime+0.05+countInDur;

  /* Phase 21: メトロノーム */
  if(playback.metronomeEnabled){
    const mClicks=buildMetronomeClicks(song,fromMeasureIdx,fromTick,toMeasureIdx,toTick,spd);
    mClicks.forEach(c=>{playClick(baseTime+c.startSec,ctx,c.accent)});
  }

  /* ノート再生 */
  filtered.forEach(n=>{
    playNote(n.freq,baseTime+n.startSec,n.durationSec,ctx,n.gain);
    const tid=setTimeout(()=>{
      if(!playback.isPlaying||playback.stopRequested)return;
      playback.currentMeasureIdx=n.measureIdx;playback.currentTick=n.tick;render();ensurePlaybackVisible();
    },(countInDur+n.startSec)*1000);
    playback.timers.push(tid);
  });

  const lastEndSec=filtered.length?(filtered[filtered.length-1].startSec+filtered[filtered.length-1].durationSec):0;
  const endMs=(countInDur+lastEndSec)*1000+100;
  const endTid=setTimeout(()=>{
    if(!playback.isPlaying||playback.stopRequested)return;
    if(playback.loopEnabled&&playback.playRange.enabled&&playback.playRange.start){
      const pr=playback.playRange;
      playFromPosition(pr.start.measureIdx,pr.start.tick,pr.end.measureIdx,pr.end.tick,true);
      return;
    }
    playback.isPlaying=false;playback.currentMeasureIdx=-1;playback.currentTick=-1;
    updatePlaybackUI();render();toast("再生完了");
  },endMs);
  playback.timers.push(endTid);
}

/* 便利ラッパー */
function playAll(){playFromPosition(0,0)}
function playFromSelection(){playFromPosition(sel.measureIdx,sel.tick)}
function playPlayRange(){
  const pr=playback.playRange;
  if(!pr.enabled||!pr.start){toast("再生範囲なし");return}
  playFromPosition(pr.start.measureIdx,pr.start.tick,pr.end?pr.end.measureIdx:null,pr.end?pr.end.tick:null);
}
function playSelectionRange(){setPlayRangeFromSelection();playPlayRange()}

function stopPlayback(){
  playback.stopRequested=true;playback.isPlaying=false;
  playback.timers.forEach(t=>clearTimeout(t));playback.timers=[];
  const ctx=audioCtx;
  if(ctx){const now=ctx.currentTime;playback.activeNodes.forEach(n=>{try{n.gain.gain.cancelScheduledValues(now);n.gain.gain.setValueAtTime(0,now);n.osc.stop(now+0.01)}catch(e){}})}
  playback.activeNodes=[];
  playback.currentMeasureIdx=-1;playback.currentTick=-1;
  _lastScrolledMi=-1;
  updatePlaybackUI();render();
}

function updatePlaybackUI(){
  document.getElementById("btn-play").disabled=playback.isPlaying;
  document.getElementById("btn-play-top").disabled=playback.isPlaying;
  document.getElementById("btn-stop").disabled=!playback.isPlaying;
  const lb=document.getElementById("btn-loop");if(lb)lb.classList.toggle("act",playback.loopEnabled);
  const lb2=document.getElementById("ep-loop2");if(lb2)lb2.classList.toggle("act",playback.loopEnabled);
  const ci=document.getElementById("ep-countin");if(ci)ci.classList.toggle("act",playback.countInEnabled);
  const mt=document.getElementById("ep-metro");if(mt)mt.classList.toggle("act",playback.metronomeEnabled);
  const as=document.getElementById("ep-autoscroll");if(as)as.classList.toggle("act",playback.autoScrollEnabled);
  const sc=document.getElementById("ep-speed-btns");
  if(sc){Array.from(sc.children).forEach(b=>{b.classList.toggle("act",parseFloat(b.textContent)===playback.speed)})}
}

/* Phase 22: 自動スクロール — 再生中小節が見切れたら軽く追従
   小節単位で判定。毎tickでは動かさない。Viewer再生にも流用可能。 */
let _lastScrolledMi=-1;
function ensurePlaybackVisible(){
  if(!playback.autoScrollEnabled||!playback.isPlaying)return;
  const mi=playback.currentMeasureIdx;if(mi<0||mi===_lastScrolledMi)return;
  _lastScrolledMi=mi;
  const sa=document.getElementById("score-area");if(!sa)return;
  /* data-mi属性で小節canvasを探す */
  const target=sa.querySelector('[data-mi="'+mi+'"]');
  if(!target)return;
  const saRect=sa.getBoundingClientRect();const tRect=target.getBoundingClientRect();
  /* 見切れチェック: 小節canvasが表示領域の外にある場合のみスクロール */
  if(tRect.top<saRect.top||tRect.bottom>saRect.bottom){
    const systemRow=target.closest('[data-system-row]');
    if(systemRow){systemRow.scrollIntoView({behavior:"auto",block:"center"})}
    else{target.scrollIntoView({behavior:"auto",block:"center"})}
  }
}
