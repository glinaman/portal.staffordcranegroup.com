const googleClientId = '804536967114-spfb410n04lmasclld1gbe4loq5aq0sn.apps.googleusercontent.com';
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
    let unit = project.units.find(u => u.kind === kind && u.serial === serial && u.asset === asset);
    if (!unit) {
      unit = {kind,asset,serial,rowNames:[]};
      project.units.push(unit);
    }
    if (name && !unit.rowNames.includes(name)) unit.rowNames.push(name);
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
  const response = await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw Error('Google Sheets returned '+response.status+'. Check workbook access and the Sheets API configuration.');
  return parseUtilization(await response.json());
}

async function requestAccess() {
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw Error('Google sign-in did not load. Reload the pilot and try again.');
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    throw Error('Click Try again yourself in the pilot tab to open the Google account chooser.');
  }
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Error('Google sign-in did not finish within 90 seconds. Check for a Google window or a blocked popup, then try again.')), 90000);
      const client = oauth.initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        prompt: 'select_account',
        callback: result => {
          if (result.access_token) resolve(result.access_token);
          else reject(Error('Google sign-in returned ' + (result.error || 'no access token') + '.'));
        },
        error_callback: error => reject(Error('Google sign-in could not finish (' + (error.type || 'unknown error') + '). Check for a blocked popup and try again.'))
      });
      client.requestAccessToken();
    });
  } finally {
    clearTimeout(timer);
  }
}
