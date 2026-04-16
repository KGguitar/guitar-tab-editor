/* ================================================================
   keyboard.js — キー入力ルーティング・ショートカット・入力補助
   ================================================================
   責務: keydownのカテゴリ分岐（Movement/Input/Edit/Technique/Selection）、
         2桁フレット入力バッファ、ショートカットヒント。
         Helpモーダル構築は help.js へ分離済み (Phase 36)。
         Toast表示は toast.js へ分離済み (Phase 36)。
   依存: グローバル変数 song, sel, cur, playback, appMode, state,
         pendingDigit, pendingTimer, helpVisible,
         isNoteSelected, isTickSelected, isRangeSelected, isMeasureSelected,
         isChordMode, isSingleMode, getCurrentMeasure, getSelectedEvent,
         getEventsAtTick, hasEventsAtTick,
         moveCur, setCur, moveString, setInputString, advanceToNextTick,
         advanceToPrevTick, toggleInputMode, commitFret, handleDigitKey,
         copySelection, pasteSelection, duplicateSelection, deleteSelection,
         handleDelete, toggleTech, transposeBy, moveTickBy,
         setRangeStart, setRangeEnd, clearRange, selectTick, selectMeasure,
         pH, undo, redo,
         toggleAttr, playFromSelection, stopPlayback,
         render, save, toast (toast.js), toggleHelp (help.js),
         pushActionLog, closeContextMenu, toggleDebugPanel

   keyboard.js = コマンド入口/キールーティング層。
   編集ロジック本体はselection-edit.js。
   このファイルは state.js, model.js, selection-edit.js, help.js, toast.js の後に読み込む。
*/

/* context-menu関数は context-menu.js へ分離済み (Phase 32) */
/* ヘルプモーダル関数 (toggleHelp/showHelp/hideHelp/ensureHelpModal) は help.js へ分離済み (Phase 36) */

function updatePendingDisplay(){
  const pd=pendingDigit;
  if(pd!==null){document.getElementById("st-right").textContent="入力待ち: "+pd+"_ (2桁目を待機中)"}
  else{updateShortcutHint()}
}
function updateShortcutHint(){
  document.getElementById("st-right").textContent="0-9:フレット Q/W/E:音価 T/H/P/S:奏法 Ctrl+←→:小節 ?:ヘルプ";
}

/* A. 移動系 */
function handleMovementKey(e){
  if(e.key==="ArrowLeft"){
    e.preventDefault();
    if(e.shiftKey){/* range拡張 */if(!sel.rangeStart)setRangeStart();moveCur(-1);setRangeEnd()}
    else if(e.ctrlKey||e.metaKey){/* 小節移動 */if(sel.measureIdx>0){sel.measureIdx--;sel.tick=0;sel.measureIdx=sel.measureIdx;sel.tick=0;if(sel.type==="note"){sel.type="tick";sel.eventId=null}render()}}
    else{moveCur(-1)}
    return true;
  }
  if(e.key==="ArrowRight"){
    e.preventDefault();
    if(e.shiftKey){if(!sel.rangeStart)setRangeStart();moveCur(1);setRangeEnd()}
    else if(e.ctrlKey||e.metaKey){if(sel.measureIdx<song.measures.length-1){sel.measureIdx++;sel.tick=0;sel.measureIdx=sel.measureIdx;sel.tick=0;if(sel.type==="note"){sel.type="tick";sel.eventId=null}render()}}
    else{moveCur(1)}
    return true;
  }
  if(e.key==="ArrowUp"){e.preventDefault();moveString(-1);return true}
  if(e.key==="ArrowDown"){e.preventDefault();moveString(1);return true}
  if(e.key==="Enter"){e.preventDefault();if(e.shiftKey)advanceToPrevTick();else advanceToNextTick();return true}
  if(e.key==="Tab"){e.preventDefault();if(e.shiftKey)advanceToPrevTick();else advanceToNextTick();return true}
  if(e.key==="Home"){e.preventDefault();sel.tick=0;sel.tick=0;if(sel.type==="note"){sel.type="tick";sel.eventId=null}render();return true}
  if(e.key==="End"){e.preventDefault();const total=mTk(song.meta.timeSignature);const step=getManualMoveStep();sel.tick=Math.max(0,total-step);sel.tick=sel.tick;if(sel.type==="note"){sel.type="tick";sel.eventId=null}render();return true}
  return false;
}

/* B. 入力系 */
function handleInputKey(e){
  /* 数字キー: フレット入力 */
  if(e.key>="0"&&e.key<="9"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    e.preventDefault();handleDigitKey(parseInt(e.key));updatePendingDisplay();return true;
  }
  /* 音価変更: Q=4分, W=8分, E=16分 */
  if(e.key==="q"&&!e.ctrlKey){e.preventDefault();cur.dur=TPB;cur.dotted=false;document.getElementById("ep-dot").classList.remove("act");buildDurBtns();render();toast("♩ 4分");return true}
  if(e.key==="w"&&!e.ctrlKey){e.preventDefault();cur.dur=TPB/2;cur.dotted=false;document.getElementById("ep-dot").classList.remove("act");buildDurBtns();render();toast("♪ 8分");return true}
  if(e.key==="e"&&!e.ctrlKey){e.preventDefault();cur.dur=TPB/4;cur.dotted=false;document.getElementById("ep-dot").classList.remove("act");buildDurBtns();render();toast("♬ 16分");return true}
  /* 付点 */
  if(e.key==="."){e.preventDefault();cur.dotted=!cur.dotted;document.getElementById("ep-dot").classList.toggle("act",cur.dotted);render();toast(cur.dotted?"付点 ON":"付点 OFF");return true}
  /* 入力モード切替 */
  if(e.key===" "){e.preventDefault();toggleInputMode();return true}
  return false;
}

/* C. 編集系 */
function handleEditKey(e){
  if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();handleDelete();return true}
  if((e.key==="z")&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.shiftKey?redo():undo();return true}
  if((e.key==="y")&&(e.ctrlKey||e.metaKey)){e.preventDefault();redo();return true}
  if((e.key==="c")&&(e.ctrlKey||e.metaKey)){e.preventDefault();copySelection();return true}
  if((e.key==="v")&&(e.ctrlKey||e.metaKey)){e.preventDefault();pasteSelection();return true}
  if((e.key==="d")&&(e.ctrlKey||e.metaKey)){e.preventDefault();duplicateSelection();return true}
  if(e.key==="-"){e.preventDefault();transposeBy(-1);return true}
  if(e.key==="+"||e.key==="="){e.preventDefault();transposeBy(1);return true}
  if(e.key==="["){e.preventDefault();moveTickBy(-getManualMoveStep());return true}
  if(e.key==="]"){e.preventDefault();moveTickBy(getManualMoveStep());return true}
  return false;
}

/* D. 奏法・記号系 */
function handleTechniqueKey(e){
  if(e.ctrlKey||e.metaKey||e.altKey)return false;
  const m=getCurrentMeasure();if(!m)return false;
  /* 接続系: note/tick選択時 */
  if(e.key==="t"){e.preventDefault();toggleTech("tie");return true}
  if(!e.shiftKey&&e.key==="h"){e.preventDefault();toggleTech("hammer");return true}
  if(e.key==="p"){e.preventDefault();toggleTech("pull");return true}
  if(!e.shiftKey&&e.key==="s"){e.preventDefault();toggleTech("slide");return true}
  /* attrs系 — note選択時のみ */
  const toggleNoteAttr=(attr,label)=>{
    if(!isNoteSelected())return;const ne=getSelectedEvent();if(!ne)return;
    pH();toggleAttr(ne,attr);render();save();toast(ne.attrs[attr]?label+" ON":label+" OFF");
  };
  if(e.key==="v"){e.preventDefault();toggleNoteAttr("vibrato","Vibrato");return true}
  if(!e.shiftKey&&e.key==="m"){e.preventDefault();toggleNoteAttr("mute","Mute");return true}
  if(!e.shiftKey&&e.key==="a"){e.preventDefault();toggleNoteAttr("accent","Accent");return true}
  if(!e.shiftKey&&e.key==="g"){e.preventDefault();toggleNoteAttr("ghost","Ghost");return true}
  if(e.key==="D"){e.preventDefault();toggleNoteAttr("dead","Dead");return true}/* Shift+D */
  if(e.key==="H"){e.preventDefault();toggleNoteAttr("harmonic","Harmonic");return true}/* Shift+H */
  /* tick属性: rest */
  if(e.key==="r"){e.preventDefault();
    const ta=getTickAttrs(m,sel.tick);pH();setTickAttr(m,sel.tick,{rest:!(ta&&ta.rest)});render();save();
    toast((getTickAttrs(m,sel.tick)||{}).rest?"Rest ON":"Rest OFF");return true;
  }
  return false;
}

/* E. 選択・ヘルプ系 */
function handleSelectionKey(e){
  if(e.key==="Escape"){e.preventDefault();closeContextMenu();selectTick(sel.measureIdx,sel.tick);clearRange();if(helpVisible)toggleHelp();return true}
  if(e.key==="?"||(e.key==="/"&&e.shiftKey)){e.preventDefault();toggleHelp();return true}
  return false;
}

/* メインルーター */
/* 直接登録は bindKeyboardEvents() に統合済み */

/* --- keyboard bind entry point (called from ui-app.js) --- */
var _kbHandler=null;
function bindKeyboardEvents(){
  var el=document.getElementById("score-area");
  if(_kbHandler)el.removeEventListener("keydown",_kbHandler);
  _kbHandler=function(e){
    if(e.target.tagName==="INPUT"||e.target.isContentEditable)return;
    if(e.key===" ")e.preventDefault();
    if(handleSelectionKey(e))return;
    if(handleMovementKey(e))return;
    if(handleInputKey(e))return;
    if(handleEditKey(e))return;
    if(handleTechniqueKey(e))return;
  };
  el.addEventListener("keydown",_kbHandler);
}
