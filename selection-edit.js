/* ================================================================
   selection-edit.js — 選択状態管理・全編集操作
   ================================================================
   責務: note/tick/range/measure選択、undo/redo、copy/paste/duplicate/delete、
         入力操作、奏法トグル、range複製、挿入貼付。
   依存: model.js（nAttrs,nLink,addLink,toggleLink,cleanupDanglingLinks等）
         グローバル変数 song, sel, cur, hist, clipboard, state, playback
         toast, render, renderFB, save, pushActionLog, focus
   
   将来: UI層(toast/render/save)への依存をコールバック化し、
         純粋な編集ロジック層として分離。
   
   このファイルは <script src="selection-edit.js"> で model.js の後に読み込む。
*/


/* state定義は state.js へ分離済み (Phase 31) */

function isChordMode(){return cur.inputMode==="chord"}function isSingleMode(){return cur.inputMode==="single"}

/* ===== Selection ヘルパー ===== */
function isNoteSelected(){return sel.type==="note"&&!!sel.eventId}
function isTickSelected(){return sel.type==="tick"}
function isRangeSelected(){return sel.type==="range"&&!!sel.rangeStart&&!!sel.rangeEnd}
function isMeasureSelected(){return sel.type==="measure"}
function getSelectedEvent(){
  if(!isNoteSelected())return null;
  for(const m of song.measures){const e=m.events.find(ev=>ev.id===sel.eventId);if(e)return e}
  return null;
}
function getSelectedTickEvents(){
  const m=getCurrentMeasure();return m?getEventsAtTick(m,sel.tick):[];
}
function getSelectedMeasure(){
  return(sel.measureIdx>=0&&sel.measureIdx<song.measures.length)?song.measures[sel.measureIdx]:null;
}
function selLabel(){return({note:"Note",tick:"Tick",range:"Range",measure:"Measure"})[sel.type]||"?"}

/* 選択操作 */
function selectTick(mi,tick){sel.type="tick";sel.measureIdx=mi;sel.tick=tick;sel.eventId=null;render()}
function selectNote(mi,tick,eventId){sel.type="note";sel.measureIdx=mi;sel.tick=tick;sel.eventId=eventId;render()}
function selectMeasure(mi){sel.type="measure";sel.measureIdx=mi;render()}
function setRangeStart(){sel.rangeStart={measureIdx:sel.measureIdx,tick:sel.tick};if(sel.rangeEnd)sel.type="range";toast("範囲 開始点を設定");render()}
function setRangeEnd(){sel.rangeEnd={measureIdx:sel.measureIdx,tick:sel.tick};if(sel.rangeStart){sel.type="range";/* start>endなら入替 */const s=sel.rangeStart,e=sel.rangeEnd;if(s.measureIdx>e.measureIdx||(s.measureIdx===e.measureIdx&&s.tick>e.tick)){sel.rangeStart=e;sel.rangeEnd=s}}toast("範囲 終了点を設定");render()}
function clearRange(){sel.rangeStart=null;sel.rangeEnd=null;if(sel.type==="range")sel.type="tick";render()}

/* Selection整合: undo/redo/import/delete後に呼ぶ。壊れたselを安全にfallback。 */
function reconcileSelection(){
  if(!song.measures.length){sel.type="tick";sel.measureIdx=0;sel.tick=0;sel.eventId=null;sel.rangeStart=null;sel.rangeEnd=null;return}
  sel.measureIdx=Math.max(0,Math.min(sel.measureIdx,song.measures.length-1));
  const total=mTk(song.meta.timeSignature);
  sel.tick=Math.max(0,Math.min(sel.tick||0,Math.max(0,total-GS)));
  if(sel.type==="note"){
    const found=findEventById(sel.eventId);
    if(!found){sel.type="tick";sel.eventId=null}
    else{sel.measureIdx=found.measureIdx;sel.tick=found.event.startTick}
  }
  if(sel.type==="range"){
    if(!sel.rangeStart||!sel.rangeEnd){sel.type="tick";sel.rangeStart=null;sel.rangeEnd=null}
    else{
      sel.rangeStart.measureIdx=Math.max(0,Math.min(sel.rangeStart.measureIdx,song.measures.length-1));
      sel.rangeEnd.measureIdx=Math.max(0,Math.min(sel.rangeEnd.measureIdx,song.measures.length-1));
    }
  }
  if(sel.type==="measure"){sel.measureIdx=Math.max(0,Math.min(sel.measureIdx,song.measures.length-1))}
}

/* ================================================================ HISTORY ================================================================ */
function pH(){hist.u.push(dc(song));if(hist.u.length>hist.mx)hist.u.shift();hist.r=[];uHB()}
function undo(){if(!hist.u.length)return;hist.r.push(dc(song));song=hist.u.pop();state.song=song;reconcileSelection();syncUI();render();save();uHB();pushActionLog("Undo");toast("元に戻す")}
function redo(){if(!hist.r.length)return;hist.u.push(dc(song));song=hist.r.pop();state.song=song;reconcileSelection();syncUI();render();save();uHB();pushActionLog("Redo");toast("やり直し")}
function uHB(){document.getElementById("btn-undo").disabled=!hist.u.length;document.getElementById("btn-redo").disabled=!hist.r.length}

/* ================================================================ META ================================================================ */
function clampBpm(v){return Math.max(30,Math.min(240,+v||120))}
function setTitle(v){if(v===song.meta.title)return;pH();song.meta.title=v;save()}
function setBpm(v){v=clampBpm(v);if(v===song.meta.tempo)return;pH();song.meta.tempo=v;uHead();render();save()}
function setTS(s){const nts=pTS(s);const cts=song.meta.timeSignature;if(nts.beats===cts.beats&&nts.beatUnit===cts.beatUnit)return;const ntt=mTk(nts);let ov=0;song.measures.forEach(m=>m.events.forEach(e=>{if(e.startTick>=ntt||e.startTick+e.durationTick>ntt)ov++}));if(ov>0&&!confirm("はみ出すノート"+ov+"個を削除しますか？"))return;pH();song.meta.timeSignature=nts;if(ov>0)song.measures.forEach(m=>{m.events=m.events.filter(e=>e.startTick<ntt&&e.startTick+e.durationTick<=ntt)});sel.tick=0;uHead();render();save()}
function syncUI(){document.getElementById("inp-title").value=song.meta.title||"";uHead()}
function uHead(){const ts=song.meta.timeSignature;document.getElementById("shBpm").textContent="♩= "+song.meta.tempo;document.getElementById("shTS").innerHTML='<span class="ts-top">'+ts.beats+'</span><span class="ts-line"></span><span class="ts-bot">'+ts.beatUnit+'</span>'}

/* ================================================================ DURATION ================================================================ */
function getPlacedDuration(){return cur.dotted?Math.floor(cur.dur*1.5):cur.dur}
function getAutoAdvanceStep(){return getPlacedDuration()}function getManualMoveStep(){return cur.dur}function getTapSnapStep(){return cur.dur}

/* ================================================================ MEASURE OPS ================================================================ */
function resetDelMConfirm(){if(!delMConfirm)return;clearTimeout(delMConfirm);delMConfirm=null;const b=document.getElementById("ep-del-m");b.textContent="小節削除";b.style.background="";b.style.color=""}
function addM(){resetDelMConfirm();pH();song.measures.push(nM());render();save();toast("小節を追加")}
function dupM(){if(sel.measureIdx<0||sel.measureIdx>=song.measures.length)return;resetDelMConfirm();pH();const d=dc(song.measures[sel.measureIdx]);d.id=uid("m");d.events.forEach(e=>e.id=uid("e"));song.measures.splice(sel.measureIdx+1,0,d);adjustSpanIndicesAfterInsert(sel.measureIdx+1);render();save();toast("小節を複製")}
function delM(){if(song.measures.length<=1){toast("最後の小節は削除できません");return}const btn=document.getElementById("ep-del-m");if(delMConfirm){clearTimeout(delMConfirm);delMConfirm=null;btn.textContent="小節削除";btn.style.background="";btn.style.color="";pH();const ri=sel.measureIdx;song.measures.splice(ri,1);adjustSpanIndicesAfterRemove(ri);if(sel.measureIdx>=song.measures.length)sel.measureIdx=song.measures.length-1;sel.tick=0;cleanupDanglingLinks();render();save();toast("小節を削除しました")}else{btn.textContent="本当に削除？";btn.style.background="#e44";btn.style.color="#fff";toast("もう一度押すと削除します");delMConfirm=setTimeout(()=>{delMConfirm=null;btn.textContent="小節削除";btn.style.background="";btn.style.color=""},3000)}}

/* ================================================================ NOTE OPS ================================================================ */
function getEventsAtTick(m,t){return m?m.events.filter(e=>e.startTick===t):[]}
function hasEventsAtTick(m,t){return getEventsAtTick(m,t).length>0}
function hasMultipleEventsAtTick(m,t){return getEventsAtTick(m,t).length>1}
function cloneTickEvents(events){return events.map(e=>({stringIndex:e.stringIndex,fret:e.fret,durationTick:e.durationTick,attrs:dc(e.attrs||nAttrs()),links:dc(e.links||nLinks())}))}
function findNoteAt(m,t,s){return m.events.find(e=>e.startTick===t&&e.stringIndex===s)||null}
function removeNote(m,ev){m.events=m.events.filter(e=>e!==ev);cleanupDanglingLinks()}
function addNote(m,s,f,t,d){m.events.push({id:uid("e"),stringIndex:s,fret:f,startTick:t,durationTick:d,attrs:nAttrs(),links:nLinks()});srt(m)}
function putNote(str,fret){if(sel.measureIdx<0||sel.measureIdx>=song.measures.length)return{action:"none",changed:false,shouldAdvance:false};const m=song.measures[sel.measureIdx];const ed=getPlacedDuration();const ex=findNoteAt(m,sel.tick,str);if(ex&&ex.fret===fret){pH();removeNote(m,ex);return{action:"delete",changed:true,shouldAdvance:false}}if(ex){pH();ex.fret=fret;ex.durationTick=ed;return{action:"update",changed:true,shouldAdvance:true}}pH();addNote(m,str,fret,sel.tick,ed);return{action:"add",changed:true,shouldAdvance:true}}
function getCurrentMeasure(){return(sel.measureIdx>=0&&sel.measureIdx<song.measures.length)?song.measures[sel.measureIdx]:null}
function hasCopied(){return!!clipboard.type}
function copyTickGroup(){const m=getCurrentMeasure();if(!m)return;const ev=getEventsAtTick(m,sel.tick);if(!ev.length){toast("音がありません");return}clipboard={type:"tick",payload:{events:ev.map(e=>cloneEventForPaste(e)),tickAttrs:null},meta:{}};toast("コピー")}
function pasteTickGroup(){const m=getCurrentMeasure();if(!m||!hasCopied()||clipboard.type!=="tick"){toast("貼付データなし");return}if(hasEventsAtTick(m,sel.tick)){toast("貼付先に音あり");return}pH();clipboard.payload.events.forEach(s=>{m.events.push(cloneEventForPaste(s,sel.tick))});srt(m);render();save();toast("貼付")}
function overwriteTickGroup(){const m=getCurrentMeasure();if(!m||!hasCopied()||clipboard.type!=="tick"){toast("貼付データなし");return}pH();m.events=m.events.filter(e=>e.startTick!==sel.tick);clipboard.payload.events.forEach(s=>{m.events.push(cloneEventForPaste(s,sel.tick))});srt(m);render();save();toast("上書貼付")}
function dupTickRight(){const m=getCurrentMeasure();if(!m)return;const ev=getEventsAtTick(m,sel.tick);if(!ev.length)return;const nt=sel.tick+getManualMoveStep();const total=mTk(song.meta.timeSignature);if(nt>=total){toast("右に複製できません");return}if(hasEventsAtTick(m,nt)){toast("複製先に音あり");return}pH();cloneTickEvents(ev).forEach(s=>{m.events.push({id:uid("e"),stringIndex:s.stringIndex,fret:s.fret,startTick:nt,durationTick:s.durationTick,attrs:dc(s.attrs||nAttrs()),links:dc(s.links||nLinks())})});srt(m);sel.tick=nt;render();save();toast("右複製")}
function transposeBy(d){const m=getCurrentMeasure();if(!m)return;const ev=getEventsAtTick(m,sel.tick);if(!ev.length)return;if(!ev.every(e=>{const f=e.fret+d;return f>=0&&f<=FRETS})){toast("範囲外");return}pH();ev.forEach(e=>{e.fret+=d});render();save();toast((d>0?"+":"")+d+"半音")}
function moveTickBy(d){const m=getCurrentMeasure();if(!m)return;const ev=getEventsAtTick(m,sel.tick);if(!ev.length)return;const nt=sel.tick+d;const total=mTk(song.meta.timeSignature);if(nt<0||nt>=total){toast("移動できません");return}if(hasEventsAtTick(m,nt)){toast("移動先に音あり");return}pH();ev.forEach(e=>{e.startTick=nt});srt(m);sel.tick=nt;render();save();toast("移動")}
function deleteTickGroup(){const m=getCurrentMeasure();if(!m)return;const ev=getEventsAtTick(m,sel.tick);if(!ev.length)return;pH();m.events=m.events.filter(e=>e.startTick!==sel.tick);cleanupDanglingLinks();render();save();pushActionLog("Delete tick M"+(sel.measureIdx+1)+" T"+sel.tick);toast("Tick削除")}

/* ================================================================
   Phase 8: Selection対応 Copy / Paste / Duplicate / Delete
   ================================================================ */

/* Clone helper: links.toEventId を切って安全にクローン */
function cloneEventForPaste(e,tickOv,strOv){
  return{id:uid("e"),stringIndex:strOv!=null?strOv:e.stringIndex,
    fret:e.fret,startTick:tickOv!=null?tickOv:e.startTick,
    durationTick:e.durationTick,attrs:dc(e.attrs||nAttrs()),
    links:(e.links||[]).map(l=>nLink(l.type,{value:l.value}))};
}

/* --- Copy --- */
function copySelection(){
  const m=getCurrentMeasure();if(!m)return;
  if(isNoteSelected()){
    const ne=getSelectedEvent();if(!ne){toast("ノートなし");return}
    clipboard={type:"note",payload:{event:cloneEventForPaste(ne)},meta:{string:ne.stringIndex}};
    pushActionLog("Copy note");toast("Note コピー");
  }else if(isTickSelected()){
    const ev=getEventsAtTick(m,sel.tick);if(!ev.length){toast("音がありません");return}
    const ta=getTickAttrs(m,sel.tick);
    clipboard={type:"tick",payload:{events:ev.map(e=>cloneEventForPaste(e)),tickAttrs:ta?dc(ta):null},meta:{}};
    pushActionLog("Copy tick");toast("Tick コピー ("+ev.length+"音)");
  }else if(isRangeSelected()){
    const rs=sel.rangeStart,re=sel.rangeEnd;const events=[];const baseMi=rs.measureIdx,baseTick=rs.tick;
    const total=mTk(song.meta.timeSignature);
    for(let mi=rs.measureIdx;mi<=re.measureIdx&&mi<song.measures.length;mi++){
      const mm=song.measures[mi];const tS=(mi===rs.measureIdx)?rs.tick:0;const tE=(mi===re.measureIdx)?re.tick+cur.dur:total;
      mm.events.forEach(e=>{if(e.startTick>=tS&&e.startTick<tE){const cl=cloneEventForPaste(e);cl._relMi=mi-baseMi;cl._relTick=e.startTick-((mi===baseMi)?baseTick:0);events.push(cl)}});
    }
    clipboard={type:"range",payload:{events,baseMeasureIdx:baseMi,baseTick},meta:{measureSpan:re.measureIdx-rs.measureIdx+1}};
    pushActionLog("Copy range");toast("Range コピー ("+events.length+"音)");
  }else if(isMeasureSelected()){
    const mClone=dc(m);mClone.id=uid("m");mClone.events.forEach(e=>{e.id=uid("e");if(e.links)e.links.forEach(l=>{l.toEventId=null})});
    clipboard={type:"measure",payload:{measure:mClone},meta:{}};
    pushActionLog("Copy measure");toast("Measure コピー");
  }
  render();
}

/* --- Paste --- */
function pasteSelection(){
  if(!clipboard.type||!clipboard.payload){toast("クリップボードが空");return}
  const m=getCurrentMeasure();if(!m)return;
  pH();
  if(clipboard.type==="note"){
    const src=clipboard.payload.event;
    if(findNoteAt(m,sel.tick,cur.inputString)){toast("貼付先に音あり");return}
    m.events.push(cloneEventForPaste(src,sel.tick,cur.inputString));srt(m);toast("Note 貼付");
  }else if(clipboard.type==="tick"){
    if(hasEventsAtTick(m,sel.tick)){toast("貼付先に音あり");return}
    clipboard.payload.events.forEach(s=>{m.events.push(cloneEventForPaste(s,sel.tick))});srt(m);
    if(clipboard.payload.tickAttrs)setTickAttr(m,sel.tick,dc(clipboard.payload.tickAttrs));
    toast("Tick 貼付");
  }else if(clipboard.type==="range"){
    const evts=clipboard.payload.events;const total=mTk(song.meta.timeSignature);
    evts.forEach(s=>{const tmi=sel.measureIdx+(s._relMi||0);if(tmi<0||tmi>=song.measures.length)return;const ttick=(s._relMi===0?sel.tick:0)+(s._relTick||0);if(ttick<0||ttick>=total)return;song.measures[tmi].events.push(cloneEventForPaste(s,ttick));srt(song.measures[tmi])});
    toast("Range 貼付 ("+evts.length+"音)");
  }else if(clipboard.type==="measure"){
    const mClone=dc(clipboard.payload.measure);mClone.id=uid("m");mClone.events.forEach(e=>{e.id=uid("e");if(e.links)e.links.forEach(l=>{l.toEventId=null})});
    song.measures.splice(sel.measureIdx+1,0,mClone);adjustSpanIndicesAfterInsert(sel.measureIdx+1);
    toast("Measure 貼付(挿入)");
  }
  render();save();
}

/* --- Duplicate --- */
function duplicateSelection(){
  const m=getCurrentMeasure();if(!m)return;
  if(isNoteSelected()){
    const ne=getSelectedEvent();if(!ne)return;
    const nt=sel.tick+getManualMoveStep();const total=mTk(song.meta.timeSignature);
    if(nt>=total){toast("範囲外");return}if(findNoteAt(m,nt,ne.stringIndex)){toast("複製先に音あり");return}
    pH();m.events.push(cloneEventForPaste(ne,nt));srt(m);sel.tick=nt;sel.type="tick";sel.eventId=null;
    render();save();toast("Note 右複製");
  }else if(isTickSelected()){
    dupTickRight();
  }else if(isMeasureSelected()){
    dupM();
  }else if(isRangeSelected()){
    duplicateRangeSelection();
  }
}

/* Phase 23: range複製 — link再マップ + tickAttrs複製 + selection更新
   spans は自動複製しない（意味解釈が重いため）。将来対応用コメント残し。 */
function duplicateRangeSelection(){
  if(!isRangeSelected())return;
  const rs=sel.rangeStart,re=sel.rangeEnd;
  const total=mTk(song.meta.timeSignature);
  const startAbs=rs.measureIdx*total+rs.tick;
  const endAbs=re.measureIdx*total+re.tick+cur.dur;/* 半開区間 [start, end) */
  const rangeTicks=endAbs-startAbs;if(rangeTicks<=0){toast("範囲が空");return}

  pH();

  /* 元範囲のeventsを収集 */
  const srcEvents=[];
  for(let mi=rs.measureIdx;mi<=re.measureIdx&&mi<song.measures.length;mi++){
    const mm=song.measures[mi];const tS=(mi===rs.measureIdx)?rs.tick:0;const tE=(mi===re.measureIdx)?re.tick+cur.dur:total;
    mm.events.forEach(e=>{if(e.startTick>=tS&&e.startTick<tE)srcEvents.push({event:e,measureIdx:mi,absT:mi*total+e.startTick})});
  }

  /* 複製先: 元範囲の直後 */
  const destStartAbs=endAbs;
  const destEndAbs=destStartAbs+rangeTicks;

  /* 必要なら小節追加 */
  while(Math.floor((destEndAbs-1)/total)>=song.measures.length)song.measures.push(nM());

  /* ID再マップテーブル */
  const idMap={};
  const cloned=srcEvents.map(s=>{
    const newId=uid("e");idMap[s.event.id]=newId;
    const destAbs=destStartAbs+(s.absT-startAbs);
    const destMi=Math.floor(destAbs/total);const destTick=destAbs%total;
    return{id:newId,stringIndex:s.event.stringIndex,fret:s.event.fret,startTick:destTick,
      durationTick:s.event.durationTick,attrs:dc(s.event.attrs||nAttrs()),
      links:(s.event.links||[]).map(l=>dc(l)),_destMi:destMi};
  });

  /* links再マップ: 範囲内リンクは新IDへ、範囲外は切断 */
  cloned.forEach(c=>{
    (c.links||[]).forEach(l=>{
      if(l.toEventId){l.toEventId=idMap[l.toEventId]||null}
    });
  });

  /* eventsを配置 */
  cloned.forEach(c=>{
    const mi=c._destMi;delete c._destMi;
    if(mi>=0&&mi<song.measures.length)song.measures[mi].events.push(c);
  });

  /* tickAttrs複製 */
  for(let mi=rs.measureIdx;mi<=re.measureIdx&&mi<song.measures.length;mi++){
    const mm=song.measures[mi];const tS=(mi===rs.measureIdx)?rs.tick:0;const tE=(mi===re.measureIdx)?re.tick+cur.dur:total;
    if(!mm.tickAttrs)continue;
    Object.keys(mm.tickAttrs).forEach(k=>{
      const t=Number(k);if(t<tS||t>=tE)return;
      const srcAbs=mi*total+t;const destAbs=destStartAbs+(srcAbs-startAbs);
      const destMi=Math.floor(destAbs/total);const destTick=destAbs%total;
      if(destMi>=0&&destMi<song.measures.length){setTickAttr(song.measures[destMi],destTick,dc(mm.tickAttrs[k]))}
    });
  }

  /* selectionを複製先rangeへ */
  const newStartMi=Math.floor(destStartAbs/total);const newStartTick=destStartAbs%total;
  const newEndMi=Math.floor((destEndAbs-cur.dur)/total);const newEndTick=(destEndAbs-cur.dur)%total;
  sel.rangeStart={measureIdx:newStartMi,tick:newStartTick};
  sel.rangeEnd={measureIdx:newEndMi,tick:newEndTick};sel.measureIdx=newStartMi;sel.tick=newStartTick;

  song.measures.forEach(m=>srt(m));cleanupDanglingLinks();
  render();save();pushActionLog("Duplicate range "+srcEvents.length+"notes");toast("Range複製 ("+srcEvents.length+"音)");
}

/* Phase 23: 挿入貼付（右押し出し） — 貼付位置以降のevents/tickAttrsを右へずらしてから配置 */
function shiftEventsRight(mi,fromTick,amount){
  const total=mTk(song.meta.timeSignature);const m=song.measures[mi];if(!m)return;
  /* overflow: 小節末尾を超えるeventは次小節へ送る */
  const overflow=[];
  m.events=m.events.map(e=>{
    if(e.startTick<fromTick)return e;
    const nt=e.startTick+amount;
    if(nt>=total){overflow.push({...e,startTick:nt-total});return null}
    return{...e,startTick:nt};
  }).filter(Boolean);
  /* overflowを次小節へ */
  if(overflow.length){
    if(mi+1>=song.measures.length)song.measures.push(nM());
    overflow.forEach(e=>{e.id=e.id;song.measures[mi+1].events.push(e)});
    srt(song.measures[mi+1]);
  }
  /* tickAttrsも右へずらす */
  if(m.tickAttrs){
    const newTA={};
    Object.keys(m.tickAttrs).forEach(k=>{
      const t=Number(k);
      if(t<fromTick){newTA[k]=m.tickAttrs[k]}
      else{const nt=t+amount;if(nt<total)newTA[String(nt)]=m.tickAttrs[k]}
    });
    m.tickAttrs=newTA;
  }
  srt(m);
}

function insertPasteAtSelection(){
  if(!clipboard.type||!clipboard.payload){toast("クリップボードが空");return}
  if(clipboard.type==="tick"){
    const evts=clipboard.payload.events;if(!evts.length){toast("空");return}
    pH();shiftEventsRight(sel.measureIdx,sel.tick,cur.dur);
    const m=getCurrentMeasure();
    evts.forEach(s=>{m.events.push(cloneEventForPaste(s,sel.tick))});srt(m);
    if(clipboard.payload.tickAttrs)setTickAttr(m,sel.tick,dc(clipboard.payload.tickAttrs));
    cleanupDanglingLinks();render();save();pushActionLog("Insert tick at M"+(sel.measureIdx+1)+" T"+sel.tick);toast("挿入貼付(tick)");
  }else if(clipboard.type==="range"){
    const evts=clipboard.payload.events;if(!evts.length){toast("空");return}
    const total=mTk(song.meta.timeSignature);
    /* range長を計算 */
    let maxRelAbs=0;evts.forEach(s=>{const a=(s._relMi||0)*total+(s._relTick||0)+s.durationTick;if(a>maxRelAbs)maxRelAbs=a});
    const shiftAmount=Math.max(cur.dur,maxRelAbs);
    pH();
    /* 現在位置以降を右へ押し出し */
    const startMi=sel.measureIdx;
    for(let mi=song.measures.length-1;mi>=startMi;mi--){
      shiftEventsRight(mi,mi===startMi?sel.tick:0,shiftAmount);
    }
    /* 必要なら小節追加 */
    while(Math.floor((sel.measureIdx*total+sel.tick+shiftAmount-1)/total)>=song.measures.length)song.measures.push(nM());
    /* 配置 */
    evts.forEach(s=>{
      const tmi=sel.measureIdx+(s._relMi||0);if(tmi<0||tmi>=song.measures.length)return;
      const ttick=(s._relMi===0?sel.tick:0)+(s._relTick||0);if(ttick<0||ttick>=total)return;
      song.measures[tmi].events.push(cloneEventForPaste(s,ttick));srt(song.measures[tmi]);
    });
    cleanupDanglingLinks();render();save();pushActionLog("Insert range "+evts.length+"notes at M"+(sel.measureIdx+1));toast("挿入貼付(range "+evts.length+"音)");
  }else{
    toast("挿入貼付: tick/rangeのみ対応");
  }
}

/* Phase 23: 上書き貼付 — 貼付先の既存データを消してから貼る */
function pasteSelectionOverwrite(){
  if(!clipboard.type||!clipboard.payload){toast("クリップボードが空");return}
  const m=getCurrentMeasure();if(!m)return;
  pH();
  if(clipboard.type==="tick"){
    m.events=m.events.filter(e=>e.startTick!==sel.tick);/* 既存を消す */
    clipboard.payload.events.forEach(s=>{m.events.push(cloneEventForPaste(s,sel.tick))});srt(m);
    if(clipboard.payload.tickAttrs)setTickAttr(m,sel.tick,dc(clipboard.payload.tickAttrs));
    toast("上書き貼付(tick)");
  }else if(clipboard.type==="range"){
    const evts=clipboard.payload.events;const total=mTk(song.meta.timeSignature);
    const rs=sel;
    evts.forEach(s=>{
      const tmi=rs.measureIdx+(s._relMi||0);if(tmi<0||tmi>=song.measures.length)return;
      const ttick=(s._relMi===0?rs.tick:0)+(s._relTick||0);if(ttick<0||ttick>=total)return;
      /* 該当tickの既存を消す */
      song.measures[tmi].events=song.measures[tmi].events.filter(e=>e.startTick!==ttick||e.stringIndex!==s.stringIndex);
      song.measures[tmi].events.push(cloneEventForPaste(s,ttick));srt(song.measures[tmi]);
    });
    toast("上書き貼付(range "+evts.length+"音)");
  }else{
    pasteSelection();return;
  }
  cleanupDanglingLinks();render();save();pushActionLog("Paste overwrite");
}

/* --- Delete --- */
function deleteSelection(){
  if(isNoteSelected()){
    const m=getCurrentMeasure();if(!m)return;
    const ev=m.events.find(e=>e.id===sel.eventId);
    if(ev){pH();removeNote(m,ev);sel.type="tick";sel.eventId=null;render();save();pushActionLog("Delete note "+sel.eventId);toast("Note 削除")}
  }else if(isTickSelected()){
    deleteTickGroup();
  }else if(isRangeSelected()){
    const rs=sel.rangeStart,re=sel.rangeEnd;const total=mTk(song.meta.timeSignature);
    pH();let count=0;
    for(let mi=rs.measureIdx;mi<=re.measureIdx&&mi<song.measures.length;mi++){
      const mm=song.measures[mi];const tS=(mi===rs.measureIdx)?rs.tick:0;const tE=(mi===re.measureIdx)?re.tick+cur.dur:total;
      const before=mm.events.length;mm.events=mm.events.filter(e=>e.startTick<tS||e.startTick>=tE);count+=before-mm.events.length;
    }
    cleanupDanglingLinks();cleanupInvalidSpans();sel.type="tick";sel.rangeStart=null;sel.rangeEnd=null;
    render();save();pushActionLog("Delete range "+count+"notes");toast("Range 削除 ("+count+"音)");
  }else if(isMeasureSelected()){
    delM();
  }
}

function handleDelete(){deleteSelection()}

/* Phase 7: toggleTech — note選択時は選択eventのみ、tick選択時はtick全体 */
function toggleTech(type){
  const m=getCurrentMeasure();if(!m)return;
  const t=TECH_MAP.find(x=>x.id===type);if(!t)return;
  let targets;
  if(isNoteSelected()){
    const ne=getSelectedEvent();if(!ne)return;targets=[ne];
  }else{
    targets=getEventsAtTick(m,sel.tick);if(!targets.length)return;
  }
  pH();
  const curOn=targets.some(e=>hasLinkType(e,t.linkType));
  targets.forEach(e=>{
    if(curOn){removeLinkByType(e,t.linkType)}
    else{const targetId=resolveAutoLinkTarget(sel.measureIdx,e,t.linkType);addLink(e,t.linkType,{toEventId:targetId})}
  });
  render();save();toast(t.label+(curOn?" 解除":" 設定"));
}

/* ================================================================ CURSOR ================================================================ */
function moveCur(dir){
  const total=mTk(song.meta.timeSignature);const step=getManualMoveStep();
  let nt=sel.tick+dir*step,mi=sel.measureIdx;
  if(nt<0){if(mi>0){mi--;nt=Math.max(0,total-step)}else nt=0}
  else if(nt>=total){if(mi<song.measures.length-1){mi++;nt=0}else nt=sel.tick}
  sel.measureIdx=mi;sel.tick=nt;
  if(sel.type==="note"){sel.type="tick";sel.eventId=null}
  render();
}
function setCur(mi,t){sel.measureIdx=mi;sel.tick=t;render()}
function moveString(dir){cur.inputString=Math.max(0,Math.min(NSTR-1,cur.inputString+dir));render()}
function setInputString(s){cur.inputString=Math.max(0,Math.min(NSTR-1,s));render();document.getElementById("score-area").focus()}
function advanceToNextTick(){moveCur(1)}function advanceToPrevTick(){moveCur(-1)}

function toggleInputMode(){cur.inputMode=isChordMode()?"single":"chord";render();toast(isChordMode()?"♫ 和音モード":"♪ 単音モード");document.getElementById("score-area").focus()}

function commitFret(fret){
  const r=putNote(cur.inputString,fret);if(!r.changed)return;
  if(isSingleMode()){if(r.shouldAdvance){const total=mTk(song.meta.timeSignature);const step=getAutoAdvanceStep();const nt=sel.tick+step;if(nt>=total){if(sel.measureIdx<song.measures.length-1){sel.measureIdx++;sel.tick=0}}else{sel.tick=nt}}}
  else{if(r.action==="add"||r.action==="update"){if(cur.inputString<NSTR-1)cur.inputString++}}
  render();save();
}
function handleDigitKey(digit){if(pendingDigit!==null){clearTimeout(pendingTimer);const combined=pendingDigit*10+digit;if(combined<=24){pendingDigit=null;commitFret(combined)}else{const p=pendingDigit;pendingDigit=null;commitFret(p);commitFret(digit)}}else{if(digit<=2){pendingDigit=digit;pendingTimer=setTimeout(()=>{if(pendingDigit!==null){commitFret(pendingDigit);pendingDigit=null}},400)}else{commitFret(digit)}}}
