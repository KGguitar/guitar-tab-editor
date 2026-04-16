/* ================================================================
   debug.js — 開発・監査用UI補助
   ================================================================
   責務: デバッグパネル開閉、アクションログ、validate表示、
         selection/note/measure/span/clipboard/playback summary。
   依存: グローバル変数 debugUI, song, sel, cur, clipboard, playback,
         state, TLB, TECH_MAP,
         getCurrentMeasure, getSelectedEvent, isNoteSelected,
         getEventLinks, hasLinkType, getSpansAtPosition,
         validateSong, toast
   
   stateを読むが広く書き換えない。validateSong本体はmodel.js。
   このファイルは state.js, model.js, selection-edit.js の後に読み込む。
*/

function pushActionLog(msg){
  debugUI.actionLog.unshift({at:Date.now(),message:msg});
  if(debugUI.actionLog.length>20)debugUI.actionLog.length=20;
  if(debugUI.isOpen)renderDebugPanel();
}

function toggleDebugPanel(){
  debugUI.isOpen=!debugUI.isOpen;
  document.getElementById("debug-panel").classList.toggle("open",debugUI.isOpen);
  if(debugUI.isOpen)renderDebugPanel();
}

function renderDebugPanel(){
  const el=document.getElementById("debug-panel");if(!el)return;
  const m=getCurrentMeasure();const ne=getSelectedEvent();
  let h="";

  /* Selection */
  h+='<div class="dbg-title">Selection</div>';
  h+=dbgRow("type",sel.type)+dbgRow("measureIdx",sel.measureIdx)+dbgRow("tick",sel.tick);
  if(sel.eventId)h+=dbgRow("eventId",sel.eventId);
  if(sel.rangeStart)h+=dbgRow("rangeStart","M"+(sel.rangeStart.measureIdx+1)+" T"+sel.rangeStart.tick);
  if(sel.rangeEnd)h+=dbgRow("rangeEnd","M"+(sel.rangeEnd.measureIdx+1)+" T"+sel.rangeEnd.tick);

  /* Selected Event */
  if(ne){
    h+='<div class="dbg-title">Selected Note</div>';
    h+=dbgRow("id",ne.id)+dbgRow("string",TLB.standard[ne.stringIndex])+dbgRow("fret",ne.fret)+dbgRow("dur",ne.durationTick);
    const aOn=Object.keys(ne.attrs||{}).filter(k=>ne.attrs[k]);
    if(aOn.length)h+=dbgRow("attrs",aOn.join(", "));
    if(ne.links&&ne.links.length)h+=dbgRow("links",ne.links.map(l=>l.type+(l.toEventId?"→"+l.toEventId.slice(-4):"")).join(", "));
  }

  /* Current Measure */
  if(m){
    h+='<div class="dbg-title">Measure '+(sel.measureIdx+1)+'</div>';
    h+=dbgRow("events",m.events.length);
    const ma=m.attrs||{};const maOn=Object.keys(ma).filter(k=>ma[k]);
    if(maOn.length)h+=dbgRow("attrs",maOn.join(", "));
    const taKeys=Object.keys(m.tickAttrs||{});
    if(taKeys.length)h+=dbgRow("tickAttrs",taKeys.map(k=>"t"+k+":"+JSON.stringify(m.tickAttrs[k])).join(" "));
  }

  /* Spans */
  const spans=song.spans||[];
  if(spans.length){
    h+='<div class="dbg-title">Spans ('+spans.length+')</div>';
    spans.forEach(sp=>{h+='<div class="dbg-row">'+sp.type+" M"+(sp.start.measureIdx+1)+"T"+sp.start.tick+"→M"+(sp.end.measureIdx+1)+"T"+sp.end.tick+"</div>"});
  }

  /* Clipboard */
  h+='<div class="dbg-title">Clipboard</div>';
  h+=dbgRow("type",clipboard.type||"empty");

  /* Playback */
  h+='<div class="dbg-title">Playback</div>';
  h+=dbgRow("playing",playback.isPlaying)+dbgRow("nodes",playback.activeNodes.length)+dbgRow("timers",playback.timers.length);

  /* Validate */
  h+='<div class="dbg-title">Validate <button class="dbg-btn" data-debug-action="validate">Run</button></div>';
  h+='<div id="dbg-validate-out"></div>';

  /* Action Log */
  h+='<div class="dbg-title">Action Log ('+debugUI.actionLog.length+')</div>';
  debugUI.actionLog.forEach(l=>{
    const t=new Date(l.at);const ts=String(t.getHours()).padStart(2,"0")+":"+String(t.getMinutes()).padStart(2,"0")+":"+String(t.getSeconds()).padStart(2,"0");
    h+='<div class="dbg-log"><span class="dbg-time">'+ts+"</span>"+l.message+"</div>";
  });

  el.innerHTML=h;
}

function dbgRow(key,val){return'<div class="dbg-row"><span class="dbg-key">'+key+':</span><span class="dbg-val">'+val+"</span></div>"}

function runDebugValidate(){
  const issues=validateSong(song);
  const out=document.getElementById("dbg-validate-out");
  if(!out)return;
  if(!issues.length){out.innerHTML='<div class="dbg-row" style="color:#8d8">✓ 問題なし</div>'}
  else{out.innerHTML=issues.map(i=>'<div class="dbg-warn">⚠ '+i+"</div>").join("")}
}

/* ================================================================ TOAST ================================================================ */
let _toastT=null;function toast(msg){const el=document.getElementById("toast");el.textContent=msg;el.classList.add("show");if(_toastT)clearTimeout(_toastT);_toastT=setTimeout(()=>{el.classList.remove("show")},1200)}

/* ================================================================
   Phase 17: コンテキストメニュー
   ================================================================
   右クリック = 対象単位に応じた操作の近道。左パネルの補助。
   Viewerでは編集メニュー無効。
*/

/* toast は ui-app.js 側で定義 */
