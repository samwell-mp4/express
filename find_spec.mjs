const url = 'https://infobip-cdn-h0h7ekhqhgh4hgau.a02.azurefd.net/api-docs/production/js/2.6.3-SNAPSHOT-production-IBD-774-zfarmermedina/app.app.17028d8f410bb8b2.js';
const res = await fetch(url);
const text = await res.text();

let pos = 0;
while (true) {
  const found = text.indexOf('PhoneNumberRequest', pos);
  if (found === -1) break;
  console.log(`Found at ${found}:`);
  console.log(text.substring(found - 50, found + 350));
  pos = found + 19;
}
