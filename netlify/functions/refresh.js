
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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

async function fetchSheet(sheetId, sheetName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.smartsheet.com/2.0/sheets/${sheetId}?include=objectValue`,
      {
        headers: { 'Authorization': `Bearer ${SMARTSHEET_TOKEN}` },
        signal: controller.signal
      }
    );
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const cols = {};
    data.columns.forEach(c => { cols[c.id] = c.title; });

    const customers = {};
    (data.rows || []).forEach(row => {
      const obj = { _sheet: sheetName };
      row.cells.forEach(cell => {
        const col = cols[cell.columnId];
        if (!col) return;
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
    return { success: true, customers };
  } catch (err) {
    clearTimeout(timeout);
    return { success: false, error: `${sheetName}: ${err.message}` };
  }
}

exports.handler = async function(event, context) {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  // Allow longer execution time
  context.callbackWaitsForEmptyEventLoop = false;

  const allCustomers = {};
  const errors = [];

  // Fetch in two batches of 6 to avoid timeout
  const batch1 = SHEET_IDS.slice(0, 6);
  const batch2 = SHEET_IDS.slice(6);

  const results1 = await Promise.allSettled(batch1.map(s => fetchSheet(s.id, s.name)));
  const results2 = await Promise.allSettled(batch2.map(s => fetchSheet(s.id, s.name)));

  [...results1, ...results2].forEach(r => {
    if (r.status === 'fulfilled') {
      if (r.value.success) {
        Object.assign(allCustomers, r.value.customers);
      } else {
        errors.push(r.value.error);
      }
    }
  });

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({
      customers: allCustomers,
      count: Object.keys(allCustomers).length,
      errors
    })
  };
};
