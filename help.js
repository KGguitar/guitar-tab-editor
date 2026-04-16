/* ================================================================
   help.js — ショートカットヘルプ表示（モーダル）
   ================================================================
   責務: ショートカット一覧モーダルの lazy 生成、表示/非表示/トグル、
         閉じるボタンの bind。
   依存: グローバル変数 helpVisible（state.uiState に連動）。
         キー判定・ルーティングは keyboard.js 側。

   呼び出し側（keyboard.js 等）は toggleHelp() を従来通り呼べばよい。
   モーダル DOM は最初の表示時に生成し、以降は再利用する。
*/

function ensureHelpModal(){
  let el=document.getElementById("shortcut-help");
  if(el)return el;
  el=document.createElement("div");el.id="shortcut-help";
  el.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:1px solid #ccc;border-radius:10px;padding:20px 28px;box-shadow:0 8px 32px rgba(0,0,0,.15);z-index:500;max-height:80vh;overflow-y:auto;font:13px var(--fu);color:#333;min-width:400px";
  el.innerHTML=`<h3 style="margin:0 0 12px;font-size:16px;color:#2a7af5">ショートカット一覧</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><td colspan="2" style="font-weight:700;padding:6px 0 2px;color:#888;border-bottom:1px solid #eee">移動</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">←→</td><td>tick移動</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">↑↓</td><td>弦移動</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Ctrl+←→</td><td>小節移動</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Home / End</td><td>小節先頭 / 末尾</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Enter / Shift+Enter</td><td>次tick / 前tick</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Shift+←→</td><td>範囲拡張</td></tr>
<tr><td colspan="2" style="font-weight:700;padding:6px 0 2px;color:#888;border-bottom:1px solid #eee">入力</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">0-9</td><td>フレット入力 (2桁自動)</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Q / W / E</td><td>4分 / 8分 / 16分</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">. (ドット)</td><td>付点トグル</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Space</td><td>単音/和音 切替</td></tr>
<tr><td colspan="2" style="font-weight:700;padding:6px 0 2px;color:#888;border-bottom:1px solid #eee">編集</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Delete / Backspace</td><td>削除 (選択単位)</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Ctrl+C / V / D</td><td>コピー / 貼付 / 複製</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Ctrl+Z / Y</td><td>Undo / Redo</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">+ / -</td><td>半音上げ / 下げ</td></tr>
<tr><td colspan="2" style="font-weight:700;padding:6px 0 2px;color:#888;border-bottom:1px solid #eee">奏法</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">T / H / P / S</td><td>Tie / Hammer / Pull / Slide</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">V / M</td><td>Vibrato / Mute</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">R</td><td>Rest (tick休符)</td></tr>
<tr><td colspan="2" style="font-weight:700;padding:6px 0 2px;color:#888;border-bottom:1px solid #eee">選択</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">Escape</td><td>Tick選択に戻る / 範囲解除</td></tr>
<tr><td style="padding:2px 8px 2px 0;color:#555">?</td><td>このヘルプ表示</td></tr>
</table>
<div style="margin-top:12px;text-align:center"><button data-help-action="close" style="font:13px var(--fu);padding:6px 20px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer">閉じる</button></div>`;
  document.body.appendChild(el);
  return el;
}

function showHelp(){
  helpVisible=true;
  ensureHelpModal().style.display="block";
}
function hideHelp(){
  helpVisible=false;
  const el=document.getElementById("shortcut-help");
  if(el)el.style.display="none";
}
function toggleHelp(){
  helpVisible=!helpVisible;
  const el=ensureHelpModal();
  el.style.display=helpVisible?"block":"none";
}
