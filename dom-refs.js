/* ================================================================
   dom-refs.js — DOM参照取得・キャッシュ・要素束ね
   ================================================================
   責務: DOM要素の取得と構造化された参照の提供。
         イベントbind・state更新・render・編集ロジックは含まない。
   依存: なし（DOM APIのみ）
   
   使い方: const els = createDomRefs();
   各moduleは els.toolbar.play, els.editor.scoreArea 等で参照可能。
   
   このファイルは他の全JSファイルの前（model.jsの前）に読み込んでよい。
*/

function createDomRefs(root){
  const d=root||document;
  const g=function(id){return d.getElementById(id)};
  return {
    /* --- toolbar --- */
    toolbar: {
      title: g("inp-title"),
      undo: g("btn-undo"), redo: g("btn-redo"),
      save: g("btn-save"), load: g("btn-load"), png: g("btn-png"),
      exchange: g("btn-exchange"), shared: g("btn-shared"),
      fbToggle: g("btn-fb-toggle"),
      play: g("btn-play"), playTop: g("btn-play-top"), stop: g("btn-stop"),
      loop: g("btn-loop"), playRange: g("btn-play-range"),
      viewer: g("btn-viewer")
    },
    /* --- editor area --- */
    editor: {
      panel: g("edit-panel"),
      scoreArea: g("score-area"),
      scoreInner: g("score-inner"),
      systems: g("systems"),
      bpm: g("shBpm"), ts: g("shTS")
    },
    /* --- edit panel controls --- */
    panel: {
      selType: g("ep-sel-type"), measure: g("ep-m"), tick: g("ep-t"), noteCount: g("ep-nc"),
      strings: g("ep-strings"), dur: g("ep-dur"), dot: g("ep-dot"),
      modeChord: g("mode-chord"), modeSingle: g("mode-single"),
      /* tech */
      tech: g("ep-tech"),
      /* note attrs */
      accent: g("ep-accent"), ghost: g("ep-ghost"), dead: g("ep-dead"), harmonic: g("ep-harmonic"),
      /* links */
      linksSection: g("ep-links-section"), linksList: g("ep-links-list"),
      /* tick attrs */
      strumDn: g("ep-strum-dn"), strumUp: g("ep-strum-up"), rest: g("ep-rest"),
      /* edit ops */
      copy: g("ep-copy"), paste: g("ep-paste"), overwrite: g("ep-overwrite"), dup: g("ep-dup"),
      trDown: g("ep-tr-down"), trUp: g("ep-tr-up"), mvL: g("ep-mv-l"), mvR: g("ep-mv-r"),
      /* range */
      rangeStart: g("ep-range-start"), rangeEnd: g("ep-range-end"),
      rangeClear: g("ep-range-clear"), selMeasure: g("ep-sel-measure"),
      pmStart: g("ep-pm-start"), pmEnd: g("ep-pm-end"),
      lrStart: g("ep-lr-start"), lrEnd: g("ep-lr-end"),
      spanStatus: g("ep-span-status"),
      /* measure */
      rptStart: g("ep-rpt-start"), rptEnd: g("ep-rpt-end"), ending: g("ep-ending"),
      addM: g("ep-add-m"), dupM: g("ep-dup-m"), delM: g("ep-del-m"),
      /* playback panel */
      playSel: g("ep-play-sel"), playRangeBtn: g("ep-play-range"),
      stop2: g("ep-stop2"), loop2: g("ep-loop2"),
      countin: g("ep-countin"), metro: g("ep-metro"),
      speedBtns: g("ep-speed-btns"), setPr: g("ep-set-pr"),
      autoscroll: g("ep-autoscroll"), playInfo: g("ep-play-info")
    },
    /* --- sections (show/hide targets) --- */
    sections: {
      tech: g("sec-tech"), noteAttrs: g("sec-note-attrs"),
      tickAttrs: g("sec-tick-attrs"), range: g("sec-range"),
      edit: g("sec-edit"), measure: g("sec-measure")
    },
    /* --- input pad --- */
    pad: {
      del: g("pad-del"), prev: g("pad-prev"), next: g("pad-next"),
      strUp: g("pad-str-up"), strDn: g("pad-str-dn"),
      mainGrid: g("pad-main-grid"), extGrid: g("pad-ext-grid")
    },
    /* --- fretboard --- */
    fretboard: {
      area: g("fb-area"), grid: g("fb-g")
    },
    /* --- viewer --- */
    viewer: {
      area: g("viewer-area"), inner: g("viewer-inner"),
      title: g("vw-title"), meta: g("vw-meta"), summary: g("vw-summary"),
      systems: g("vw-systems"),
      backBtn: g("btn-back-editor"), loadBtn: g("btn-vw-load"),
      fileInput: g("vwJsonFileIn")
    },
    /* --- debug --- */
    debug: {
      panel: g("debug-panel"), toggle: g("debug-toggle")
    },
    /* --- context menu --- */
    contextMenu: g("ctx-menu"),
    /* --- status bar --- */
    status: {
      left: g("st-left"), right: g("st-right")
    },
    /* --- toast --- */
    toast: g("toast"),
    /* --- dialogs --- */
    dialogs: {
      restore: g("rDlg"), restoreMsg: g("rDlg-msg"),
      restoreYes: g("rY"), restoreNo: g("rN"), restoreAb: g("rDlg-ab")
    },
    /* --- file inputs --- */
    inputs: {
      jsonFile: g("jsonFileIn")
    },
    /* --- tools/slots --- */
    tools: {
      toggle: g("ep-tools-toggle"), body: g("ep-tools-body"),
      exportJson: g("ep-tool-export-json"), importJson: g("ep-tool-import-json"),
      png: g("ep-tool-png"), exchange: g("ep-tool-exchange"),
      shared: g("ep-tool-shared"), debug: g("ep-tool-debug"),
      slotsToggle: g("ep-slots-toggle"), slotsBody: g("slot-panel-body")
    },
    /* --- help --- */
    help: g("shortcut-help")
  };
}

/* グローバル els インスタンス — init() で作成 */
var els = null;
