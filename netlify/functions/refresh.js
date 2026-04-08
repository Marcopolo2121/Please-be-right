
const SMARTSHEET_TOKEN = 'x2VvlV15490ku07kfb398KAXzBOBxSfkTrkGs';

const SHEET_IDS = [
  { id: '2238986157614980', name: 'B2B' },
  { id: '8502359983712132', name: 'Benelux' },
  { id: '367554486134660',  name: 'CEE' },
  { id: '1051725596518276', name: 'DACH' },
  { id: '3212700159004548', name: 'France' },
  { id: '3289300478519172', name: 'Iberia' },
  { id: '8327726613456772', name: 'Italy' },
  { id: '1839074706253700', name: 'MENA/Turkey/SA' },
  { id: '8251645562775428', name: 'Nordics' },
  { id: '7314522353493892', name: 'RCIS' },
  { id: '2148174912612228', name: 'SEE & Israel' },
  { id: '8795723429898116', name: 'UK' }
];

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

async function fetchSheet(sheetId, sheetName) {
  const res = await fetch(
    `https://api.smartsheet.com/2.0/sheets/${sheetId}?include=objectValue`,
    { headers: { 'Authorization': `Bearer ${SMARTSHEET_TOKEN}`, 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error(`Sheet ${sheetName}: HTTP ${res.status}`);
  const data = await res.json();

  const cols = {};
  data.columns.forEach(c => { cols[c.id] = c.title; });

  const customers = {};
  (data.rows || []).forEach(row => {
    const obj = { _sheet: sheetName };
    row.cells.forEach(cell => {
      const col = cols[cell.columnId];
      if (!col) return;
      // Handle MULTIPICKLIST — values are in objectValue.values array
      if (cell.objectValue && cell.objectValue.objectType === 'MULTI_PICKLIST' && Array.isArray(cell.objectValue.values)) {
        obj[col] = cell.objectValue.values.join(', ');
      } else if (cell.displayValue != null) {
        obj[col] = cell.displayValue;
      } else if (cell.value != null) {
        obj[col] = String(cell.value);
      } else {
        obj[col] = '';
      }
    });
    const name = obj['Oracle Customer Name'];
    if (name && String(name).trim()) customers[String(name).trim()] = obj;
  });
  return customers;
}

exports.handler = async function(event, context) {
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  try {
    const results = await Promise.allSettled(
      SHEET_IDS.map(s => fetchSheet(s.id, s.name))
    );

    const allCustomers = {};
    const errors = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        Object.assign(allCustomers, r.value);
      } else {
        errors.push(`${SHEET_IDS[i].name}: ${r.reason.message}`);
        console.error(`Failed: ${SHEET_IDS[i].name}:`, r.reason.message);
      }
    });

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ customers: allCustomers, errors })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: err.message })
    };
  }
};
