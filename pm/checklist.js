const templateRows=[["Contract and Insurance", "Contract review and execution"], ["Contract and Insurance", "Complete insurance requirements"], ["Contract and Insurance", "Obtain COI from customer (bare rentals)"], ["PM Kickoff and Admin", "ID PM for the project"], ["PM Kickoff and Admin", "ID AD for the project"], ["PM Kickoff and Admin", "Set up project folders"], ["PM Kickoff and Admin", "Create and route PIM"], ["PM Kickoff and Admin", "Introduce PM (and AD?) to customer"], ["PM Kickoff and Admin", "Create the project in NS/Shepherd"], ["PM Kickoff and Admin", "Replicate the quote in Shepherd"], ["PM Kickoff and Admin", "Establish the project schedule"], ["PM Kickoff and Admin", "Establish the project budget (by event)?"], ["PM Kickoff and Admin", "Keep records and calendar up to date"], ["PM Kickoff and Admin", "Schedule inspections monthly and annual (as needed) inspections"], ["Engineering", "Develop project engineering and drawings"], ["Engineering", "Develop climb / jump plan"], ["General Planning and Permits", "Obtain and maintain FAA clearance"], ["General Planning and Permits", "Conduct the initial site walk"], ["General Planning and Permits", "Complete the safety package"], ["General Planning and Permits", "Prepare the site logistics plan"], ["Equipment planning", "Confirm equipment availablity"], ["Equipment planning", "Confirm/plan anchor availability"], ["Erection Planning", "Prepare the method statement "], ["Erection Planning", "Prepare the lift plan"], ["Erection Planning", "Prepare basic loadout list"], ["Erection Planning", "Prepare enhanced loadout list (out of town work?)"], ["Erection Planning", "Assign and dispatch the crew"], ["Erection Planning", "Arrange crew travel and lodging"], ["Erection Planning", "Coordinate any training / onboarding needed for crew"], ["Erection Planning", "Select and book the assist crane"], ["Erection Planning", "Schedule third-party inspection "], ["Erection Planning", "Prepare and submit OSHA package"], ["Erection Planning", "Verify foundation, anchor and tie readiness"], ["Erection Planning", "Final site walk"], ["Erection Planning", "Create the event service order and calendar entry"], ["Erection Planning", "Tools and Rigging Planning (out of state work)"], ["Operators", "Assign operator"], ["Operators", "Obtain qualifications"], ["Erection review", "Review and reconcile crew time"], ["Erection review", "Complete the field service-order record"], ["Erection review", "AD-led event review"], ["Erection review", "Reveiw financial performance"], ["Erection review", "Update installed / removed equipment quantities"], ["Closeout", "Obtain customer feedback / client swag"], ["Closeout", "Coordinate project media "], ["Closeout", "Review project financial performance"], ["Dismantle Planning", "Prepare the method statement "], ["Dismantle Planning", "Prepare the lift plan"], ["Dismantle Planning", "Prepare basic loadin list"], ["Dismantle Planning", "Prepare enhanced loadin list (out of town work?)"], ["Dismantle Planning", "Assign and dispatch the crew"], ["Dismantle Planning", "Arrange crew travel and lodging"], ["Dismantle Planning", "Coordinate any training / onboarding needed for crew"], ["Dismantle Planning", "Select and book the assist crane"], ["Dismantle Planning", "Final site walk"], ["Dismantle Planning", "Create the event service order and calendar entry"], ["Dismantle Planning", "Tools and Rigging Planning (out of state work)"], ["Climb Planning", "Prepare the method statement "], ["Climb Planning", "Prepare the lift plan"], ["Climb Planning", "Prepare loadout list"], ["Climb Planning", "Prepare enhanced loadout list (out of town work?)"], ["Climb Planning", "Assign and dispatch the crew"], ["Climb Planning", "Arrange crew travel and lodging"], ["Climb Planning", "Coordinate any training / onboarding needed for crew"], ["Climb Planning", "Select and book the assist crane"], ["Climb Planning", "Final site walk"], ["Climb Planning", "Create the event service order and calendar entry"], ["Climb Planning", "Tools and Rigging Planning (out of state work)"]];
let copies={};try{copies=JSON.parse(memberStorage.getItem('scg-tc-checklists-v1')||'{}')}catch{}
// Normalize headings on saved pilot copies before rendering them.
for (const project of Object.values(copies)) {
  for (const row of project.items || []) {
    if (row.group === 'PM Kickofff and Admin') row.group = 'PM Kickoff and Admin';
    if (row.group === 'Engineeing') row.group = 'Engineering';
  }
}
function saveCopies(){try{memberStorage.setItem('scg-tc-checklists-v1',JSON.stringify(copies))}catch{notify('Storage unavailable; changes last this session.')}}
const legacyTasks=tasks,legacyDetail=detail;
function createRows(rows,eventId=''){return rows.map((r,i)=>({id:'tc-'+(eventId||'project')+'-'+i,name:r[1],group:r[0],owner:'',due:'',note:'',status:'Not started',scope:eventId?'event':'project',eventId}))}
const equipmentViews = new Map();
function equipmentKinds(p) {
  if (p.type === 'Tower crane and hoist') return ['Tower crane','Hoist'];
  return [p.type];
}
function currentKind(p) {
  const kinds = equipmentKinds(p);
  const choice = equipmentViews.get(p.id);
  return kinds.includes(choice) ? choice : kinds[0];
}
function belongsTo(row,kind) {
  return (row.kind || 'Tower crane') === kind;
}
tasks = function(p) {
  return (copies[p.id]?.items || []).map(item => ({...item,...changes[p.id+'-'+item.id]}));
};
function startChecklist(p,kind) {
  const state = copies[p.id] ||= {items:[],events:[],started:{}};
  // Existing project copies contain a tower checklist.
  state.started ||= {'Tower crane':true};
  if (state.started[kind]) return;
  state.started[kind]=true;
  if (kind==='Tower crane') {
    const rows=templateRows.filter(r=>!['Erection Planning','Erection review','Climb Planning','Dismantle Planning'].includes(r[0]));
    state.items.push(...createRows(rows));
  }
  saveCopies();
}
function addChecklistEvent(p,kind,type,date) {
  const state=copies[p.id], id='event-'+crypto.randomUUID();
  state.events.push({id,kind,type,date});
  if (kind==='Tower crane') {
    const rows=templateRows.filter(r=>r[0]===type+' Planning'||(type==='Erection'&&r[0]==='Erection review'));
    state.items.push(...createRows(rows,id));
  }
  saveCopies();
}
function checklistScreen(p,kind) {
  const state=copies[p.id];
  const started=state && (state.started ? state.started[kind] : kind==='Tower crane');
  const title=esc(kind)+' checklist';
  if (!started) return '<div class="card empty"><h2>'+title+'</h2><p>'+
    (kind==='Hoist'?'Start with a blank checklist and add hoist items.':'Create a project copy of the standard tower-crane checklist.')+
    '</p><button id="adoptchecklist">Create '+title+'</button></div>';
  const items=tasks(p).filter(t=>belongsTo(t,kind));
  function section(label,eventId='') {
    const rows=items.filter(t=>(t.eventId||'')===eventId);
    const groups=[...new Set(rows.map(t=>t.group))];
    return '<section class="card" style="margin-bottom:16px"><div class="cardhead"><h2>'+esc(label)+'</h2><button data-newitem="'+esc(eventId)+'">Add item</button></div>'+
      groups.map(g=>'<h3 class="checklist-group">'+esc(g)+'</h3>'+taskTable(p,rows.filter(t=>t.group===g))).join('')+
      (rows.length?'':'<div class="empty">No items yet.</div>')+'</section>';
  }
  const source=kind==='Tower crane'?'<a href="https://docs.google.com/spreadsheets/d/14mK1ttOG3UVNgnnINnLrDeOk7ihgGXnJw8Bz43HdzcA/edit#gid=1175358047" target="_blank" rel="noopener">Standard checklist source ↗</a>':'';
  return '<div class="toolbar"><button id="newchecklistevent">Add event checklist</button>'+source+'</div>'+section(kind+' checklist')+
    state.events.filter(ev=>belongsTo(ev,kind)).map(ev=>section(ev.type+' · '+(ev.date?date(ev.date):'Date TBD'),ev.id)).join('');
}
detail=function(){
  const p=projects.find(p=>p.id===selected);
  if(tab!=='tasks') return legacyDetail();
  const kind=currentKind(p), kinds=equipmentKinds(p);
  const tabs=['overview','tasks','notes'].map(t=>'<button data-tab="'+t+'" class="'+(tab===t?'active':'')+'">'+({overview:'Overview',tasks:'Checklist',notes:'Notes'}[t])+'</button>').join('');
  const selector=kinds.length===2?'<div class="toolbar">'+kinds.map(k=>'<button data-kind="'+k+'" aria-pressed="'+(k===kind)+'" class="'+(k===kind?'primary':'')+'">'+k+'</button>').join('')+'</div>':'';
  return '<button class="back" id="back">← All projects</button><div class="eyebrow">'+esc(p.id)+' / '+esc(p.type)+'</div><h1>'+esc(p.name)+'</h1><div class="tabs">'+tabs+'</div>'+selector+checklistScreen(p,kind);
};
function simpleDialog(title,body,mode){
  window.checklistMode=mode;
  document.getElementById('dialogtitle').textContent=title;
  document.getElementById('dialogbody').innerHTML=body;
  document.getElementById('dialog').showModal();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b) return;
  if(b.dataset.edit) window.checklistMode=null;
  const p=projects.find(p=>p.id===selected);
  if(!p) return;
  if(b.dataset.kind){equipmentViews.set(p.id,b.dataset.kind);render();return;}
  const kind=currentKind(p);
  if(b.id==='adoptchecklist'){startChecklist(p,kind);render();}
  if(b.id==='newchecklistevent'){
    const types=kind==='Hoist'?['Installation','Jump','Dismantle']:['Erection','Climb','Dismantle'];
    simpleDialog('Add '+kind.toLowerCase()+' event','<label for="evtype">Event</label><select id="evtype">'+types.map(t=>'<option>'+t+'</option>').join('')+'</select><label for="evdate">Date (optional)</label><input type="date" id="evdate">',{type:'event',pid:p.id,kind});
  }
  if(b.hasAttribute('data-newitem')) simpleDialog('Add checklist item','<label for="newname">Checklist item</label><input id="newname" required>',{type:'item',pid:p.id,kind,eventId:b.dataset.newitem});
},true);
document.getElementById('editform').addEventListener('submit',e=>{
  const mode=window.checklistMode;
  if(!mode) return;
  e.stopImmediatePropagation();window.checklistMode=null;
  if(e.submitter.value!=='save') return;
  const p=projects.find(p=>p.id===mode.pid);
  if(mode.type==='event') addChecklistEvent(p,mode.kind,document.getElementById('evtype').value,document.getElementById('evdate').value);
  else {
    copies[p.id].items.push({id:'custom-'+crypto.randomUUID(),kind:mode.kind,name:document.getElementById('newname').value.trim(),group:'Project additions',owner:'',due:'',note:'',status:'Not started',scope:mode.eventId?'event':'project',eventId:mode.eventId});
    saveCopies();
  }
  render();
},true);
let projectNotes={};try{const saved=JSON.parse(memberStorage.getItem('scg-project-notes-v1')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))projectNotes=saved}catch{}
function notesScreen(p){const notes=Array.isArray(projectNotes[p.id])?projectNotes[p.id]:[];return '<div class="card" style="margin-bottom:20px"><div class="cardhead"><h2>Project notes</h2><span class="small sub">'+notes.length+(notes.length===1?' note':' notes')+'</span></div><form id="project-note-form" class="note-compose"><label for="project-note">Add a note</label><textarea id="project-note" required maxlength="10000" placeholder="Project update, decision, or follow-up…"></textarea><footer><span class="small sub">Date and time are added automatically · Arizona time</span><button class="primary" type="submit">Add note</button></footer></form></div><div class="card">'+(notes.length?notes.map(n=>'<article class="note-entry"><time datetime="'+esc(n.createdAt)+'">'+esc(new Date(n.createdAt).toLocaleString('en-US',{timeZone:'America/Phoenix',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}))+' MST</time><p>'+esc(n.text)+'</p></article>').join(''):'<div class="empty">No project notes yet.</div>')+'</div>'}
document.addEventListener('submit',e=>{if(e.target.id!=='project-note-form')return;e.preventDefault();const input=document.getElementById('project-note'),text=input.value.trim();if(!text){input.setCustomValidity('Enter a note before saving.');input.reportValidity();return}if(!Array.isArray(projectNotes[selected]))projectNotes[selected]=[];projectNotes[selected].unshift({text,createdAt:new Date().toISOString()});try{memberStorage.setItem('scg-project-notes-v1',JSON.stringify(projectNotes));notify('Project note saved.')}catch{notify('Note added for this session; browser storage is unavailable.')}render()});
document.addEventListener('input',e=>{if(e.target.id==='project-note')e.target.setCustomValidity('')});
