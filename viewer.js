/* ================================================================
   viewer.js — 読み取り専用ビュー（Viewer Mode）
   ================================================================
   責務: sharedModelだけで描画する閲覧専用ビュー。
         Editor内部状態（song/sel/cur）に依存しない。
         将来の別HTML化に対応可能な設計。
   依存: グローバル変数 appMode, sharedViewModel, state,
         TPB, GS, NSTR, SH, SP, LANE, TUN, TLB,
         mTk, dc, FF, drawStaff, toSharedModel, validateSharedModel,
         toast, render
   
   このファイルは model.js, render.js の後に読み込む。
*/

function enterViewer(sharedModel){
  const issues=validateSharedModel(sharedModel);
  if(issues.length>3){toast("共有データに問題あり ("+issues.length+"件)");console.warn("Shared model issues:",issues);return}
  if(issues.length)console.warn("Shared model warnings:",issues);
  sharedViewModel=sharedModel;state.sharedViewModel=sharedModel;
  appMode="viewer";state.appMode="viewer";
  switchToViewerUI();
  renderSharedView(sharedViewModel);
}

function enterViewerFromCurrentSong(){
  const model=toSharedModel(song);
  enterViewer(model);
}

function exitViewer(){
  appMode="editor";state.appMode="editor";
  sharedViewModel=null;state.sharedViewModel=null;
  switchToEditorUI();
  render();
}

function switchToViewerUI(){
  document.getElementById("edit-panel").style.display="none";
  document.getElementById("score-area").style.display="none";
  document.getElementById("input-pad").style.display="none";
  document.getElementById("fb-area").style.display="none";
  document.getElementById("viewer-area").style.display="flex";
  document.getElementById("btn-viewer").textContent="✏️ Editor";
  document.getElementById("btn-viewer").title="編集モードへ戻る";
  /* Editor専用ボタン非活性化 */
  ["btn-undo","btn-redo","btn-save","btn-exchange","btn-shared","btn-png","btn-fb-toggle"].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display="none";
  });
}

function switchToEditorUI(){
  document.getElementById("edit-panel").style.display="";
  document.getElementById("score-area").style.display="";
  document.getElementById("input-pad").style.display="";
  document.getElementById("viewer-area").style.display="none";
  document.getElementById("btn-viewer").textContent="👁 Viewer";
  document.getElementById("btn-viewer").title="閲覧モードへ切替";
  ["btn-undo","btn-redo","btn-save","btn-exchange","btn-shared","btn-png","btn-fb-toggle"].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display="";
  });
}

/* --- Viewer描画: sharedModelだけで描画。Editor内部状態に依存しない。 --- */
function renderSharedView(model){
  if(!model)return;
  const root=document.getElementById("vw-systems");root.innerHTML="";

  /* Header */
  document.getElementById("vw-title").textContent=model.meta.title||"Untitled";
  const ts=model.meta.timeSignature||{beats:4,beatUnit:4};
  document.getElementById("vw-meta").textContent="♩= "+(model.meta.tempo||120)+"   "+ts.beats+"/"+ts.beatUnit;
  const sm=model.summary||{};
  document.getElementById("vw-summary").textContent=
    (sm.measureCount||0)+"小節 / "+(sm.eventCount||0)+"音"+
    (sm.hasLinks?" / リンクあり":"")+
    (sm.hasSpans?" / スパンあり":"")+
    (sm.hasRepeat?" / リピートあり":"");

  /* Build measure-indexed event/link/span lookups from shared model */
  const measCount=(model.measures||[]).length;
  const evByM={};(model.events||[]).forEach(e=>{if(!evByM[e.measureIdx])evByM[e.measureIdx]=[];evByM[e.measureIdx].push(e)});
  const linksByFrom={};(model.links||[]).forEach(l=>{if(!linksByFrom[l.fromEventId])linksByFrom[l.fromEventId]=[];linksByFrom[l.fromEventId].push(l)});
  const eventMap={};(model.events||[]).forEach(e=>{eventMap[e.id]=e});
  const spansByM={};(model.spans||[]).forEach(sp=>{
    for(let mi=sp.start.measureIdx;mi<=sp.end.measureIdx&&mi<measCount;mi++){if(!spansByM[mi])spansByM[mi]=[];spansByM[mi].push(sp)}
  });

  /* Layout */
  const total=ts.beatUnit===4?ts.beats*TPB:ts.beatUnit===8?ts.beats*(TPB/2):ts.beats*TPB;
  const bt=ts.beatUnit===8?TPB/2:TPB;
  const MPR=2;
  const shW=document.getElementById("viewer-inner").clientWidth;
  const clefW=18;const measW=Math.floor((shW-20-clefW)/MPR);
  const staffH=NSTR*SH;const canvasH=SP+staffH+16;
  const rows=Math.ceil(measCount/MPR);

  for(let r=0;r<rows;r++){
    const sDiv=document.createElement("div");sDiv.style.cssText="margin-bottom:14px";
    const sRow=document.createElement("div");sRow.style.cssText="display:flex";
    const clef=document.createElement("div");clef.style.cssText="width:18px;display:flex;flex-direction:column;justify-content:center;align-items:center;flex-shrink:0;user-select:none";
    clef.innerHTML='<span style="font:800 10px Consolas,monospace;color:#888;line-height:1.3">T<br>A<br>B</span>';
    sRow.appendChild(clef);
    for(let c=0;c<MPR;c++){
      const mi=r*MPR+c;if(mi>=measCount)break;
      const mData=(model.measures||[])[mi]||{};
      const events=evByM[mi]||[];
      const spans=spansByM[mi]||[];
      const mb=document.createElement("div");
      mb.style.cssText="border-right:1px solid #ddd;position:relative;width:"+measW+"px";
      /* Measure number */
      const num=document.createElement("div");num.style.cssText="position:absolute;top:"+SP+"px;left:2px;font:600 9px var(--fu);color:#c04030;transform:translateY(-100%)";
      num.textContent=mi+1;mb.appendChild(num);
      /* Canvas */
      const cvs=renderViewerMeasure(events,spans,linksByFrom,eventMap,mData,mi,measW,canvasH,total,bt,staffH,model);
      mb.appendChild(cvs);
      sRow.appendChild(mb);
    }
    sDiv.appendChild(sRow);root.appendChild(sDiv);
  }
}

function renderViewerMeasure(events,spans,linksByFrom,eventMap,mData,mi,measW,canvasH,total,bt,staffH,model){
  const cvs=document.createElement("canvas");const dpr=window.devicePixelRatio||1;
  cvs.width=measW*dpr;cvs.height=canvasH*dpr;cvs.style.width=measW+"px";cvs.style.height=canvasH+"px";
  const ctx=cvs.getContext("2d");ctx.scale(dpr,dpr);
  const o={ox:0,oy:0,measW,total,bt,staffH,mi,noteFont:"800 15px Consolas, Courier New, monospace"};
  const ff=FF();

  /* Staff lines */
  drawStaff(ctx,o);

  /* Measure attrs (repeat/ending) */
  const ma=mData.attrs||{};
  if(ma.repeatStart){ctx.fillStyle="#333";ctx.strokeStyle="#333";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(2,SP);ctx.lineTo(2,SP+staffH);ctx.stroke();ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(7,SP);ctx.lineTo(7,SP+staffH);ctx.stroke();const d1=SP+staffH*.35,d2=SP+staffH*.65;ctx.beginPath();ctx.arc(13,d1,2.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(13,d2,2.5,0,Math.PI*2);ctx.fill()}
  if(ma.repeatEnd){ctx.fillStyle="#333";ctx.strokeStyle="#333";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(measW-2,SP);ctx.lineTo(measW-2,SP+staffH);ctx.stroke();ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(measW-7,SP);ctx.lineTo(measW-7,SP+staffH);ctx.stroke();const d1=SP+staffH*.35,d2=SP+staffH*.65;ctx.beginPath();ctx.arc(measW-13,d1,2.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(measW-13,d2,2.5,0,Math.PI*2);ctx.fill()}
  if(ma.ending){ctx.fillStyle="#555";ctx.font="600 9px "+ff;ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText(ma.ending+".",6,LANE.mAttr);ctx.strokeStyle="#777";ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(1,LANE.mAttr);ctx.lineTo(measW*.5,LANE.mAttr);ctx.stroke();ctx.beginPath();ctx.moveTo(1,LANE.mAttr);ctx.lineTo(1,LANE.mAttr+10);ctx.stroke()}

  /* Notes */
  ctx.font=o.noteFont;
  events.forEach(e=>{
    const xC=o.ox+(e.tick/total)*measW+(GS/total)*measW/2;
    const ny=SP+e.stringIndex*SH+SH/2;
    const a=e.attrs||{};
    let txt=a.dead?"x":""+e.fret;
    if(a.ghost)txt="("+e.fret+")";
    if(a.harmonic)txt="<"+e.fret+">";
    if(a.ghost)ctx.font="600 13px Consolas,monospace";
    const tw=ctx.measureText(txt).width;
    ctx.fillStyle="#fff";ctx.fillRect(xC-tw/2-3,ny-8,tw+6,16);
    ctx.fillStyle=a.ghost?"#999":a.harmonic?"#1a7a6a":a.dead?"#a04040":"#111";
    ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(txt,xC,ny);
    ctx.font=o.noteFont;
    if(a.accent){ctx.fillStyle="#c04030";ctx.font="700 10px "+ff;ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillText(">",xC,ny-9);ctx.font=o.noteFont}
  });

  /* Links */
  events.forEach(e=>{
    const fromLinks=linksByFrom[e.id]||[];if(!fromLinks.length)return;
    const x1=o.ox+(e.tick/total)*measW+(GS/total)*measW/2;
    const ny=SP+e.stringIndex*SH+SH/2;
    fromLinks.forEach(lk=>{
      const toEv=lk.toEventId?eventMap[lk.toEventId]:null;
      let x2=toEv?(o.ox+(toEv.tick/total)*measW+(GS/total)*measW/2):x1+30;
      if(toEv&&toEv.measureIdx!==mi)x2=measW-4;/* 別小節への仮線 */
      if(x2>measW-4)x2=measW-4;
      if(lk.type==="slide"){
        ctx.strokeStyle="#444";ctx.lineWidth=1.2;
        if(toEv&&toEv.fret>e.fret){ctx.beginPath();ctx.moveTo(x1+5,ny+5);ctx.lineTo(x2-5,ny-5);ctx.stroke()}
        else{ctx.beginPath();ctx.moveTo(x1+5,ny-5);ctx.lineTo(x2-5,ny+5);ctx.stroke()}
        ctx.fillStyle="#555";ctx.font="600 8px "+ff;ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillText("S",(x1+x2)/2,ny-6);
      }else{
        const ay=ny+10;const mx=(x1+x2)/2;const bu=7;
        ctx.strokeStyle="#444";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x1+3,ay);ctx.quadraticCurveTo(mx,ay+bu,x2-3,ay);ctx.stroke();
        if(lk.type==="hammer"){ctx.fillStyle="#555";ctx.font="600 8px "+ff;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("H",mx,ay+bu)}
        if(lk.type==="pull"){ctx.fillStyle="#555";ctx.font="600 8px "+ff;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("P",mx,ay+bu)}
      }
    });
  });

  /* Spans */
  spans.forEach(sp=>{
    const label=sp.type==="palmMute"?"P.M.":"let ring";
    const color=sp.type==="palmMute"?"#b05818":"#1878a0";
    let x1=(sp.start.measureIdx===mi)?(sp.start.tick/total)*measW:0;
    let x2=(sp.end.measureIdx===mi)?(sp.end.tick/total)*measW+(GS/total)*measW:measW;
    x1=Math.max(x1,2);x2=Math.min(x2,measW-2);
    const yBase=sp.type==="palmMute"?LANE.span:LANE.span+9;
    ctx.fillStyle=color;ctx.font="600 8px "+ff;ctx.textAlign="left";ctx.textBaseline="top";
    ctx.fillText(label,x1,yBase);const tw=ctx.measureText(label).width;
    ctx.strokeStyle=color;ctx.lineWidth=.8;ctx.setLineDash([3,2]);
    ctx.beginPath();ctx.moveTo(x1+tw+2,yBase+4);ctx.lineTo(x2,yBase+4);ctx.stroke();ctx.setLineDash([]);
  });

  /* TickAttrs */
  (mData.tickAttrs||[]).forEach(ta=>{
    const xC=o.ox+(ta.tick/total)*measW+(GS/total)*measW/2;
    if(ta.strum){ctx.fillStyle="#555";ctx.font="600 11px "+ff;ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillText(ta.strum==="down"?"↓":"↑",xC,LANE.rhythm)}
    if(ta.rest){ctx.fillStyle="#888";ctx.font="700 11px "+ff;ctx.textAlign="center";ctx.textBaseline="top";ctx.fillText("𝄾",xC,LANE.rhythm+2)}
  });

  return cvs;
}

function renderViewerIfActive(){if(appMode==="viewer"&&sharedViewModel)renderSharedView(sharedViewModel)}
