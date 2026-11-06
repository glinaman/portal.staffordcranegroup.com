// Set to the portal's Google Web OAuth client ID before account testing.
const googleClientId = '';
const utilizationId = '1hLTZTMbTX9g4ZWYee4QJwmlAj1lfbiaKi8CZziPEWGY';
const cellValue = cell => (cell?.formattedValue || '').trim();

function phoenixSheetDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Phoenix', year:'numeric',month:'numeric',day:'numeric'}).formatToParts(now);
  const values = Object.fromEntries(parts.map(p => [p.type, Number(p.value)]));
  return Date.UTC(values.year,values.month-1,values.day)/86400000 + 25569;
}

function parseUtilization(response, today = phoenixSheetDay()) {
  const grid = response.sheets.find(sheet => sheet.properties.title === 'Master List')?.data?.[0];
  if (!grid || cellValue(grid.rowData?.[0]?.values?.[2]) !== 'Project #') throw Error('Check the Master List headers.');
  const records = new Map(), issues = [];
  for (const [index,row] of grid.rowData.slice(1).entries()) {
    const cells = row.values || [];
    const [name,customer,id,kind,asset,serial] = cells.map(cellValue);
    if (!['TC','Hoist'].includes(kind)) continue;
    const color = cells[2]?.effectiveFormat?.backgroundColor || {};
    const green = color.green===1 && !color.red && !color.blue;
    const purple = color.red===1 && color.blue===1 && !color.green;
    const start = cells[6]?.effectiveValue?.numberValue;
    const end = cells[7]?.effectiveValue?.numberValue;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !id) {
      issues.push('Master List row '+(index+6)+': '+name+' — check project number and dates');
      continue;
    }
    if (end < today || (start > today && !green && !purple)) continue;
    const status = start <= today ? 'Active' : green ? 'Under Contract' : 'Verbal/LOI';
    const project = records.get(id) || {id,name,customer,location:[10,11].map(i=>cellValue(cells[i])).filter(Boolean).join(', '),status,units:[]};
    if(status==='Active' || (status==='Under Contract' && project.status!=='Active')) project.status=status;
    if(!project.units.some(u=>u.kind===kind && u.serial===serial && u.asset===asset)) project.units.push({kind,asset,serial});
    records.set(id,project);
  }
  const projects = [...records.values()].map(p=>{
    const kinds = new Set(p.units.map(u=>u.kind));
    const type = kinds.size>1?'Tower crane and hoist':kinds.has('TC')?'Tower crane':'Hoist';
    return {...p,type,equipment:p.units.map(u=>[u.kind,u.asset,u.serial].filter(Boolean).join(' / ')).join(' · ')};
  });
  return {projects,issues};
}

async function readUtilization(token) {
  const url = new URL('https://sheets.googleapis.com/v4/spreadsheets/'+utilizationId);
  url.searchParams.set('ranges',"'Master List'!A5:M");
  url.searchParams.set('fields','sheets(properties(title),data(rowData(values(formattedValue,effectiveValue,effectiveFormat(backgroundColor)))))');
  const response = await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok) throw Error('Google Sheets returned '+response.status+'. Check workbook access and the Sheets API configuration.');
  return parseUtilization(await response.json());
}

function requestAccess() {
  return new Promise((resolve,reject)=>{
    if (!googleClientId) return reject(Error('Configure the portal Google OAuth client ID before connecting.'));
    if (!window.google?.accounts?.oauth2) return reject(Error('Google sign-in did not load. Reload and try again.'));
    google.accounts.oauth2.initTokenClient({
      client_id:googleClientId,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',
      callback:r=>r.access_token?resolve(r.access_token):reject(Error('Google did not grant access.')),
      error_callback:()=>reject(Error('Google sign-in was closed or blocked.'))
    }).requestAccessToken();
  });
}
