/* shared Lumo v3 helpers */
window.toast=window.toast||function(message){const x=document.createElement('div');x.className='toast';x.textContent=String(message||'');document.body.append(x);setTimeout(()=>x.remove(),1800)};
