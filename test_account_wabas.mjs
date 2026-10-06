import https from 'https';

const key = process.env.INFOBIP_API_KEY || '';
const host = process.env.INFOBIP_BASE_URL || '9kn66r.api-us.infobip.com';

function check(p) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: host,
      path: p,
      method: 'GET',
      headers: {
        'Authorization': `App ${key}`,
        'Accept': 'application/json'
      },
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        console.log(`GET ${p} -> ${res.statusCode}:`, data.slice(0, 300));
        resolve();
      });
    });
    req.on('error', e => { console.log(`GET ${p} -> err:`, e.message); resolve(); });
    req.on('timeout', () => { req.destroy(); console.log(`GET ${p} -> timeout`); resolve(); });
    req.end();
  });
}

await check('/whatsapp/1/senders');
await check('/whatsapp/2/senders/5511925399038/templates');
