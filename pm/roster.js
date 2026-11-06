const sampleProjects = projects.map(p => ({...p}));
const rosterKey = 'scg-pm-utilization-roster-v1';
let roster = {states:{}, imported:{}};
try {
  const saved = JSON.parse(memberStorage.getItem(rosterKey));
  if (saved?.states && saved?.imported) roster = saved;
} catch {}
function applyRoster() {
  projects.splice(0, projects.length, ...sampleProjects.map(p => ({...p})));
  for (const update of Object.values(roster.imported)) {
    const existing = projects.find(p => p.id === update.id);
    if (existing) Object.assign(existing, update);
    else projects.push({...update});
  }
}
function activeProjects() { return projects.filter(p => !roster.states[p.id]); }
function saveRoster() {
  memberStorage.setItem(rosterKey, JSON.stringify(roster));
  applyRoster();
}
function resetRoster() {
  roster = {states:{}, imported:{}};
  saveRoster();
  projectNotes = {};
  memberStorage.removeItem('scg-project-notes-v1');
}
applyRoster();
const normalDetail = detail;
detail = function() {
  const html = normalDetail();
  if (tab !== 'overview') return html;
  const archived = roster.states[selected] === 'archived';
  return html + '<div class="toolbar" style="margin-top:18px"><button data-roster="'+(archived?'restore':'archive')+'">'+(archived?'Restore project':'Archive project')+'</button><button data-roster="delete">Delete project…</button></div>';
};
function showPanel(title, body) {
  document.getElementById('app').innerHTML = '<button class="back" data-roster="back">← Active projects</button><h1>'+title+'</h1>'+body;
}
function showArchive() {
  const archived = projects.filter(p => roster.states[p.id] === 'archived');
  showPanel('Archived projects', '<div class="card">'+(archived.map(p => '<div class="item"><button class="projectlink" data-project="'+p.id+'">'+esc(p.name)+'</button><div class="small sub">'+esc(p.id)+'</div></div>').join('') || '<div class="empty">No archived projects.</div>')+'</div>');
}
let pending = [];
let reading = false;
async function showRefresh() {
  if (reading) return;
  reading=true;
  pending=[];
  try {
    const panel = () => document.querySelector('#app h1')?.textContent === 'Manual refresh';
    showPanel('Manual refresh','<p>Waiting for Google sign-in. Choose your Stafford Google account in the popup.</p>');
    const token = await requestAccess();
    if (!panel()) return;
    showPanel('Manual refresh','<p>Signed in to Google. Reading the Utilization Master List…</p>');
    const result = await readUtilization(token);
    if (!panel()) return;
    const incoming=new Set(result.projects.map(p=>p.id));
    const lines=[];
    for(const source of result.projects){
      if(roster.states[source.id]) continue;
      const existing=roster.imported[source.id];
      if(existing && Object.keys(source).every(k=>JSON.stringify(existing[k])===JSON.stringify(source[k]))) continue;
      pending.push({...{pm:'',pc:'',ad:'',contacts:'',event:'',date:'',type:'Tower crane'},...existing,...source});
      lines.push('<div class="item"><b>'+esc(source.id+' · '+source.name)+'</b>'+ (existing?'Update':'Add')+' · '+esc(source.equipment)+'</div>');
    }
    for(const p of activeProjects().filter(p=>!incoming.has(p.id))) lines.push('<div class="item">Review missing project: '+esc(p.id+' · '+p.name)+'</div>');
    for(const issue of result.issues) lines.push('<div class="item">Review unmatched assignment: '+esc(issue)+'</div>');
    showPanel('Manual refresh preview','<p>'+result.projects.length+' qualifying projects · '+pending.length+' proposed changes</p><div class="card">'+lines.join('')+'</div>'+(pending.length?'<button data-roster="apply">Apply changes</button>':''));
  } catch (error) {
    if (document.querySelector('#app h1')?.textContent === 'Manual refresh') {
      const message = error.name === 'TimeoutError' ? 'Google Sheets did not respond within 30 seconds.' : error.message;
      showPanel('Manual refresh', '<p>' + esc(message) + '</p><button data-roster="preview">Try again</button>');
    }
  }
  finally{reading=false;}
}
document.addEventListener('click', event => {
  const action = event.target.closest('[data-roster]')?.dataset.roster;
  if (!action) return;
  if (action==='archive-list') return showArchive();
  if (action==='preview') return showRefresh();
  if (action==='apply') {
    for (const p of pending) if (!roster.states[p.id]) roster.imported[p.id]=p;
    pending=[];
  }
  const project = projects.find(p => p.id===selected);
  if (action==='archive') roster.states[selected]='archived';
  if (action==='restore') delete roster.states[selected];
  if (action==='delete') {
    if (!confirm('Delete '+project.name+' and its checklist, assignments and notes? This project will be skipped on future refreshes.')) return;
    roster.states[selected]='deleted';
    delete roster.imported[selected];
    delete copies[selected];
    delete projectNotes[selected];
    for (const key of Object.keys(changes)) if(key.startsWith(selected+'-')) delete changes[key];
    saveCopies(); persist();
    memberStorage.setItem('scg-project-notes-v1',JSON.stringify(projectNotes));
  }
  saveRoster();
  selected=null; view='projects'; render();
  if(action==='archive') notify('Project archived. Open Archived projects to restore it.');
});
render();
