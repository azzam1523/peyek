const fs=require('fs');
const cfg=JSON.parse(fs.readFileSync('D:/Test/ActionFishShooter/downloaded_assets_fish3/_crawl/internal.config.json','utf8'));
const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const map={}; for(let i=0;i<chars.length;i++) map[chars.charCodeAt(i)]=i;
const hex='0123456789abcdef'.split('');
function decode(b){ if(!b||b.length!==22) return b; const t=['','','','','','','','','-','','','','-','','','','-','','','','-','','','','','','','','','','','','','','','','']; const idx=[]; for(let i=0;i<t.length;i++) if(t[i]!=='-') idx.push(i);
 t[0]=b[0]; t[1]=b[1]; let j=2; for(let i=2;i<22;i+=2){const lhs=map[b.charCodeAt(i)], rhs=map[b.charCodeAt(i+1)]; t[idx[j++]]=hex[lhs>>2]; t[idx[j++]]=hex[((lhs&3)<<2)|(rhs>>4)]; t[idx[j++]]=hex[rhs&15]; }
 return t.join(''); }
const i=cfg.versions.native[0], h=cfg.versions.native[1];
const raw=cfg.uuids[i]; const u=decode(raw);
console.log(JSON.stringify({i,h,raw,u}));
