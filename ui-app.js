/* ================================================================
   ui-app.js — UIイベント入口・アプリ束ね層・起動管理
   ================================================================
   責務: DOMイベント配線、UIアクションラッパー、アプリ初期化/起動。
         他モジュール(model/selection-edit/render/viewer/io/playback)を束ねる上位層。
   依存: グローバル変数 song, sel, cur, hist, clipboard, playback, debugUI,
         appMode, sharedViewModel, editorMeta, state, spanPending, pendingDigit,
         pendingTimer, helpVisible, _autoBackupTimer,
         全モジュールの公開関数
   
   model/selection-edit/render/viewer/io/playback の後に読み込む。
   
   // app bootstrap → dom refs → ui build → event binding → startup restore → initial render
*/

function openBpmPopup(el){const old=document.querySelector(".bpm-popup");if(old){old.remove();return}const popup=document.createElement("div");popup.className="bpm-popup";popup.style.cssText="position:fixed;background:#fff;border:1px solid #ccc;border-radius:8px;padding:12px 14px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:100;width:220px";const rect=el.getBoundingClientRect();popup.style.top=(rect.bottom+4)+"px";popup.style.left=Math.max(4,rect.left)+"px";const disp=document.createElement("div");disp.style.cssText="font:700 20px var(--fu);text-align:center;margin-bottom:8px";disp.textContent=song.meta.tempo;const slider=document.createElement("input");slider.type="range";slider.min="40";slider.max="240";slider.value=song.meta.tempo;slider.style.cssText="width:100%;cursor:pointer;height:28px";slider.addEventListener("input",function(){disp.textContent=this.value});slider.addEventListener("change",function(){setBpm(+this.value);popup.remove()});popup.appendChild(disp);popup.appendChild(slider);document.body.appendChild(popup);setTimeout(()=>{document.addEventListener("click",function cl(ev){if(!popup.contains(ev.target)&&ev.target!==el){popup.remove();document.removeEventListener("click",cl)}})},0)}
function openTSPopup(el){const old=document.querySelector(".ts-popup");if(old){old.remove();return}const popup=document.createElement("div");popup.className="ts-popup";["4/4","3/4","6/8","2/4","5/4"].forEach(o=>{const btn=document.createElement("button");btn.textContent=o;if(o===song.meta.timeSignature.beats+"/"+song.meta.timeSignature.beatUnit)btn.classList.add("sel");btn.addEventListener("click",function(ev){ev.stopPropagation();setTS(o);popup.remove()});popup.appendChild(btn)});el.style.position="relative";popup.style.position="absolute";popup.style.top="100%";popup.style.left="0";popup.style.marginTop="4px";el.appendChild(popup);setTimeout(()=>{document.addEventListener("click",function cl(ev){if(!popup.contains(ev.target)){popup.remove();document.removeEventListener("click",cl)}})},0)}

/* ================================================================
   Phase 18: デバッグ / インスペクト / アクションログ
   ================================================================
   軽量監査: セッション中のみ。永続化なし。
   将来: diff表示、変更比較、永続ログへ拡張可能。
*/


/* debug関数は debug.js へ分離済み (Phase 32) */

/* context-menu関数は context-menu.js へ分離済み (Phase 32) */

/* keyboard/help/pending関数は keyboard.js へ分離済み (Phase 33) */

/* ================================================================ BUILD UI ================================================================ */
function buildStringButtons(){const g=document.getElementById("ep-strings");g.innerHTML="";TLB.standard.forEach((label,i)=>{const b=document.createElement("button");b.className="ep-btn string-btn"+(i===cur.inputString?" act":"");b.textContent=label;b.title=(i+1)+"弦";b.addEventListener("click",()=>setInputString(i));g.appendChild(b)})}

function buildPadMain(){
  const g=document.getElementById("pad-main-grid");g.innerHTML="";
  const focus=()=>document.getElementById("score-area").focus();
  // Row 1: 1 2 3
  for(let i=1;i<=3;i++){const b=document.createElement("button");b.className="pad-fret";b.textContent=i;b.addEventListener("click",()=>{commitFret(i);focus()});g.appendChild(b)}
  // 10
  const b10=document.createElement("button");b10.className="pad-fret";b10.textContent="10";b10.style.fontSize="13px";b10.addEventListener("click",()=>{commitFret(10);focus()});g.appendChild(b10);
  // Row 2: 4 5 6 11
  for(let i=4;i<=6;i++){const b=document.createElement("button");b.className="pad-fret";b.textContent=i;b.addEventListener("click",()=>{commitFret(i);focus()});g.appendChild(b)}
  const b11=document.createElement("button");b11.className="pad-fret";b11.textContent="11";b11.style.fontSize="13px";b11.addEventListener("click",()=>{commitFret(11);focus()});g.appendChild(b11);
  // Row 3: 7 8 9 12
  for(let i=7;i<=9;i++){const b=document.createElement("button");b.className="pad-fret";b.textContent=i;b.addEventListener("click",()=>{commitFret(i);focus()});g.appendChild(b)}
  const b12=document.createElement("button");b12.className="pad-fret";b12.textContent="12";b12.style.fontSize="13px";b12.addEventListener("click",()=>{commitFret(12);focus()});g.appendChild(b12);
  // Row 4: 0 (span 2) + empty cells
  const b0=document.createElement("button");b0.className="pad-fret zero";b0.textContent="0";b0.addEventListener("click",()=>{commitFret(0);focus()});g.appendChild(b0);
}

function buildPadExt(){
  const g=document.getElementById("pad-ext-grid");g.innerHTML="";
  const focus=()=>document.getElementById("score-area").focus();
  for(let i=13;i<=24;i++){
    const b=document.createElement("button");b.className="pad-fret-ext";b.textContent=i;
    b.addEventListener("click",()=>{commitFret(i);focus()});g.appendChild(b);
  }
}

function buildDurBtns(){const g=document.getElementById("ep-dur");g.innerHTML="";DUR_OPTS.forEach(d=>{const b=document.createElement("button");b.className="ep-btn"+(d.value===cur.dur?" act":"");b.textContent=d.label;b.addEventListener("click",()=>{cur.dur=d.value;cur.dotted=false;document.getElementById("ep-dot").classList.remove("act");buildDurBtns();render();document.getElementById("score-area").focus()});g.appendChild(b)})}
function buildTechBtns(){const g=document.getElementById("ep-tech");g.innerHTML="";TECH_MAP.forEach(t=>{const b=document.createElement("button");b.className="ep-btn";b.id="ep-"+t.id;b.textContent=t.label;b.addEventListener("click",()=>{toggleTech(t.id);document.getElementById("score-area").focus()});g.appendChild(b)})}

/* ================================================================ BIND ================================================================ */
function bindAll(){
  document.getElementById("btn-undo").addEventListener("click",undo);document.getElementById("btn-redo").addEventListener("click",redo);
  document.getElementById("btn-save").addEventListener("click",exportSongJson);document.getElementById("btn-load").addEventListener("click",()=>document.getElementById("jsonFileIn").click());document.getElementById("btn-png").addEventListener("click",exportPNG);document.getElementById("btn-exchange").addEventListener("click",showExchangeModelDebug);document.getElementById("btn-shared").addEventListener("click",exportSharedJson);
  /* Phase 14+19: Play/Stop/Loop */
  document.getElementById("btn-play").addEventListener("click",()=>{playFromSelection()});
  document.getElementById("btn-play-top").addEventListener("click",()=>{playAll()});
  document.getElementById("btn-stop").addEventListener("click",stopPlayback);
  document.getElementById("btn-loop").addEventListener("click",()=>{playback.loopEnabled=!playback.loopEnabled;updatePlaybackUI();toast(playback.loopEnabled?"ループ ON":"ループ OFF")});
  document.getElementById("btn-play-range").addEventListener("click",()=>{playSelectionRange()});
  /* Phase 20: 左パネル再生ボタン */
  document.getElementById("ep-play-sel").addEventListener("click",()=>{playFromSelection()});
  document.getElementById("ep-play-range").addEventListener("click",()=>{playSelectionRange()});
  document.getElementById("ep-stop2").addEventListener("click",stopPlayback);
  document.getElementById("ep-loop2").addEventListener("click",()=>{playback.loopEnabled=!playback.loopEnabled;updatePlaybackUI();toast(playback.loopEnabled?"ループ ON":"ループ OFF")});
  document.getElementById("ep-countin").addEventListener("click",()=>{playback.countInEnabled=!playback.countInEnabled;updatePlaybackUI();toast(playback.countInEnabled?"Count-in ON":"Count-in OFF")});
  document.getElementById("ep-metro").addEventListener("click",()=>{playback.metronomeEnabled=!playback.metronomeEnabled;updatePlaybackUI();toast(playback.metronomeEnabled?"Metronome ON":"Metronome OFF")});
  /* Speed buttons */
  const speedContainer=document.getElementById("ep-speed-btns");
  [0.5,0.75,1.0,1.25,1.5].forEach(spd=>{
    const btn=document.createElement("button");btn.className="ep-btn sm";
    btn.style.cssText="font-size:9px;padding:2px 5px;min-width:0";btn.textContent=spd+"x";
    if(playback.speed===spd)btn.classList.add("act");
    btn.addEventListener("click",()=>{playback.speed=spd;updatePlaybackUI();toast("Speed: "+spd+"x")});
    speedContainer.appendChild(btn);
  });
  document.getElementById("ep-set-pr").addEventListener("click",()=>{setPlayRangeFromSelection()});
  document.getElementById("ep-autoscroll").addEventListener("click",()=>{playback.autoScrollEnabled=!playback.autoScrollEnabled;updatePlaybackUI();toast(playback.autoScrollEnabled?"自動追従 ON":"自動追従 OFF")});
  document.getElementById("inp-title").addEventListener("change",function(){setTitle(this.value)});
  document.getElementById("btn-fb-toggle").addEventListener("click",function(){document.getElementById("fb-area").classList.toggle("hidden");this.classList.toggle("act")});
  document.getElementById("shBpm").addEventListener("click",function(){openBpmPopup(this)});document.getElementById("shTS").addEventListener("click",function(){openTSPopup(this)});
  document.getElementById("mode-single").addEventListener("click",()=>{if(!isSingleMode()){cur.inputMode="single";render();toast("♪ 単音モード");document.getElementById("score-area").focus()}});
  document.getElementById("mode-chord").addEventListener("click",()=>{if(!isChordMode()){cur.inputMode="chord";render();toast("♫ 和音モード");document.getElementById("score-area").focus()}});
  document.getElementById("ep-dot").addEventListener("click",function(){cur.dotted=!cur.dotted;this.classList.toggle("act",cur.dotted);render();document.getElementById("score-area").focus()});
  const focus=()=>document.getElementById("score-area").focus();
  document.getElementById("ep-copy").addEventListener("click",()=>{copySelection();focus()});document.getElementById("ep-paste").addEventListener("click",()=>{pasteSelection();focus()});
  document.getElementById("ep-overwrite").addEventListener("click",()=>{overwriteTickGroup();focus()});document.getElementById("ep-dup").addEventListener("click",()=>{duplicateSelection();focus()});
  document.getElementById("ep-tr-down").addEventListener("click",()=>{transposeBy(-1);focus()});document.getElementById("ep-tr-up").addEventListener("click",()=>{transposeBy(1);focus()});
  document.getElementById("ep-mv-l").addEventListener("click",()=>{moveTickBy(-getManualMoveStep());focus()});document.getElementById("ep-mv-r").addEventListener("click",()=>{moveTickBy(getManualMoveStep());focus()});
  document.getElementById("ep-add-m").addEventListener("click",addM);document.getElementById("ep-dup-m").addEventListener("click",dupM);document.getElementById("ep-del-m").addEventListener("click",delM);
  /* Phase 5: tick属性 */
  document.getElementById("ep-strum-dn").addEventListener("click",()=>{const m=getCurrentMeasure();if(!m)return;pH();const ta=getTickAttrs(m,sel.tick);setTickAttr(m,sel.tick,{strum:ta&&ta.strum==="down"?null:"down"});render();save();focus()});
  document.getElementById("ep-strum-up").addEventListener("click",()=>{const m=getCurrentMeasure();if(!m)return;pH();const ta=getTickAttrs(m,sel.tick);setTickAttr(m,sel.tick,{strum:ta&&ta.strum==="up"?null:"up"});render();save();focus()});
  document.getElementById("ep-rest").addEventListener("click",()=>{const m=getCurrentMeasure();if(!m)return;pH();const ta=getTickAttrs(m,sel.tick);setTickAttr(m,sel.tick,{rest:!(ta&&ta.rest)});render();save();focus()});
  /* Phase 15: 単音属性ボタン */
  ["accent","ghost","dead","harmonic"].forEach(attr=>{
    document.getElementById("ep-"+attr).addEventListener("click",()=>{
      if(!isNoteSelected()){toast("ノートを選択してください");return}
      const ne=getSelectedEvent();if(!ne)return;
      pH();toggleAttr(ne,attr);render();save();
      toast(ne.attrs[attr]?attr+" ON":attr+" OFF");focus();
    });
  });
  /* Phase 5: 小節属性 */
  document.getElementById("ep-rpt-start").addEventListener("click",()=>{const m=getCurrentMeasure();if(!m)return;pH();toggleMeasureAttr(m,"repeatStart");render();save();toast(m.attrs.repeatStart?"Repeat Start ON":"Repeat Start OFF");focus()});
  document.getElementById("ep-rpt-end").addEventListener("click",()=>{const m=getCurrentMeasure();if(!m)return;pH();toggleMeasureAttr(m,"repeatEnd");render();save();toast(m.attrs.repeatEnd?"Repeat End ON":"Repeat End OFF");focus()});
  document.getElementById("ep-ending").addEventListener("click",()=>{const m=getCurrentMeasure();if(!m)return;pH();const cur_e=m.attrs?m.attrs.ending:null;if(!cur_e)setMeasureEnding(m,1);else if(cur_e<3)setMeasureEnding(m,cur_e+1);else setMeasureEnding(m,null);render();save();toast(m.attrs.ending?"Ending "+m.attrs.ending:"Ending OFF");focus()});
  /* Phase 5: 範囲記号 */
  document.getElementById("ep-pm-start").addEventListener("click",()=>{spanPending.palmMute={measureIdx:sel.measureIdx,tick:sel.tick};render();toast("PM開始点を記録");focus()});
  document.getElementById("ep-pm-end").addEventListener("click",()=>{if(!spanPending.palmMute){toast("先にPM開始を設定");return}pH();addSpan("palmMute",spanPending.palmMute,{measureIdx:sel.measureIdx,tick:sel.tick});spanPending.palmMute=null;render();save();toast("Palm Mute範囲を作成");focus()});
  document.getElementById("ep-lr-start").addEventListener("click",()=>{spanPending.letRing={measureIdx:sel.measureIdx,tick:sel.tick};render();toast("LR開始点を記録");focus()});
  document.getElementById("ep-lr-end").addEventListener("click",()=>{if(!spanPending.letRing){toast("先にLR開始を設定");return}pH();addSpan("letRing",spanPending.letRing,{measureIdx:sel.measureIdx,tick:sel.tick});spanPending.letRing=null;render();save();toast("Let Ring範囲を作成");focus()});
  /* Phase 7: 範囲選択・小節選択 */
  document.getElementById("ep-range-start").addEventListener("click",()=>{setRangeStart();focus()});
  document.getElementById("ep-range-end").addEventListener("click",()=>{setRangeEnd();focus()});
  document.getElementById("ep-range-clear").addEventListener("click",()=>{clearRange();toast("範囲解除");focus()});
  document.getElementById("ep-sel-measure").addEventListener("click",()=>{selectMeasure(sel.measureIdx);toast("小節選択");focus()});
  // Pad ops
  document.getElementById("pad-del").addEventListener("click",()=>{handleDelete();focus()});
  document.getElementById("pad-prev").addEventListener("click",()=>{advanceToPrevTick();focus()});document.getElementById("pad-next").addEventListener("click",()=>{advanceToNextTick();focus()});
  document.getElementById("pad-str-up").addEventListener("click",()=>{moveString(-1);focus()});document.getElementById("pad-str-dn").addEventListener("click",()=>{moveString(1);focus()});
  document.getElementById("fb-area").addEventListener("click",handleFBInput);
  document.getElementById("jsonFileIn").addEventListener("change",function(){if(this.files.length){importSongJson(this.files[0]);this.value=""}});
  document.getElementById("rY").addEventListener("click",function(){document.getElementById("rDlg").style.display="none";const s=loadLS();if(s){applySong(s)}else{render();renderFB()}});
  document.getElementById("rN").addEventListener("click",function(){document.getElementById("rDlg").style.display="none";localStorage.removeItem(SK);render();renderFB()});
  bindToolsEvents();
  bindSlotsEvents();
  bindDebugDelegation();
  bindHelpDelegation();
  bindGlobalEvents();
  bindKeyboardEvents();/* Phase 33: keyboard.jsで定義 */
}

/* --- Phase 25: ツールセクション配線（将来 ui-app.js へ移動可能） --- */
function bindToolsEvents(){
  document.getElementById("ep-tools-toggle").addEventListener("click",()=>{document.getElementById("ep-tools-body").classList.toggle("hidden")});
  document.getElementById("ep-tool-export-json").addEventListener("click",()=>{exportSongJson()});
  document.getElementById("ep-tool-import-json").addEventListener("click",()=>{safeImportSongJson()});
  document.getElementById("ep-tool-png").addEventListener("click",()=>{exportPNG()});
  document.getElementById("ep-tool-exchange").addEventListener("click",()=>{showExchangeModelDebug()});
  document.getElementById("ep-tool-shared").addEventListener("click",()=>{exportSharedJson()});
  document.getElementById("ep-tool-debug").addEventListener("click",()=>{toggleDebugPanel()});
}

/* --- Phase 25: スロットセクション配線 — event delegation（将来 ui-app.js へ移動可能） --- */
function bindSlotsEvents(){
  document.getElementById("ep-slots-toggle").addEventListener("click",()=>{document.getElementById("slot-panel-body").classList.toggle("hidden");renderSlotPanel()});
  document.getElementById("slot-panel-body").addEventListener("click",function(e){
    const btn=e.target.closest("[data-slot-action]");if(!btn)return;
    const action=btn.getAttribute("data-slot-action");
    const slot=parseInt(btn.getAttribute("data-slot"));
    if(action==="load")loadFromSlot(slot);
    else if(action==="save"){saveToSlot(slot);renderSlotPanel()}
    else if(action==="delete"){deleteSlot(slot)}
    else if(action==="restore-ab")restoreAutoBackup();
  });
}

/* --- Phase 25: Debug event delegation（将来 debug.js へ移動可能） --- */
function bindDebugDelegation(){
  document.getElementById("debug-panel").addEventListener("click",function(e){
    const btn=e.target.closest("[data-debug-action]");if(!btn)return;
    if(btn.getAttribute("data-debug-action")==="validate")runDebugValidate();
  });
}

/* --- Phase 25: Help event delegation --- */
function bindHelpDelegation(){
  document.addEventListener("click",function(e){
    const btn=e.target.closest("[data-help-action]");if(!btn)return;
    if(btn.getAttribute("data-help-action")==="close")toggleHelp();
  });
}

/* --- Phase 25: グローバルイベント（将来 ui-app.js へ移動可能） --- */
function bindGlobalEvents(){
  window.addEventListener("resize",()=>{if(appMode==="editor"){render();renderFB()}else{renderViewerIfActive()}});
  document.addEventListener("click",function(e){if(!document.getElementById("ctx-menu").contains(e.target))closeContextMenu()});
}

/* ================================================================
   Phase 13: 読み取り専用ビュー (Viewer Mode)
   ================================================================
   Viewerは sharedModel だけで描画する。
   Editor内部状態（song/sel/cur/clipboard）に一切依存しない。
   将来は別ページ/別HTMLに分離可能。
*/


/* Viewer関数は viewer.js へ分離済み (Phase 29) */

function init(){
  /* Phase 34: DOM参照取得 */
  els = createDomRefs();
  buildStringButtons();buildPadMain();buildPadExt();buildDurBtns();buildTechBtns();bindAll();uHead();
  /* Viewer buttons */
  document.getElementById("btn-viewer").addEventListener("click",()=>{if(appMode==="editor")enterViewerFromCurrentSong();else exitViewer()});
  document.getElementById("btn-back-editor").addEventListener("click",exitViewer);
  document.getElementById("btn-vw-load").addEventListener("click",()=>document.getElementById("vwJsonFileIn").click());
  document.getElementById("vwJsonFileIn").addEventListener("change",function(){
    if(!this.files.length)return;const r=new FileReader();
    r.onload=function(ev){try{const d=JSON.parse(ev.target.result);enterViewer(d)}catch(err){toast("読込失敗: "+err.message)}};
    r.readAsText(this.files[0]);this.value="";
  });
  /* Debug panel */
  document.getElementById("debug-toggle").addEventListener("click",toggleDebugPanel);
  document.addEventListener("keydown",function(e){if(e.ctrlKey&&e.shiftKey&&e.key==="D"){e.preventDefault();toggleDebugPanel()}});
  /* Phase 24: 起動時復元導線 */
  const hasDraft=!!loadLS();const ab=loadAutoBackup();
  if(hasDraft||ab){
    let msg="";
    if(hasDraft)msg+="下書きデータがあります。";
    if(ab){const d=new Date(ab.savedAt);msg+="\n自動BK: "+(ab.title||"無題")+" ("+d.toLocaleTimeString().slice(0,5)+")"}
    document.getElementById("rDlg-msg").textContent=msg||"前回のデータを復元しますか？";
    if(ab&&!hasDraft){
      const abBtn=document.createElement("button");abBtn.textContent="自動BKから復元";abBtn.style.cssText="margin-top:6px;font:13px var(--fu);padding:6px 14px;border:1px solid var(--ui-bdr);background:#fff;border-radius:5px;cursor:pointer";
      abBtn.addEventListener("click",()=>{document.getElementById("rDlg").style.display="none";restoreAutoBackup()});
      document.getElementById("rDlg-ab").appendChild(abBtn);
    }
    document.getElementById("rDlg").style.display="flex";
  }else{render();renderFB()}
  document.getElementById("score-area").focus();
}
