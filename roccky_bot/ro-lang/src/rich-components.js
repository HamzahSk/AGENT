const SUPPORTED_COMPONENTS = new Set([
  "flashcards",
  "quiz",
  "fill_blank",
  "matching",
  "table",
  "progress",
  "pronunciation",
]);

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function normalizeItems(activity) {
  return Array.isArray(activity?.items)
    ? activity.items.slice(0, 16).map((item) => ({ ...item }))
    : [];
}

export function learningComponentTable(activity) {
  const items = normalizeItems(activity);
  switch (activity?.type) {
    case "flashcards":
      return [
        ["Word", "Meaning", "Pronunciation"],
        ...items.map((item) => [
          text(item.word ?? item.prompt, "-"),
          text(item.translation ?? item.answer, "-"),
          text(item.pronunciation, "-"),
        ]),
      ];
    case "quiz":
      return [
        ["Question", "Choices"],
        ...items.map((item) => [
          text(item.question ?? item.prompt, "-"),
          (Array.isArray(item.options) ? item.options : []).join(" · ") || "Reply in chat",
        ]),
      ];
    case "fill_blank":
      return [
        ["Complete", "Hint"],
        ...items.map((item) => [
          text(item.prompt, "-"),
          text(item.hint, "Reply in chat"),
        ]),
      ];
    case "matching":
      return [
        ["Match A", "Match B"],
        ...items.map((item) => [text(item.left, "-"), text(item.right, "-")]),
      ];
    case "progress":
      return [
        ["Skill", "Progress"],
        ...items.map((item) => [
          text(item.label ?? item.skill, "-"),
          item.percent === undefined
            ? text(item.value, "-")
            : `${Math.max(0, Math.min(100, Number(item.percent) || 0))}%`,
        ]),
      ];
    case "pronunciation":
      return [
        ["Text", "Pronunciation", "Tip"],
        ...items.map((item) => [
          text(item.text ?? item.word, "-"),
          text(item.phonetic ?? item.pronunciation, "-"),
          text(item.tip, "-"),
        ]),
      ];
    case "table":
      if (items.some((item) => Array.isArray(item.cells))) {
        return items.map((item) => item.cells.map((cell) => text(cell, "-")));
      }
      return [
        ["Item", "Value"],
        ...items.map((item) => [
          text(item.term ?? item.label ?? item.key, "-"),
          text(item.value ?? item.explanation ?? item.translation, "-"),
        ]),
      ];
    default:
      return [];
  }
}

export function renderLearningComponent(activity) {
  if (!SUPPORTED_COMPONENTS.has(activity?.type)) return null;
  const data = {
    type: activity.type,
    title: text(activity.title, "Interactive practice").slice(0, 160),
    instructions: text(activity.instructions).slice(0, 800),
    replyPrompt: text(activity.replyPrompt).slice(0, 400),
    expectsReply: Boolean(activity.expectsReply),
    items: normalizeItems(activity),
  };
  if (!data.items.length) return null;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
:root{color-scheme:light dark;--bg:#f4f7fb;--card:#fff;--ink:#172033;--muted:#667085;--accent:#6c4cff;--good:#12805c;--bad:#c53d52;--line:#dbe2ee}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,sans-serif}
h1{font-size:20px;margin:0 0 6px}.sub{color:var(--muted);margin:0 0 14px}.stack{display:grid;gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:0 5px 18px #17203312}
button{font:inherit;width:100%;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:12px;padding:11px;text-align:left;margin-top:7px}button:active{transform:scale(.99)}
.primary{background:var(--accent);border-color:var(--accent);color:#fff;text-align:center}.answer{display:none;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)}.answer.show{display:block}
.word{font-size:23px;font-weight:750}.phonetic{color:var(--accent);font-weight:650}.muted{color:var(--muted)}.good{color:var(--good);font-weight:700}.bad{color:var(--bad);font-weight:700}
.choice.selected{border-color:var(--accent)}.choice.correct{border-color:var(--good);background:#15a87918}.choice.wrong,.pair.wrong{border-color:var(--bad);background:#e3485f18}
.result{min-height:22px;margin-top:8px}
.pair-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pair.active{border-color:var(--accent);box-shadow:0 0 0 2px #6c4cff25}.pair.done{opacity:.45;border-color:var(--good)}
.row{display:grid;grid-template-columns:minmax(100px,1fr) 2fr;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}.row:last-child{border-bottom:0}.bar{height:10px;background:var(--line);border-radius:99px;overflow:hidden;margin-top:7px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),#22b8cf)}
@media(prefers-color-scheme:dark){:root{--bg:#11151e;--card:#1c2230;--ink:#f5f7fb;--muted:#aab4c5;--line:#343e50}}
</style>
</head>
<body>
<h1 id="title"></h1><p class="sub" id="instructions"></p><main class="stack" id="app"></main>
<script>
const DATA=${scriptJson(data)};
const app=document.getElementById('app');
const el=(tag,cls,content)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(content!==undefined)node.textContent=String(content);return node};
const value=(item,...keys)=>{for(const key of keys)if(item[key]!==undefined&&item[key]!==null&&String(item[key]).trim())return String(item[key]);return ''};
const normalize=s=>String(s||'').trim().toLocaleLowerCase().replace(/[.!?。、，]/g,'');
document.getElementById('title').textContent=DATA.title;
document.getElementById('instructions').textContent=DATA.instructions||DATA.replyPrompt||'Tap a card to practise.';
function flashcards(){DATA.items.forEach(item=>{const card=el('section','card');card.append(el('div','word',value(item,'word','prompt')),el('div','phonetic',value(item,'pronunciation','phonetic')));const answer=el('div','answer');answer.append(el('strong','',value(item,'translation','answer')),el('p','muted',value(item,'example','explanation')));const button=el('button','primary','Reveal answer');button.onclick=()=>{answer.classList.toggle('show');button.textContent=answer.classList.contains('show')?'Hide answer':'Reveal answer'};card.append(button,answer);app.append(card)})}
function quiz(){DATA.items.forEach((item,index)=>{const card=el('section','card');card.append(el('strong','',String(index+1)+'. '+value(item,'question','prompt')));const result=el('div','result');const options=Array.isArray(item.options)?item.options:[];options.forEach(option=>{const button=el('button','choice',option);button.onclick=()=>{card.querySelectorAll('.choice').forEach(node=>node.classList.remove('selected','correct','wrong'));button.classList.add('selected');if(DATA.expectsReply){result.className='result muted';result.textContent=DATA.replyPrompt||'Send your choice in WhatsApp so your tutor can assess it.';return}const correct=normalize(option)===normalize(item.answer);button.classList.add(correct?'correct':'wrong');result.className='result '+(correct?'good':'bad');result.textContent=(correct?'Correct! ':'Try again. ')+value(item,'explanation')};card.append(button)});card.append(result);app.append(card)})}
function fillBlank(){DATA.items.forEach((item,index)=>{const card=el('section','card');card.append(el('strong','',String(index+1)+'. '+value(item,'prompt')),el('div','muted',value(item,'hint')));const result=el('div','result');const button=el('button','primary',DATA.expectsReply?'Cara menjawab':'Lihat jawaban');button.onclick=()=>{if(DATA.expectsReply){result.className='result muted';result.textContent=DATA.replyPrompt||'Kirim jawabanmu melalui chat WhatsApp agar tutor dapat menilainya.';return}result.className='result good';result.textContent='Jawaban: '+value(item,'answer');if(item.explanation)result.textContent+=' — '+item.explanation};card.append(button,result);app.append(card)})}
function matching(){const card=el('section','card');const grid=el('div','pair-grid');let selected=null,done=0;const pairs=DATA.items.map((item,index)=>({index,left:value(item,'left'),right:value(item,'right')}));const right=[...pairs].sort(()=>Math.random()-.5);const choose=node=>{if(node.classList.contains('done'))return;if(!selected){selected=node;node.classList.add('active');return}if(selected.dataset.side===node.dataset.side){selected.classList.remove('active');selected=node;node.classList.add('active');return}const first=selected;const ok=first.dataset.pair===node.dataset.pair;if(ok){first.classList.add('done');node.classList.add('done');done++;if(done===pairs.length)status.textContent='Great work — all pairs matched!'}else{first.classList.add('wrong');node.classList.add('wrong');setTimeout(()=>{first.classList.remove('wrong');node.classList.remove('wrong')},450)}first.classList.remove('active');selected=null};pairs.forEach((pair,row)=>{const button=el('button','pair',pair.left);button.dataset.pair=pair.index;button.dataset.side='left';button.onclick=()=>choose(button);grid.append(button);const mate=right[row];const rightButton=el('button','pair',mate.right);rightButton.dataset.pair=mate.index;rightButton.dataset.side='right';rightButton.onclick=()=>choose(rightButton);grid.append(rightButton)});const status=el('div','result muted','Match each item with its partner.');card.append(grid,status);app.append(card)}
function table(){const card=el('section','card');DATA.items.forEach(item=>{const row=el('div','row');const cells=Array.isArray(item.cells)?item.cells:[value(item,'term','label','key'),value(item,'value','translation','explanation')];cells.forEach((cell,index)=>row.append(el(index?'span':'strong','',cell)));card.append(row)});app.append(card)}
function progress(){DATA.items.forEach(item=>{const card=el('section','card');const percent=Math.max(0,Math.min(100,Number(item.percent)||0));card.append(el('strong','',value(item,'label','skill')),el('div','muted',item.value!==undefined?item.value:(percent+'%')));const bar=el('div','bar');const fill=el('i');fill.style.width=percent+'%';bar.append(fill);card.append(bar);app.append(card)})}
function pronunciation(){DATA.items.forEach(item=>{const card=el('section','card');card.append(el('div','word',value(item,'text','word')),el('div','phonetic',value(item,'phonetic','pronunciation')),el('p','',value(item,'tip')),el('p','muted',value(item,'example')));app.append(card)})}
({flashcards,quiz,fill_blank:fillBlank,matching,table,progress,pronunciation}[DATA.type]||table)();
</script>
</body></html>`;

  return {
    html,
    height: Math.min(720, Math.max(360, 250 + data.items.length * 82)),
    label: data.title,
    table: learningComponentTable(data),
  };
}
