const fs=require('fs');
const path=require('path');
const root=__dirname;
const serverPath=path.join(root,'server.js');
const indexPath=path.join(root,'public','index.html');

let s=fs.readFileSync(serverPath,'utf8');
const mounts=[];
if(!s.includes("require('./social-runtime')({app,io,auth});"))mounts.push("require('./social-runtime')({app,io,auth});");
if(!s.includes("require('./chat-admin-runtime')({app,io,auth});"))mounts.push("require('./chat-admin-runtime')({app,io,auth});");
if(mounts.length){
  const needle='mongoose.connect(';
  const at=s.indexOf(needle);
  if(at<0)throw new Error('Lumo social patch: mongoose.connect target not found');
  s=s.slice(0,at)+"/* LUMO_SOCIAL_V3 */\n"+mounts.join('\n')+"\n\n"+s.slice(at);
  fs.writeFileSync(serverPath,s);
  console.log('Lumo social backend v3 mounted:',mounts.length);
}

let h=fs.readFileSync(indexPath,'utf8');
let changed=false;
if(!h.includes('/social-v3.css')){h=h.replace('</head>','<link rel="stylesheet" href="/social-v3.css?v=3"></head>');changed=true}
if(!h.includes('/social-v3.js')){h=h.replace('</body>','<script src="/social-v3.js?v=3"></script></body>');changed=true}
if(!h.includes('/global-v3.js')){h=h.replace('</body>','<script src="/global-v3.js?v=3"></script></body>');changed=true}
if(!h.includes('/chat-admin-v3.js')){h=h.replace('</body>','<script src="/chat-admin-v3.js?v=3"></script></body>');changed=true}
if(changed){fs.writeFileSync(indexPath,h);console.log('Lumo social UI v3 injected')}
