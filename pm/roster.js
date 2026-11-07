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
const eventLogId = '10JC-bLNOb3u2vh1hRu4oWTow50eVFN_fRnG9pH2Ukjk';

function suggestNumberedUnit(title, kind, units) {
  // A single explicit site number in the event and a unique roster suffix.
  const pattern = kind === 'Hoist' ? /\bHoist\s*#\s*(\d+)\b/i : /\b(?:TC|Tower Crane)\s*#\s*(\d+)\b/i;
  const match = pattern.exec(String(title || ''));
  if (!match || (title.match(/#/g) || []).length !== 1 || /^\s*(?:[\/-]|&|and|,|to)\s*\d/i.test(title.slice(match.index + match[0].length))) return null;
  const numbered = units.map(unit => ({unit, numbers:(unit.rowNames || []).map(name => name.match(/#\s*(\d+)\s*$/)?.[1])}));
  if (numbered.some(entry => !entry.numbers.length || entry.numbers.some(n => !n))) return null;
  const matches = numbered.filter(entry => entry.numbers.includes(match[1]));
  if (matches.length !== 1 || new Set(matches[0].numbers).size !== 1) return null;
  return matches[0].unit.asset || matches[0].unit.serial || null;
}

function eventPreviewRows(values, rosterProjects, today) {
  const expected = ['Event ID','Date','Month','Year','Market','Equipment Type','Event Type','Project #','Project Name'];
  if (!expected.every((label, i) => values[0]?.[i] === label)) throw Error('The Event Log headers have changed. Check columns A–I.');
  const projectsById = new Map(rosterProjects.map(p => [p.id, p]));
  const seen = new Set(), duplicates = new Set();
  const records = values.slice(1).flatMap((row, i) => {
    if (!row.some(value => value !== '' && value != null)) return [];
    const [id, day, , , , equipment, type, rawProject, title] = row;
    const projectId = String(rawProject ?? '').trim();
    const project = projectsById.get(projectId);
    const validDay = Number.isFinite(day) && day > 0 && day < 2958466;
    const issues = [];
    if (!projectId) issues.push('Missing project number');
    else if (!project) issues.push('Project outside current roster');
    if (!validDay) issues.push('Check date');
    if (!type || type === '?') issues.push('Check event type');
    if (!id) issues.push('Missing event ID');
    else if (seen.has(String(id))) duplicates.add(String(id));
    seen.add(String(id));
    const kind = {'Tower Crane':'TC',Hoist:'Hoist'}[equipment];
    const units = project?.units?.filter(unit => unit.kind === kind) || [];
    const suggestion = kind && suggestNumberedUnit(title, kind, units);
    if (!kind) issues.push('Check equipment type');
    else if (project && !units.length) issues.push('No matching equipment type on roster');
    else if (suggestion) issues.push('Confirm suggested unit');
    else if (units.length > 1) issues.push('Multiple units of this type');
    return [{row:i+2, id, day:validDay ? Math.floor(day) : null, upcoming:!validDay || Math.floor(day)>=today,
      projectId, projectName:project?.name, suggestion, title, equipment, type, issues}];
  });
  for (const record of records) if (duplicates.has(String(record.id))) record.issues.push('Duplicate event ID');
  return records.sort((a,b) => (a.day ?? Infinity)-(b.day ?? Infinity) || a.row-b.row);
}

async function showEventPreview() {
  showPanel('Event Log preview','<p>Waiting for Google sign-in…</p>');
  const heading = document.querySelector('#app h1');
  try {
    const token = await requestAccess();
    if (!heading.isConnected) return;
    heading.nextElementSibling.textContent = 'Reading the Event Log…';
    const range = encodeURIComponent("'Event Log'!A:I");
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/'+eventLogId+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
    const response = await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error('Google Sheets returned '+response.status+'. Check Event Log access.');
    const data = await response.json();
    if (!heading.isConnected) return;
    const rows = eventPreviewRows(data.values || [], activeProjects(), phoenixSheetDay());
    showPanel('Event Log preview','<p>Read-only · Project numbers match against the current roster. Equipment types come from the Event Log.</p>'+
      '<div class="toolbar"><label for="event-period">Dates</label><select id="event-period"><option value="upcoming">Today forward and undated</option><option value="all">All dates</option></select>'+
      '<label for="event-project">Project number</label><input id="event-project" placeholder="All projects"></div><div id="event-results"></div>');
    function filterResults() {
      const query = document.getElementById('event-project').value.trim();
      const upcoming = document.getElementById('event-period').value === 'upcoming';
      const visible = rows.filter(r => (!upcoming || r.upcoming) && r.projectId.includes(query));
      const body = visible.map(r => {
        const dateLabel = r.day === null ? 'Undated' : new Date((r.day-25569)*86400000).toLocaleDateString('en-US',{timeZone:'UTC'});
        const link = 'https://docs.google.com/spreadsheets/d/'+eventLogId+'/edit#gid=1780491368&range=A'+r.row+':I'+r.row;
        return '<tr><td>'+esc(dateLabel)+'</td><td>'+esc([r.projectId,r.projectName].filter(Boolean).join(' · ') || 'Unmatched')+'</td><td>'+esc(r.type || '—')+
          '<div class="small sub">'+esc(r.title || '')+'</div></td><td>'+esc(r.equipment || '—')+(r.suggestion?'<div class="small sub">Suggested: '+esc(r.suggestion)+'</div>':'')+'</td><td>'+esc(r.issues.join(' · ') || 'Project matched')+
          '</td><td><a target="_blank" rel="noopener" href="'+link+'">Row '+r.row+'</a></td></tr>';
      }).join('');
      document.getElementById('event-results').innerHTML = '<p>'+visible.length+' events · '+visible.filter(r=>r.issues.length).length+' need review</p>'+
        (visible.length ? '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Project</th><th>Event</th><th>Equipment</th><th>Match review</th><th>Source</th></tr></thead><tbody>'+body+'</tbody></table></div>' : '<p>No events match these filters.</p>');
    }
    document.getElementById('event-period').onchange = filterResults;
    document.getElementById('event-project').oninput = filterResults;
    filterResults();
  } catch (error) {
    if (heading.isConnected) showPanel('Event Log preview','<p>'+esc(error.message)+'</p><button data-roster="event-preview">Try again</button>');
  }
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
  if (action==='event-preview') return showEventPreview();
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
