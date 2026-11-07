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
  if (kind === 'TC') {
    const labels = [...String(title || '').matchAll(/\b(?:TC|Tower Crane)\s*#?\s*(\d+)\b/gi)];
    if (!labels.length && units.length === 1 && !/[#&]|\b(?:cranes|TCs)\b/i.test(title || '')) return units[0].asset || units[0].serial;
    if (labels.length !== 1 || /^\s*(?:[\/-]|&|and|,|to)\s*#?\d/i.test(title.slice(labels[0].index + labels[0][0].length))) return null;
    const numbers = units.map(u => new Set((u.rowNames || []).map(n => n.match(/#\s*(\d+)\s*$/)?.[1])));
    if (numbers.some(set => set.size !== 1 || set.has(undefined))) return null;
    const matches = units.filter((u,i) => numbers[i].has(labels[0][1]));
    return matches.length === 1 ? matches[0].asset || matches[0].serial : null;
  }
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
    if (kind === 'TC') {
      const actions = [['Erection', /\berect(?:ion)?\b/i], ['Climb', /\bclimb\b/i], ['Dismantle', /\bdismantl(?:e|ing)\b/i]];
      if (actions.some(([action,pattern]) => action !== type && pattern.test(title || ''))) issues.push('Event type conflicts with source title');
    }
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

function eventImportCandidate(row, project) {
  const manual = row.issues[0] === 'Multiple units of this type';
  if (!project || row.issues.length !== 1 || (!manual && row.issues[0] !== 'Confirm suggested unit')) return null;
  const crane = row.equipment === 'Tower Crane';
  const type = crane ? (['Erection','Climb','Dismantle'].includes(row.type) && row.type) : new Map([['Install','Installation'],['Installation','Installation'],['Jump','Jump'],['Dismantle','Dismantle']]).get(row.type);
  if (!type) return null;
  const options = (project.units || [])
    .filter(u => u.kind === (crane ? 'TC' : 'Hoist') && (u.asset || u.serial) && (manual || (u.asset || u.serial) === row.suggestion))
    .map(u => ({key:encodeURIComponent(JSON.stringify([u.asset || '',u.serial || ''])), label:[u.asset,u.serial].filter(Boolean).join(' / ')}));
  if (!options.length || (!manual && options.length !== 1)) return null;
  return {type, options, manual, kind:crane ? 'Tower crane' : 'Hoist', date:new Date((row.day-25569)*86400000).toISOString().slice(0,10)};
}

function importedEvent(sourceId) {
  for (const [projectId,state] of Object.entries(copies)) {
    const event = state.events?.find(e => e.eventLogId === String(sourceId));
    if (event) return {projectId,event};
  }
  return null;
}

function matchesImportedUnit(saved, row, candidate) {
  const units = saved.event.units || saved.event.hoists;
  return candidate && saved.projectId === row.projectId && saved.event.kind === candidate.kind &&
    saved.event.type === candidate.type && units?.length > 0 &&
    (candidate.manual ? saved.event.manualSourceTitle === row.title : units.length === 1) &&
    units.every(u => candidate.options.some(option => option.key === u.key));
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
    showPanel('Event Log preview','<p>Review a suggested equipment match to add its dated checklist to this pilot. The Event Log is read-only.</p>'+
      '<div class="toolbar"><label for="event-period">Dates</label><select id="event-period"><option value="upcoming">Today forward and undated</option><option value="all">All dates</option></select>'+
      '<label for="event-project">Project number</label><input id="event-project" placeholder="All projects"></div><div id="event-results"></div>');
    let selection = null;
    function filterResults() {
      selection = null;
      const query = document.getElementById('event-project').value.trim();
      const upcoming = document.getElementById('event-period').value === 'upcoming';
      const visible = rows.filter(r => (!upcoming || r.upcoming) && r.projectId.includes(query));
      let needsReview = 0;
      const body = visible.map(r => {
        const dateLabel = r.day === null ? 'Undated' : new Date((r.day-25569)*86400000).toLocaleDateString('en-US',{timeZone:'UTC'});
        const saved = importedEvent(r.id);
        const candidate = eventImportCandidate(r, projects.find(p => p.id === r.projectId));
        const compatible = saved && matchesImportedUnit(saved, r, candidate);
        const moved = compatible && saved.event.date !== candidate.date;
        let review = esc(r.issues.join(' · ') || 'Project matched');
        if (saved) review = compatible ? (moved ? 'Date changed from '+esc(saved.event.date) : 'Already imported') : 'Imported event · check source match';
        if (saved ? (!compatible || moved) : r.issues.length) needsReview++;
        const button = candidate && (!saved || moved) ? '<br><button data-review-event="'+r.row+'">'+(moved?'Review date change':candidate.manual?'Select equipment':'Review event')+'</button>' : '';
        const link = 'https://docs.google.com/spreadsheets/d/'+eventLogId+'/edit#gid=1780491368&range=A'+r.row+':I'+r.row;
        return '<tr><td>'+esc(dateLabel)+'</td><td>'+esc([r.projectId,r.projectName].filter(Boolean).join(' · ') || 'Unmatched')+'</td><td>'+esc(r.type || '—')+
          '<div class="small sub">'+esc(r.title || '')+'</div></td><td>'+esc(r.equipment || '—')+(r.suggestion?'<div class="small sub">Suggested: '+esc(r.suggestion)+'</div>':'')+'</td><td>'+review+button+
          '</td><td><a target="_blank" rel="noopener" href="'+link+'">Row '+r.row+'</a></td></tr>';
      }).join('');
      document.getElementById('event-results').innerHTML = '<p>'+visible.length+' events · '+needsReview+' need review</p>'+
        (visible.length ? '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Project</th><th>Event</th><th>Equipment</th><th>Match review</th><th>Source</th></tr></thead><tbody>'+body+'</tbody></table></div>' : '<p>No events match these filters.</p>');
    }
    document.getElementById('event-period').onchange = filterResults;
    document.getElementById('event-project').oninput = filterResults;
    document.getElementById('event-results').onclick = async event => {
      if (event.target.closest('[data-cancel-review]')) { filterResults(); return; }
      const button = event.target.closest('[data-review-event], [data-create-event]');
      if (!button) return;
      const row = rows.find(r => r.row === Number(button.dataset.reviewEvent || button.dataset.createEvent));
      const project = activeProjects().find(p => p.id === row?.projectId);
      const candidate = row && eventImportCandidate(row, project);
      const saved = row && importedEvent(row.id);
      if (!candidate || (saved && (!matchesImportedUnit(saved,row,candidate) || saved.event.date === candidate.date))) return;
      const {type, options, manual, kind, date} = candidate;
      const results = document.getElementById('event-results');
      if (button.dataset.reviewEvent && manual && !saved && !button.hasAttribute('data-accept-selection')) {
        selection = null;
        results.innerHTML = '<section class="card item"><h2>Select equipment</h2><p>'+esc(project.id+' · '+project.name+' · '+type+' · '+date)+'</p><p>Event Log: '+esc(row.title)+'</p>'+
          '<fieldset><legend>'+esc(kind)+' units for this event</legend>'+options.map((u,i)=>'<label><input style="width:auto" type="checkbox" name="log-unit" value="'+i+'"> '+esc(u.label)+'</label>').join('')+'</fieldset>'+
          '<div class="toolbar"><button data-cancel-review>Cancel</button><button data-review-event="'+row.row+'" data-accept-selection>Review selection</button></div></section>';
        return;
      }
      if (manual && !saved && button.dataset.reviewEvent) {
        const checked = new Set(Array.from(results.querySelectorAll('input[name="log-unit"]:checked'), input => Number(input.value)));
        selection = {row:row.row, units:options.filter((u,i)=>checked.has(i))};
        if (!selection.units.length) { notify('Select at least one unit.'); return; }
      }
      const units = saved ? (saved.event.units || saved.event.hoists) : manual ? (selection?.row === row.row ? selection.units : []) : options;
      if (!units.length) return;
      if (button.dataset.reviewEvent) {
        document.getElementById('event-results').innerHTML = '<section class="card item" aria-labelledby="review-title">'+
          '<h2 id="review-title" tabindex="-1">Review '+esc(type)+' event</h2><p>'+esc(project.id)+' · '+esc(project.name)+'</p>'+
          '<p>'+(saved?'Current date: '+esc(saved.event.date)+'<br>Event Log date: ':'Date: ')+esc(date)+'<br>Equipment: '+esc(units.map(u=>u.label).join(', '))+'</p><p>Event Log: '+esc(row.title)+'</p>'+
          '<div class="toolbar"><button data-cancel-review>Cancel</button><button class="primary" data-create-event="'+row.row+'" data-prior-date="'+esc(saved?.event.date || '')+'">'+(saved?'Update event date':'Create event checklist')+'</button></div></section>';
        document.getElementById('review-title').focus();
        return;
      }
      button.disabled = true;
      try {
        await navigator.locks.request('scg-pm-event-import', () => {
          const key = 'scg-tc-checklists-v1';
          const fresh = JSON.parse(memberStorage.getItem(key) || '{}');
          copies = fresh;
          const existing = importedEvent(row.id);
          if (button.dataset.priorDate) {
            if (!existing || !matchesImportedUnit(existing,row,candidate) || existing.event.date !== button.dataset.priorDate) {
              notify('The saved event changed. Review its current details.');
              return;
            }
            const next = structuredClone(fresh);
            next[project.id].events.find(e => e.id === existing.event.id).date = date;
            memberStorage.setItem(key, JSON.stringify(next));
            copies = next;
            return;
          }
          if (existing) return;
          // Build the event and its tasks on a copy, then persist them together.
          const state = structuredClone(fresh[project.id] || {items:[],events:[],started:{}});
          seedProjectChecklist(state,kind);
          const id = 'event-log-'+row.id;
          state.events.push({id, eventLogId:String(row.id), kind, type, date, ...(manual ? {manualSourceTitle:row.title} : {}), [kind === 'Hoist' ? 'hoists' : 'units']:units});
          if (kind === 'Hoist') seedHoistChecklist(project,state);
          else seedCraneEvent(state,type,id);
          const next = {...fresh, [project.id]:state};
          memberStorage.setItem(key, JSON.stringify(next));
          copies = next;
        });
        filterResults();
      } catch {
        notify('Could not save the event in this browser. Reload and try again.');
        button.disabled = false;
      }
    };
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
