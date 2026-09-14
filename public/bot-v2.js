/* Lumo Bot UI v2 — chat routes + automatic bot control */
(()=>{
  const css=document.createElement('style');
  css.textContent=`.botCard{cursor:pointer}.gear{flex:0 0 auto;border:0;background:var(--soft);color:var(--txt);width:36px;height:36px;border-radius:11px;font-size:17px}.botStatus{font-size:9px;padding:3px 7px;border-radius:99px;background:#1fa66b22;color:#65dfa5;margin-left:5px}.botStatus.off{background:#ff5c6820;color:#ff8b94}.botHint{font-size:10px;color:var(--mut);line-height:1.5}.botPanel h4{margin:18px 0 8px}.rule{border:1px solid var(--line);border-radius:14px;padding:10px;margin:8px 0;background:#ffffff05}.rule form{margin:0}.ruleActions{display:flex;gap:7px;margin-top:7px}.danger{background:#ff5667!important;color:#fff!important}.sep{height:1px;background:var(--line);margin:14px 0}.toggleRow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0}.toggleRow input{width:auto}.routeBadge{font-size:10px;color:var(--mut)}@media(max-width:760px){.mcard{border-radius:22px 22px 0 0;position:absolute;bottom:0;max-height:92dvh;width:100%}.modal{align-items:end;padding:0}.pane{transition:none}}`;
  document.head.append(css);

  const originalOpen=window.open;
  window.open=async function(c,opt={}){
    await originalOpen(c);
    if(opt.route!==false){const p='/chat/'+c.id;if(location.pathname!==p)history.pushState({chatId:c.id},'',p)}
  };

  function showList(){
    S.active=null;S.msgs=[];
    $('#app').classList.remove('open');
    $('#chat').classList.add('hide');
    $('#empty').classList.remove('hide');
    side();
  }
  async function routeFromUrl(){
    if(!S.me)return;
    const m=location.pathname.match(/^\/chat\/([a-f0-9]{24})$/i);
    if(!m){showList();return}
    if(!S.chats.length)await chats(false);
    const c=S.chats.find(x=>x.id===m[1]);
    if(c&&S.active?.id!==c.id)await window.open(c,{route:false});
  }
  $('#back').onclick=()=>{if(location.pathname.startsWith('/chat/'))history.back();else showList()};
  addEventListener('popstate',routeFromUrl);
  setTimeout(routeFromUrl,500);setTimeout(routeFromUrl,1500);

  window.bots=async function(){
    const l=$('#list');
    try{
      const d=await api('/api/bots');l.innerHTML='';
      d.bots.forEach(b=>{
        const r=document.createElement('div');r.className='res botCard';
        r.innerHTML=`<div class="av ch">🤖</div><div class="grow"><div class="title">${esc(b.name)} <span class="botStatus ${b.enabled?'':'off'}">${b.enabled?'ACTIVE':'OFF'}</span></div><div class="small">@${esc(b.username)} · ${b.commandCount||0} buyruq · ${b.replyCount||0} javob</div></div><button class="gear" title="Sozlamalar">⚙</button>`;
        r.onclick=async()=>{try{const x=await api('/api/bots/'+b.id+'/open',{method:'POST'});await chats(false);await window.open(x.chat)}catch(e){err(e)}};
        r.querySelector('.gear').onclick=e=>{e.stopPropagation();botEdit(b)};
        l.append(r);
      });
      const n=document.createElement('button');n.className='primary';n.style='width:calc(100% - 12px);margin:6px';n.textContent='＋ Bot yaratish';n.onclick=botNew;l.append(n);
    }catch(e){err(e)}
  };

  window.botNew=function(){
    modal(`<h3>Yangi bot 🤖</h3><p class="botHint">Bot yaratilishi bilan avtomatik <b>ACTIVE</b> bo‘ladi. Alohida webhook yoki worker shart emas.</p><form id="bf2"><input name="name" placeholder="Bot nomi" required><input name="username" placeholder="masalan yordamchibot" required><button class="primary">Yaratish va ishga tushirish</button></form>`);
    $('#bf2').onsubmit=async e=>{e.preventDefault();try{const d=await api('/api/bots',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});modal(`<h3>Bot ishga tushdi ✅</h3><div class="small">@${esc(d.bot.username)} · ACTIVE</div><p class="botHint">Token faqat hozir ko‘rsatiladi. Lumo ichidagi avtomatik javoblar uchun token kerak emas.</p><div class="code">${esc(d.bot.token)}</div><button id="botDone" class="primary" style="width:100%;margin-top:12px">Botni boshqarish</button>`);$('#botDone').onclick=()=>{close();botEdit({id:d.bot.id})}}catch(e){err(e)}};
  };

  window.botEdit=async function(b){
    try{
      const d=await api('/api/bots/'+b.id),x=d.bot;
      modal(`<div class="botPanel"><h3>🤖 ${esc(x.name)}</h3><div class="small">@${esc(x.username)}</div><div class="toggleRow"><div><b>Bot holati</b><div class="botHint">O‘chirilsa avtomatik javob bermaydi.</div></div><label><input id="ben" type="checkbox" ${x.enabled?'checked':''}> ACTIVE</label></div><form id="bmain"><input name="name" value="${esc(x.name)}" placeholder="Bot nomi"><textarea name="welcomeMessage" placeholder="/start javobi">${esc(x.welcomeMessage||'')}</textarea><textarea name="fallbackMessage" placeholder="Noma’lum xabarga javob (ixtiyoriy)">${esc(x.fallbackMessage||'')}</textarea><input name="webhook" value="${esc(x.webhook||'')}" placeholder="Tashqi webhook (ixtiyoriy)"><button class="primary">Asosiy sozlamalarni saqlash</button></form><div class="sep"></div><h4>Buyruqlar</h4><div class="botHint">Masalan: <b>/narx</b> → “Narximiz 50 000 so‘m”.</div><div id="cmds"></div><button id="addCmd" class="smBtn" style="width:100%">＋ Buyruq qo‘shish</button><h4>Kalit-so‘z javoblari</h4><div class="botHint">Masalan “manzil” yozilsa avtomatik manzilni qaytaradi.</div><div id="reps"></div><button id="addRep" class="smBtn" style="width:100%">＋ Javob qo‘shish</button><div class="sep"></div><button id="openBotChat" class="primary" style="width:100%">💬 Bot chatini ochish</button></div>`);
      $('#ben').onchange=async e=>{await api('/api/bots/'+x.id,{method:'PATCH',body:JSON.stringify({enabled:e.target.checked})});e.target.nextSibling};
      $('#bmain').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.enabled=$('#ben').checked;await api('/api/bots/'+x.id,{method:'PATCH',body:JSON.stringify(f)});alert('Saqlandi ✅')};
      $('#openBotChat').onclick=async()=>{const z=await api('/api/bots/'+x.id+'/open',{method:'POST'});await chats(false);close();await window.open(z.chat)};
      drawCommands(x);drawReplies(x);
    }catch(e){err(e)}
  };

  function drawCommands(bot){
    const box=$('#cmds');if(!box)return;box.innerHTML='';
    (bot.commands||[]).forEach(c=>{
      const r=document.createElement('div');r.className='rule';
      r.innerHTML=`<form><input name="command" value="${esc(c.command)}" placeholder="/buyruq"><textarea name="response" placeholder="Javob">${esc(c.response)}</textarea><label class="small"><input name="enabled" type="checkbox" style="width:auto" ${c.enabled?'checked':''}> faol</label><div class="ruleActions"><button class="smBtn" type="submit">Saqlash</button><button class="smBtn danger del" type="button">O‘chirish</button></div></form>`;
      r.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.enabled=!!f.enabled;await api('/api/bots/'+bot.id+'/commands/'+c._id,{method:'PATCH',body:JSON.stringify(f)});alert('Buyruq saqlandi ✅')};
      r.querySelector('.del').onclick=async()=>{if(confirm('Buyruq o‘chirilsinmi?')){await api('/api/bots/'+bot.id+'/commands/'+c._id,{method:'DELETE'});botEdit({id:bot.id})}};box.append(r)
    });
    if(!(bot.commands||[]).length)box.innerHTML='<div class="botHint">Hozircha buyruq yo‘q.</div>';
    $('#addCmd').onclick=()=>{const r=document.createElement('div');r.className='rule';r.innerHTML=`<form><input name="command" placeholder="/buyruq" required><textarea name="response" placeholder="Javob" required></textarea><button class="primary">Qo‘shish</button></form>`;r.querySelector('form').onsubmit=async e=>{e.preventDefault();await api('/api/bots/'+bot.id+'/commands',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});botEdit({id:bot.id})};box.append(r);r.querySelector('input').focus()}
  }

  function drawReplies(bot){
    const box=$('#reps');if(!box)return;box.innerHTML='';
    (bot.replies||[]).forEach(q=>{
      const r=document.createElement('div');r.className='rule';
      r.innerHTML=`<form><input name="trigger" value="${esc(q.trigger)}" placeholder="kalit so‘z"><textarea name="response" placeholder="Javob">${esc(q.response)}</textarea><select name="match" style="width:100%;padding:11px;border-radius:12px;background:var(--p2);color:var(--txt);border:1px solid var(--line)"><option value="contains" ${q.match==='contains'?'selected':''}>Ichida uchrasa</option><option value="exact" ${q.match==='exact'?'selected':''}>Aynan teng bo‘lsa</option></select><label class="small"><input name="enabled" type="checkbox" style="width:auto" ${q.enabled?'checked':''}> faol</label><div class="ruleActions"><button class="smBtn" type="submit">Saqlash</button><button class="smBtn danger del" type="button">O‘chirish</button></div></form>`;
      r.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.enabled=!!f.enabled;await api('/api/bots/'+bot.id+'/replies/'+q._id,{method:'PATCH',body:JSON.stringify(f)});alert('Javob saqlandi ✅')};
      r.querySelector('.del').onclick=async()=>{if(confirm('Javob o‘chirilsinmi?')){await api('/api/bots/'+bot.id+'/replies/'+q._id,{method:'DELETE'});botEdit({id:bot.id})}};box.append(r)
    });
    if(!(bot.replies||[]).length)box.innerHTML='<div class="botHint">Hozircha kalit-so‘z javobi yo‘q.</div>';
    $('#addRep').onclick=()=>{const r=document.createElement('div');r.className='rule';r.innerHTML=`<form><input name="trigger" placeholder="masalan: manzil" required><textarea name="response" placeholder="Avtomatik javob" required></textarea><select name="match" style="width:100%;padding:11px;border-radius:12px;background:var(--p2);color:var(--txt);border:1px solid var(--line)"><option value="contains">Ichida uchrasa</option><option value="exact">Aynan teng bo‘lsa</option></select><button class="primary">Qo‘shish</button></form>`;r.querySelector('form').onsubmit=async e=>{e.preventDefault();await api('/api/bots/'+bot.id+'/replies',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});botEdit({id:bot.id})};box.append(r);r.querySelector('input').focus()}
  }
})();
