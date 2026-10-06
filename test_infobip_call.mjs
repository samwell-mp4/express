import https from 'https';

const key = process.env.INFOBIP_API_KEY || '';
const host = process.env.INFOBIP_BASE_URL || '9kn66r.api-us.infobip.com';

function testPost(wabaId) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      countryCode: '55',
      phoneNumber: '31988868362',
      displayName: 'Snack Store BH',
      type: 'EXTERNAL_SMS',
      locale: 'pt_BR'
    });

    const p = `/whatsapp/1/embedded-signup/registrations/business-account/${wabaId}/senders`;

    const req = https.request({
      hostname: host,
      path: p,
      method: 'POST',
      headers: {
        'Authorization': `App ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        console.log(`WABA ${wabaId} -> Status: ${res.statusCode}:`, data);
        resolve();
      });
    });
    req.on('error', e => { console.log(`WABA ${wabaId} -> Error:`, e.message); resolve(); });
    req.on('timeout', () => { req.destroy(); console.log(`WABA ${wabaId} -> Timeout`); resolve(); });
    req.write(payload);
    req.end();
  });
}

await testPost('1448256416490235');
await testPost('1546821873765545');
await testPost('875786408937731');
