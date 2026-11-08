const GAME_ID = 'block-puzzle';
const SIZE = 10;
const SHAPES = [
  [[0,0]], [[0,0],[1,0]], [[0,0],[0,1]], [[0,0],[1,0],[2,0]],
  [[0,0],[0,1],[0,2]], [[0,0],[1,0],[0,1],[1,1]],
  [[0,0],[1,0],[2,0],[0,1]], [[0,0],[0,1],[1,1]],
  [[0,0],[1,0],[1,1]], [[0,0],[1,0],[2,0],[3,0]],
  [[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[1,1],[1,2]]
];

export function mountGame(root, { onStart = () => null, onCancel = () => {}, onFinish = () => {}, onStatus = () => {}, onProgress = () => {} } = {}) {
  if (!root) throw new TypeError('root is required');
  let board, pieces, score, turns, cleared, level, session, startedAt, paused, ended, destroyed, finishSent, selected, raf, lastFocus;
  let starting = false, startToken = 0;
  const listeners = [];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const listen = (target, event, fn, opts) => { target.addEventListener(event, fn, opts); listeners.push(() => target.removeEventListener(event, fn, opts)); };
  root.replaceChildren();
  const app = el('section','mg-block-puzzle'); app.dir='rtl'; app.setAttribute('aria-label','لعبة تركيب القطع');
  const head=el('header','mg-block-puzzle-head');
  const title=el('h1','mg-block-puzzle-title','تركيب القطع');
  const instructions=el('p','mg-block-puzzle-instructions','اختر قطعة ثم اختر خلية البداية على اللوحة. أكمل صفًا أو عمودًا لمسحه.');
  head.append(title,instructions);
  const stats=el('div','mg-block-puzzle-stats');
  const scoreBox=el('div','mg-block-puzzle-stat'); const scoreLabel=el('span','mg-block-puzzle-label','النقاط'); const scoreValue=el('strong','mg-block-puzzle-score','0'); scoreBox.append(scoreLabel,scoreValue);
  const levelBox=el('div','mg-block-puzzle-stat'); const levelLabel=el('span','mg-block-puzzle-label','المستوى'); const levelValue=el('strong','mg-block-puzzle-level','1'); levelBox.append(levelLabel,levelValue);
  const bestBox=el('div','mg-block-puzzle-stat'); const bestLabel=el('span','mg-block-puzzle-label','أفضل نتيجة'); const bestValue=el('strong','mg-block-puzzle-best','0'); bestBox.append(bestLabel,bestValue); stats.append(scoreBox,levelBox,bestBox);
  const status=el('p','mg-block-puzzle-status','اضغط ابدأ لبدء جولة جديدة.'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const controls=el('div','mg-block-puzzle-controls');
  const startButton=el('button','mg-block-puzzle-button mg-block-puzzle-primary','ابدأ'); startButton.type='button';
  const pauseButton=el('button','mg-block-puzzle-button','إيقاف مؤقت'); pauseButton.type='button'; pauseButton.disabled=true;
  const restartButton=el('button','mg-block-puzzle-button','إعادة اللعب'); restartButton.type='button';
  controls.append(startButton,pauseButton,restartButton);
  const boardWrap=el('div','mg-block-puzzle-board-wrap'); const boardNode=el('div','mg-block-puzzle-board'); boardNode.setAttribute('role','grid'); boardNode.setAttribute('aria-label','لوحة لعب 10 في 10');
  const cellNodes=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) { const cell=el('button','mg-block-puzzle-cell'); cell.type='button'; cell.setAttribute('role','gridcell'); cell.setAttribute('aria-label',`صف ${r+1}، عمود ${c+1}`); cell.dataset.row=String(r); cell.dataset.col=String(c); boardNode.append(cell); cellNodes.push(cell); }
  boardWrap.append(boardNode);
  const trayLabel=el('h2','mg-block-puzzle-tray-title','القطع المتاحة'); const tray=el('div','mg-block-puzzle-tray'); tray.setAttribute('aria-label','اختر قطعة');
  app.append(head,stats,status,controls,boardWrap,trayLabel,tray); root.append(app);
  const say=(text,kind='info')=>{status.textContent=text; if(typeof onStatus==='function') onStatus(text,kind);};
  const progress=()=>{try{onProgress({score:Math.max(0,Math.floor(score||0)),turns:turns||0,linesCleared:cleared||0,level:level||1});}catch{}};
  function bestRead(){ try{return Math.max(0,Number(localStorage.getItem('mg-block-puzzle-best'))||0);}catch{return 0;} }
  function bestWrite(v){try{localStorage.setItem('mg-block-puzzle-best',String(v));}catch{}}
  function paint(){
    scoreValue.textContent=String(score||0); levelValue.textContent=String(level||1); bestValue.textContent=String(bestRead());
    cellNodes.forEach((n,i)=>{const r=Math.floor(i/SIZE),c=i%SIZE; n.classList.toggle('mg-block-puzzle-filled',!!board?.[r]?.[c]); n.disabled=!startedAt||paused||ended;});
    [...tray.children].forEach((n,i)=>{n.disabled=!startedAt||paused||ended||!pieces?.[i]; n.classList.toggle('mg-block-puzzle-selected',i===selected);});
    pauseButton.disabled=!startedAt||ended; pauseButton.textContent=paused?'استئناف':'إيقاف مؤقت';
    startButton.textContent=starting?'جارٍ بدء الجولة…':(ended?'ابدأ من جديد':(startedAt?'اللعب جارٍ':'ابدأ')); startButton.disabled=starting||!!startedAt&&!ended;
    if(!destroyed&&startedAt&&!paused&&!ended){cancelAnimationFrame(raf);raf=requestAnimationFrame(paint);}
  }
  const randShape=()=>SHAPES[Math.floor(Math.random()*SHAPES.length)];
  function drawTray(){ tray.replaceChildren(); for(let i=0;i<3;i++){const shape=pieces[i]; const b=el('button','mg-block-puzzle-piece'); b.type='button'; b.setAttribute('aria-label',shape?`القطعة ${i+1}، ${shape.length} مربعات`:`القطعة ${i+1} مستخدمة`); const mini=el('span','mg-block-puzzle-mini'); if(shape){const maxX=Math.max(...shape.map(p=>p[0])), maxY=Math.max(...shape.map(p=>p[1])); mini.style.setProperty('--cols',String(maxX+1)); mini.style.setProperty('--rows',String(maxY+1)); for(let y=0;y<=maxY;y++)for(let x=0;x<=maxX;x++){const d=el('i','mg-block-puzzle-mini-cell');if(shape.some(([sx,sy])=>sx===x&&sy===y))d.classList.add('mg-block-puzzle-mini-on');mini.append(d);}} b.append(mini); listen(b,'click',()=>{if(!shape||paused||ended)return;selected=i;say(`تم اختيار القطعة ${i+1}. اختر موضعها على اللوحة.`);}); tray.append(b);}}
  function canPlace(shape,r,c){return shape.every(([x,y])=>r+y<SIZE&&c+x<SIZE&&!board[r+y][c+x]);}
  function canAny(){return pieces.some(s=>s&&board.some((row,r)=>row.some((_,c)=>canPlace(s,r,c))));}
  function finish(){if(finishSent)return;finishSent=true;ended=true;paused=false;const durationMs=Math.max(0,Date.now()-startedAt);const best=Math.max(bestRead(),score);bestWrite(best);bestValue.textContent=String(best);say(`انتهت الجولة. نتيجتك ${score} نقطة.`, 'finish');paint();progress();try{if(typeof onFinish==='function')onFinish(session,{score:Math.max(0,Math.floor(score)),durationMs,metrics:{turns,linesCleared:cleared,level}});}catch{}}
  function place(r,c){if(!startedAt||paused||ended||selected<0||!pieces[selected])return;const shape=pieces[selected];if(!canPlace(shape,r,c)){say('لا يمكن وضع القطعة هنا. اختر موضعًا خاليًا مناسبًا.','warning');return;}for(const [x,y]of shape)board[r+y][c+x]=1;score+=shape.length;turns++;pieces[selected]=null;let rows=[];for(let y=0;y<SIZE;y++)if(board[y].every(Boolean))rows.push(y);let cols=[];for(let x=0;x<SIZE;x++)if(board.every(row=>row[x]))cols.push(x);for(const y of rows)board[y].fill(0);for(const x of cols)for(let y=0;y<SIZE;y++)board[y][x]=0;const lines=rows.length+cols.length;if(lines){cleared+=lines;score+=lines*10+Math.max(0,lines-1)*5;level=1+Math.floor(cleared/4);say(`ممتاز! مُسح ${lines} خط${lines===1?'':'وط'}. المستوى ${level}.`);}else say('وُضعت القطعة. أكمل صفًا أو عمودًا.');selected=-1;if(pieces.every(p=>!p))pieces=[randShape(),randShape(),randShape()];drawTray();paint();progress();if(!canAny())finish();}
  async function newGame(){if(destroyed||starting)return;if(session&&!finishSent){try{onCancel(session);}catch{}}session=null;starting=true;const token=++startToken;startButton.disabled=true;startButton.textContent='جارٍ بدء الجولة…';let nextSession=null;try{nextSession=await onStart(GAME_ID);}catch{say('تعذر الاتصال؛ ستبدأ جولة محلية غير موثقة.','warning');}if(destroyed||token!==startToken)return;session=nextSession||null;starting=false;board=Array.from({length:SIZE},()=>Array(SIZE).fill(0));pieces=[randShape(),randShape(),randShape()];score=0;turns=0;cleared=0;level=1;startedAt=Date.now();paused=false;ended=false;finishSent=false;selected=-1;drawTray();say(session?'بدأت الجولة. نتيجتك مرتبطة بجلسة اللعبة.':'بدأت جولة محلية. اختر قطعة لوضعها.');paint();progress();}
  cellNodes.forEach(n=>listen(n,'click',()=>place(Number(n.dataset.row),Number(n.dataset.col))));
  listen(startButton,'click',newGame);listen(restartButton,'click',newGame);
  listen(pauseButton,'click',()=>{if(ended||!startedAt)return;paused=!paused;if(paused){cancelAnimationFrame(raf);say('اللعبة متوقفة مؤقتًا. اضغط استئناف للمتابعة.');}else say('استؤنفت اللعبة.');paint();});
  listen(root,'keydown',e=>{if(e.key==='Escape'&&startedAt&&!ended){paused=!paused;say(paused?'اللعبة متوقفة مؤقتًا.':'استؤنفت اللعبة.');paint();}else if(e.key==='Enter'&&document.activeElement?.classList.contains('mg-block-puzzle-piece'))document.activeElement.click();});
  const visibility=()=>{if(document.hidden){if(startedAt&&!ended&&!paused){paused=true;say('أوقفت اللعبة مؤقتًا لإخفاء الصفحة.');}cancelAnimationFrame(raf);}else if(!destroyed&&!ended){paint();}};listen(document,'visibilitychange',visibility);
  board=Array.from({length:SIZE},()=>Array(SIZE).fill(0));pieces=[null,null,null];score=0;turns=0;cleared=0;level=1;startedAt=0;paused=false;ended=false;destroyed=false;finishSent=false;selected=-1;bestValue.textContent=String(bestRead());drawTray();paint();
  return {pause(){if(destroyed||ended||!startedAt)return;paused=true;cancelAnimationFrame(raf);say('اللعبة متوقفة مؤقتًا.');paint();},resume(){if(destroyed||ended||!startedAt)return;paused=false;say('استؤنفت اللعبة.');paint();},restart(){if(destroyed)return;startedAt=0;ended=false;paused=false;finishSent=false;score=0;turns=0;cleared=0;level=1;session=null;board=Array.from({length:SIZE},()=>Array(SIZE).fill(0));pieces=[null,null,null];selected=-1;drawTray();say('اضغط ابدأ لبدء جولة جديدة.');paint();},destroy(){if(destroyed)return;if(session&&!finishSent){try{onCancel(session);}catch{}}startToken++;destroyed=true;cancelAnimationFrame(raf);listeners.splice(0).forEach(fn=>fn());root.replaceChildren();}};
}
