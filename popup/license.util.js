export function validateKey(key) {
  if (!key) return false;
  key = key.trim().toUpperCase();
  const m = key.match(/^TDT-ALL-([A-Z0-9]{8})-([A-F0-9]{4})$/);
  if (!m) return false;
  const body = m[1], chk = m[2];
  const sum = body.split('').reduce((a,c)=> a + c.charCodeAt(0), 0) & 0xFFFF;
  const hex = sum.toString(16).toUpperCase().padStart(4,'0');
  return hex === chk;
}
export function isLicensed(cb) {
  chrome.storage.sync.get(['tdt.license.key'], (res) => {
    const key = (res['tdt.license.key'] || '').toUpperCase().trim();
    cb( validateKey(key) );
  });
}
export function getKey(cb) {
  chrome.storage.sync.get(['tdt.license.key'], (res) => cb(res['tdt.license.key'] || ''));
}
export function savePref(k,v){ const o={}; o[k]=v; return chrome.storage.sync.set(o); }
export function loadPref(k,cb){ chrome.storage.sync.get([k], (res)=> cb(res[k])); }
