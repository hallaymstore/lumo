/* Lumo story owner shortcut */
(()=>{
  function add(){const rail=document.querySelector('#storyRail');if(!rail||rail.querySelector('.storyManage'))return;const b=document.createElement('button');b.className='storyChip storyManage';b.innerHTML='<span class="storyRing seen">⚙</span><small>Boshqarish</small>';b.onclick=()=>location.href='/stories.html';const addBtn=rail.querySelector('.storyAdd');addBtn?.after(b)}
  setTimeout(add,900);setTimeout(add,1800);setInterval(add,5000)
})();
