/* ================================================================
   state.js — 共有stateコンテナ / 初期化 / ショートカット変数
   ================================================================
   責務: アプリ全体の状態定義と初期生成。副作用なし。
         DOM操作・render・save・playback実行は含まない。
   
   依存: model.js（nSong() のみ）
   
   各モジュールの state 依存範囲:
     selection-edit.js → state.song, state.sel, state.cur, state.clipboard, state.hist
     playback.js       → state.song, state.sel, state.playback
     render.js         → state.song, state.sel, state.cur, state.playback (読み取りのみ)
     viewer.js         → state.appMode, state.sharedViewModel
     io.js             → state.song, state.editorMeta
     ui-app.js         → 全state（束ね層として）
   
   state 丸ごと差し替え箇所:
     applySong()     → state.song 差し替え（import/load/restore）
     undo() / redo() → state.song 差し替え
     enterViewer()   → state.appMode + state.sharedViewModel
     exitViewer()    → state.appMode + state.sharedViewModel
   
   このファイルは model.js の後、他モジュールの前に読み込む。
*/

/* --- state コンテナ生成 --- */
function createInitialState(){
  return {
    /* === editor data === */
    song: nSong(),
    /* === input settings === */
    cur: {dur:48,dotted:false,inputMode:"single",inputString:0},
    /* === selection === */
    sel: {type:"tick",measureIdx:0,tick:0,eventId:null,rangeStart:null,rangeEnd:null},
    /* === undo/redo history === */
    hist: {u:[],r:[],mx:50},
    /* === clipboard === */
    clipboard: {type:null,payload:null,meta:{}},
    /* === playback state === */
    playback: {isPlaying:false,stopRequested:false,activeNodes:[],timers:[],
      currentMeasureIdx:-1,currentTick:-1,animFrame:null,
      loopEnabled:false,playRange:{enabled:false,start:null,end:null},
      speed:1.0,countInEnabled:false,metronomeEnabled:false,autoScrollEnabled:true},
    /* === debug === */
    debugUI: {isOpen:false,actionLog:[]},
    /* === ui state (non-data) === */
    uiState: {helpVisible:false,spanPending:{palmMute:null,letRing:null},
      delMConfirm:null,pendingDigit:null,pendingTimer:null},
    /* === app mode === */
    appMode: "editor",
    sharedViewModel: null,
    /* === save meta === */
    editorMeta: {isDirty:false}
  };
}

/* --- state インスタンス --- */
const state = createInitialState();

/* --- ショートカット変数 ---
   state.xxx への参照。既存コード互換。
   オブジェクト型は参照共有。プリミティブ型（appMode等）は代入時にstate側も更新する。 */
let song = state.song;
let cur = state.cur;
let sel = state.sel;
let hist = state.hist;
let clipboard = state.clipboard;
let playback = state.playback;
let debugUI = state.debugUI;
let appMode = state.appMode;
let sharedViewModel = state.sharedViewModel;
let editorMeta = state.editorMeta;
let spanPending = state.uiState.spanPending;
let delMConfirm = state.uiState.delMConfirm;
let pendingDigit = state.uiState.pendingDigit;
let pendingTimer = state.uiState.pendingTimer;
let helpVisible = state.uiState.helpVisible;
let _autoBackupTimer = null;

/* --- reset helpers --- */
function resetSelectionState(){
  sel.type="tick";sel.measureIdx=0;sel.tick=0;sel.eventId=null;
  sel.rangeStart=null;sel.rangeEnd=null;
}
function resetPlaybackState(){
  playback.isPlaying=false;playback.stopRequested=false;
  playback.activeNodes=[];playback.timers=[];
  playback.currentMeasureIdx=-1;playback.currentTick=-1;
}
