const https = require('https');
const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = 'cc8111a6b08848cfab168b401ff34742';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: 'api.notion.com', path, method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => resolve(JSON.parse(s)));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function toTerm(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: p['Actividad / Asunto']?.title?.[0]?.plain_text || '',
    type: p['Tipo']?.select?.name || '',
    start: p['Fecha inicio']?.date?.start || '',
    days: p['Dias habiles']?.number || 0,
    deadline: p['Fecha vencimiento']?.date?.start || '',
    alert: p['Alerta dias antes']?.number || 3,
    notes: p['Observaciones']?.rich_text?.[0]?.plain_text || '',
    done: p['Cumplido']?.checkbox || false
  };
}

function toProps(t) {
  const p = {};
  if (t.name !== undefined) p['Actividad / Asunto'] = { title: [{ text: { content: t.name } }] };
  if (t.type !== undefined) p['Tipo'] = { select: { name: t.type } };
  if (t.start !== undefined) p['Fecha inicio'] = { date: { start: t.start } };
  if (t.days !== undefined) p['Dias habiles'] = { number: t.days };
  if (t.deadline !== undefined) p['Fecha vencimiento'] = { date: { start: t.deadline } };
  if (t.alert !== undefined) p['Alerta dias antes'] = { number: t.alert };
  if (t.notes !== undefined) p['Observaciones'] = { rich_text: [{ text: { content: t.notes } }] };
  if (t.done !== undefined) p['Cumplido'] = { checkbox: t.done };
  return p;
}

const H = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  try {
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};
    if (method === 'GET' && !event.queryStringParameters?.all) {
      const res = await req('POST', '/v1/databases/' + DB_ID + '/query', {
        filter: { property: 'Cumplido', checkbox: { equals: false } },
        sorts: [{ property: 'Fecha vencimiento', direction: 'ascending' }]
      });
      return { statusCode: 200, headers: H, body: JSON.stringify((res.results || []).map(toTerm)) };
    }
    if (method === 'GET' && event.queryStringParameters?.all) {
      const res = await req('POST', '/v1/databases/' + DB_ID + '/query', {
        sorts: [{ property: 'Fecha vencimiento', direction: 'ascending' }]
      });
      return { statusCode: 200, headers: H, body: JSON.stringify((res.results || []).map(toTerm)) };
    }
    if (method === 'POST' && !body._action) {
      const res = await req('POST', '/v1/pages', { parent: { database_id: DB_ID }, properties: toProps(body) });
      return { statusCode: 200, headers: H, body: JSON.stringify(toTerm(res)) };
    }
    if (method === 'POST' && body._action === 'update') {
      const { id, _action, ...rest } = body;
      const res = await req('PATCH', '/v1/pages/' + id, { properties: toProps(rest) });
      return { statusCode: 200, headers: H, body: JSON.stringify(toTerm(res)) };
    }
    if (method === 'POST' && body._action === 'delete') {
      await req('PATCH', '/v1/pages/' + body.id, { archived: true });
      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true }) };
    }
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Bad request' }) };
  } catch (e) {
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};
