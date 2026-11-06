// Set to the portal's Google Web OAuth client ID before account testing.
const googleClientId = '';
const utilizationId = '1hLTZTMbTX9g4ZWYee4QJwmlAj1lfbiaKi8CZziPEWGY';
const cellValue = cell => (cell?.formattedValue || '').trim();

function parseUtilization(response) {
  const sheets = new Map(response.sheets.map(sheet => [sheet.properties.title, sheet.data[0].rowData]));
  const master = sheets.get('Master List');
  const fleet = sheets.get('TOWER CRANES');
  if (!master || !fleet) throw Error('Required Utilization tabs are missing.');
  const limit = Number(cellValue(master[1]?.values?.[1]));
  if (!Number.isInteger(limit) || limit < 3 || limit > fleet.length)
    throw Error('Check the tower crane row limit in Master List B2.');
  const masterRows = master.slice(5).map(row => row.values?.map(cellValue) || []);
  const records = new Map();
  const issues = [];
  for (const [index,row] of fleet.slice(2,limit).entries()) {
    const cells = row.values || [];
    const serial = cellValue(cells[2]) || cellValue(cells[6]);
    if (!serial || !cellValue(cells[0]) || cellValue(cells[20])==='UNDER CONTRACT') continue;
    for (const column of [15,20,27]) {
      const job = cells[column];
      const label = cellValue(job);
      if (!label) continue;
      const color = job.effectiveFormat?.backgroundColor || {};
      const green = color.green === 1 && !color.red && !color.blue;
      const purple = color.red === 1 && color.blue === 1 && !color.green;
      if (column !== 15 && !green && !purple) continue;
      const ids = [...new Set(label.match(/\b\d{2}-\d{3}\b/g) || [])];
      if (!ids.length && column === 15 && /yard|repair|sold|storage/i.test(label)) continue;
      const matches = masterRows.filter(r => r[2] === ids[0] && r[3] === 'TC' && r[5] === serial);
      if (ids.length !== 1 || !matches.length) {
        issues.push('Tower Cranes row '+(index+3)+': '+label);
        continue;
      }
      const [name,customer,id,,asset] = matches[0];
      const status = column===15 ? 'Active' : green ? 'Under Contract' : 'Verbal/LOI';
      const project = records.get(id) || {id,name,customer,location:[matches[0][10],matches[0][11]].filter(Boolean).join(', '),status,units:[]};
      if(status==='Active' || (status==='Under Contract' && project.status!=='Active')) project.status=status;
      if(!project.units.some(unit=>unit.serial===serial)) project.units.push({serial,asset,model:cellValue(cells[0])});
      records.set(id,project);
    }
  }
  return {projects:[...records.values()].map(p=>({...p,equipment:p.units.map(u=>[u.model,u.serial].filter(Boolean).join(' / ')).join(' · ')})),issues};
}

async function readUtilization(token) {
  const url = new URL('https://sheets.googleapis.com/v4/spreadsheets/'+utilizationId);
  for (const range of ["'Master List'!A1:L","'TOWER CRANES'!A1:AB"]) url.searchParams.append('ranges',range);
  url.searchParams.set('fields','sheets(properties(title),data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))');
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
