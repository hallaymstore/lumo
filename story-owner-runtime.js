const mongoose=require('mongoose');
module.exports=function mountStoryOwner({app,auth}){
  const Story=mongoose.model('LumoStory');
  const cleanMedia=m=>m&&m.url?{url:String(m.url).slice(0,1500),name:String(m.name||'').slice(0,200),mime:String(m.mime||'').slice(0,120),size:Number(m.size)||0}:undefined;
  app.get('/api/stories-mine',auth,async(req,res)=>{
    const a=await Story.find({user:req.user._id,expiresAt:{$gt:new Date()}}).sort({createdAt:-1});
    res.json({stories:a.map(s=>({id:String(s._id),text:s.text,media:s.media,views:s.views.length,reactions:s.reactions.map(r=>r.emoji),createdAt:s.createdAt,expiresAt:s.expiresAt}))});
  });
  app.patch('/api/stories/:id',auth,async(req,res)=>{
    const s=await Story.findOne({_id:req.params.id,user:req.user._id,expiresAt:{$gt:new Date()}});if(!s)return res.status(404).json({error:'Story topilmadi'});
    if(req.body.text!==undefined)s.text=String(req.body.text||'').trim().slice(0,1000);
    if(req.body.media!==undefined)s.media=cleanMedia(req.body.media);
    if(!s.text&&!s.media?.url)return res.status(400).json({error:'Story bo‘sh qolmaydi'});
    await s.save();res.json({ok:true,story:{id:String(s._id),text:s.text,media:s.media,views:s.views.length,reactions:s.reactions.length,expiresAt:s.expiresAt}})
  });
};
