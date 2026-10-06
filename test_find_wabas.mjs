import https from 'https';

const key = 'a20edbf816d727811c324791316af20b-56e251b9-66f6-4f75-b461-e9006d123473';
const host = '9kn66r.api-us.infobip.com';

function getJson(p) {
  return new Promise((resolve) => {
    https.get({
      hostname: host,
      path: p,
      headers: {
        'Authorization': `App ${key}`,
        'Accept': 'application/json'
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve({}); }
      });
    }).on('error', () => resolve({}));
  });
}

const templatesRes = await getJson('/whatsapp/1/templates?page=0&size=100');
const wabas = new Set();
if (templatesRes.results) {
  for (const t of templatesRes.results) {
    if (t.businessAccountId) wabas.add(t.businessAccountId);
  }
}

const direct1 = await getJson('/whatsapp/2/senders/5511925399038/templates');
if (direct1.templates) {
  for (const t of direct1.templates) {
    if (t.businessAccountId) wabas.add(t.businessAccountId);
  }
}

const direct2 = await getJson('/whatsapp/2/senders/15559321381/templates');
if (direct2.templates) {
  for (const t of direct2.templates) {
    if (t.businessAccountId) wabas.add(t.businessAccountId);
  }
}

console.log('Known WABA IDs on this Infobip account:', [...wabas]);
