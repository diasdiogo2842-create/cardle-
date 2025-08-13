// Clashle dynamic Cardle - Flip & Pop animations, dynamic columns based on target card name
const MAX_ROWS = 6;
let CARDS = [];
let TARGET_CARD = null;
let TARGET_WORD = ""; // uppercase letters no spaces/punct
let cols = 5;
let row = 0, col = 0;
let boardState = []; // rows x cols chars or empty
let evaluations = []; // rows x cols classes

const boardEl = document.getElementById('board');
const keyboardEl = document.getElementById('keyboard');
const hiddenInput = document.getElementById('hiddenInput');
const infoBtn = document.getElementById('infoBtn');
const infoDialog = document.getElementById('infoDialog');
const closeInfo = document.getElementById('closeInfo');

function normalizeName(n){ return n.replace(/[^A-Za-z0-9]/g,'').toUpperCase(); }

function lcg(seed){ let s = seed>>>0; return ()=> (s = Math.imul(1664525, s) + 1013904223 >>> 0) / 2**32; }
function dailyIndex(len){
  const now = new Date();
  const dayNum = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())/86400000);
  const seed = 0xC0FFEE ^ dayNum;
  const rnd = lcg(seed);
  return Math.floor(rnd()*len);
}

async function init(){
  const res = await fetch('data/cards.json');
  CARDS = await res.json();
  CARDS.forEach(c=>c.name_norm = normalizeName(c.name));
  TARGET_CARD = CARDS[dailyIndex(CARDS.length)];
  TARGET_WORD = TARGET_CARD.name_norm;
  cols = Math.max(3, TARGET_WORD.length); // min width 3
  // build board state
  boardState = Array.from({length:MAX_ROWS}, ()=>Array.from({length:cols}, ()=>''));
  evaluations = Array.from({length:MAX_ROWS}, ()=>Array.from({length:cols}, ()=>''));
  buildBoard();
  buildKeyboard();
  hiddenInput.focus();
  updateUrlLabel();
  attachEvents();
}

function buildBoard(){
  boardEl.style.gridTemplateColumns = `repeat(${cols}, auto)`;
  boardEl.innerHTML = '';
  for(let r=0;r<MAX_ROWS;r++){
    const rowDiv = document.createElement('div');
    rowDiv.className = 'row';
    for(let c=0;c<cols;c++){
      const t = document.createElement('div');
      t.className = 'tile empty';
      t.dataset.r = r; t.dataset.c = c;
      rowDiv.appendChild(t);
    }
    boardEl.appendChild(rowDiv);
  }
}

const QWERTY = ["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"];
function buildKeyboard(){
  keyboardEl.innerHTML = '';
  QWERTY.forEach((row,i)=>{
    const rdiv = document.createElement('div'); rdiv.className='krow';
    if(i===2){ // add enter/backspace on sides
      const enter = document.createElement('button'); enter.className='key wide'; enter.textContent='ENTER'; enter.dataset.key='ENTER';
      rdiv.appendChild(enter);
    }
    for(const ch of row){
      const k = document.createElement('button'); k.className='key'; k.textContent=ch; k.dataset.key=ch;
      rdiv.appendChild(k);
    }
    if(i===2){
      const back = document.createElement('button'); back.className='key wide'; back.textContent='⌫'; back.dataset.key='BACK';
      rdiv.appendChild(back);
    }
    keyboardEl.appendChild(rdiv);
  });
}

function attachEvents(){
  document.addEventListener('keydown', onPhysicalKey);
  keyboardEl.addEventListener('click', onVirtualKey);
  hiddenInput.addEventListener('input', onHiddenInput);
  infoBtn.addEventListener('click', ()=> infoDialog.showModal());
  closeInfo.addEventListener('click', ()=> infoDialog.close());
  // focus trap
  document.addEventListener('click', ()=> hiddenInput.focus());
}

function onPhysicalKey(e){
  const k = e.key.toUpperCase();
  if(k === 'ENTER') return submitGuess();
  if(k === 'BACKSPACE') return deleteChar();
  if(k.length===1 && k.match(/[A-Z0-9]/)) typeChar(k);
}

function onVirtualKey(e){
  const btn = e.target.closest('button');
  if(!btn) return;
  const k = btn.dataset.key;
  if(!k) return;
  if(k==='ENTER') return submitGuess();
  if(k==='BACK') return deleteChar();
  typeChar(k);
}

function onHiddenInput(e){
  const v = e.target.value.toUpperCase();
  // accept only letters/numbers, take last char
  if(!v) return;
  const ch = v.slice(-1).replace(/[^A-Z0-9]/g,'');
  if(ch) typeChar(ch);
  hiddenInput.value = '';
}

function typeChar(ch){
  if(row>=MAX_ROWS) return;
  if(col>=cols) return;
  boardState[row][col] = ch;
  renderTile(row,col);
  // pop animation
  const tile = tileEl(row,col);
  tile.classList.add('pop');
  setTimeout(()=> tile.classList.remove('pop'),120);
  col++;
}

function deleteChar(){
  if(col===0){
    if(row===0) return;
    // allow moving back a row if last row empty? keep simple: only delete in current row
    return;
  }
  col--;
  boardState[row][col] = '';
  renderTile(row,col);
}

function renderTile(r,c){
  const tile = tileEl(r,c);
  const ch = boardState[r][c];
  if(!ch){ tile.textContent=''; tile.classList.add('empty'); tile.classList.remove('correct','present','absent'); return; }
  tile.textContent = ch;
  tile.classList.remove('empty');
}

function tileEl(r,c){
  return boardEl.children[r].children[c];
}

function submitGuess(){
  // only allow when row has all letters filled
  const word = boardState[row].join('');
  if(word.length !== cols || boardState[row].some(x=>x==='')) return shakeRow(row);
  // evaluate
  const evals = evaluateGuess(word, TARGET_WORD);
  // animate flips sequentially
  flipRow(row, evals).then(()=>{
    // mark keyboard
    markKeyboard(row, evals);
    if(evals.every(x=>x==='correct')){
      // solved
      // TODO: show win notification
    } else {
      row++;
      col=0;
      if(row>=MAX_ROWS){
        // reveal target maybe
      }
    }
  });
}

function shakeRow(r){
  const rowEl = boardEl.children[r];
  rowEl.animate([{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}], {duration:240});
}

function evaluateGuess(guess, target){
  // classic Wordle evaluation with repeated letters handling
  const res = Array.from({length:cols}, ()=>'absent');
  const g = guess.split('');
  const t = target.split('');
  const taken = Array(cols).fill(false);
  // first pass: correct
  for(let i=0;i<cols;i++){
    if(g[i] === t[i]){ res[i]='correct'; taken[i]=true; }
  }
  // second pass: present
  for(let i=0;i<cols;i++){
    if(res[i]==='correct') continue;
    const idx = t.findIndex((ch,idx)=> ch===g[i] && !taken[idx]);
    if(idx !== -1){ res[i]='present'; taken[idx]=true; }
  }
  return res;
}

function flipRow(r, evals){
  return new Promise((resolve)=>{
    const tiles = Array.from(boardEl.children[r].children);
    tiles.forEach((tile, i)=>{
      setTimeout(()=>{
        tile.classList.add('flip');
        // after halfway (approx 300ms), set class based on evals
        setTimeout(()=>{
          tile.classList.remove('empty');
          tile.classList.remove('flip');
          tile.classList.add(evals[i]); // correct/present/absent
          tile.textContent = boardState[r][i];
        }, 300);
        if(i===tiles.length-1){
          setTimeout(()=> resolve(), 360 + 80*tiles.length);
        }
      }, i*120);
    });
  });
}

function markKeyboard(r, evals){
  const rowChars = boardState[r];
  rowChars.forEach((ch, i)=>{
    const keyBtn = keyboardEl.querySelector(`button[data-key="${ch}"]`);
    if(!keyBtn) return;
    // prioritize correct > present > absent, never downgrade
    if(evals[i]==='correct'){
      keyBtn.classList.remove('present','absent'); keyBtn.classList.add('correct');
    } else if(evals[i]==='present'){
      if(!keyBtn.classList.contains('correct')){ keyBtn.classList.remove('absent'); keyBtn.classList.add('present'); }
    } else {
      if(!keyBtn.classList.contains('correct') && !keyBtn.classList.contains('present')) keyBtn.classList.add('absent');
    }
  });
}

function updateUrlLabel(){
  // show center url like screenshot
  // no-op for now
}

init();
