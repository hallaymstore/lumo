const mongoose=require('mongoose');

module.exports=function mountSocialRuntime({app,io,auth}){
  const O=mongoose.Schema.Types.ObjectId;
  const User=mongoose.model('User');
  const Chat=mongoose.model('Chat');
  const Msg=mongoose.model('Msg');

  const Profile=mongoose.models.LumoProfile||mongoose.model('LumoProfile',new mongoose.Schema({
    user:{type:O,ref:'User',required:true,unique:true,index:true},
    cover:{type:String,default:''},
    status:{type:String,default:''},
    website:{type:String,default:''},
    birthday:{type:String,default:''},
    settings:{
      lastSeen:{type:Boolean,default:true},
      readReceipts:{type:Boolean,default:true},
      discoverable:{type:Boolean,default:true},
      notifications:{type:Boolean,default:true},
      storyReplies:{type:Boolean,default:true},
      autoplayVideo:{type:Boolean,default:true}
    }
  },{timestamps:true}));

  const Story=mongoose.models.LumoStory||mongoose.model('LumoStory',new mongoose.Schema({
    user:{type:O,ref:'User',required:true,index:true},
    text:{type:String,default:'',maxlength:1000},
    media:{url:String,name:String,mime:String,size:Number},
    views:[{type:O,ref:'User'}],
    reactions:[{user:{type:O,ref:'User'},emoji:{type:String,default:'❤️'}}],
    expiresAt:{type:Date,index:true}
  },{timestamps:true}));

  const MessageExtra=mongoose.models.LumoMessageExtra||mongoose.model('LumoMessageExtra',new mongoose.Schema({
    message:{type:O,ref:'Msg',required:true,unique:true,index:true},
    kind:{type:String,enum:['message','post'],default:'message'},
    title:{type:String,default:'',maxlength:180},
    media:[{url:String,name:String,mime:String,size:Number}],
    editedAt:{type:Date,default:null}
  },{timestamps:true}));

  const member=(c,id)=>c&&c.members.some(m=>String(m.user?._id||m.user)===String(id));
  const roleIn=(c,id)=>c?.members.find(m=>String(m.user?._id||m.user)===String(id))?.role||'';
  const cleanUser=u=>u?{id:String(u._id),name:u.name,username:u.username,avatar:u.avatar||'',bio:u.bio||'',role:u.role,lastSeen:u.lastSeen}:null;
  const safeRegex=s=>new RegExp(String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
  const safeMedia=a=>(Array.isArray(a)?a:[]).slice(0,4).map(x=>({url:String(x?.url||'').slice(0,1500),name:String(x?.name||'').slice(0,200),mime:String(x?.mime||'').slice(0,120),size:Number(x?.size)||0})).filter(x=>/^https?:\/\//i.test(x.url));

  async function getProfile(user){
    let p=await Profile.findOne({user:user._id});
    if(!p)p=await Profile.create({user:user._id});
    const [chatCount,groupCount,channelCount,storyCount]=await Promise.all([
      Chat.countDocuments({'members.user':user._id}),
      Chat.countDocuments({'members.user':user._id,type:'group'}),
      Chat.countDocuments({'members.user':user._id,type:'channel'}),
      Story.countDocuments({user:user._id,expiresAt:{$gt:new Date()}})
    ]);
    return {user:cleanUser(user),profile:{cover:p.cover,status:p.status,website:p.website,birthday:p.birthday,settings:p.settings},stats:{chats:chatCount,groups:groupCount,channels:channelCount,stories:storyCount}};
  }

  app.get('/api/profile/me',auth,async(req,res)=>res.json(await getProfile(req.user)));
  app.get('/api/profile/:username',auth,async(req,res)=>{
    const u=await User.findOne({username:String(req.params.username||'').toLowerCase()});
    if(!u)return res.status(404).json({error:'Profil topilmadi'});
    res.json(await getProfile(u));
  });
  app.patch('/api/profile/me',auth,async(req,res)=>{
    const set={};
    for(const k of ['cover','status','website','birthday'])if(req.body[k]!==undefined)set[k]=String(req.body[k]||'').trim().slice(0,k==='status'?160:1500);
    let p=await Profile.findOneAndUpdate({user:req.user._id},{$set:set},{new:true,upsert:true,setDefaultsOnInsert:true});
    if(req.body.name!==undefined)req.user.name=String(req.body.name||'').trim().slice(0,80)||req.user.name;
    if(req.body.bio!==undefined)req.user.bio=String(req.body.bio||'').trim().slice(0,500);
    if(req.body.avatar!==undefined)req.user.avatar=String(req.body.avatar||'').trim().slice(0,1500);
    await req.user.save();
    res.json(await getProfile(req.user));
  });
  app.get('/api/settings',auth,async(req,res)=>{
    let p=await Profile.findOne({user:req.user._id});if(!p)p=await Profile.create({user:req.user._id});
    res.json({settings:p.settings});
  });
  app.patch('/api/settings',auth,async(req,res)=>{
    const allowed=['lastSeen','readReceipts','discoverable','notifications','storyReplies','autoplayVideo'];
    const set={};for(const k of allowed)if(req.body[k]!==undefined)set['settings.'+k]=!!req.body[k];
    const p=await Profile.findOneAndUpdate({user:req.user._id},{$set:set},{new:true,upsert:true,setDefaultsOnInsert:true});
    res.json({settings:p.settings});
  });

  app.get('/api/profile/media',auth,async(req,res)=>{
    const a=await Msg.find({sender:req.user._id,'file.url':{$exists:true,$ne:''}}).sort({createdAt:-1}).limit(60);
    res.json({media:a.map(m=>({id:String(m._id),chat:String(m.chat),file:m.file,createdAt:m.createdAt}))});
  });

  app.get('/api/stories',auth,async(req,res)=>{
    const chats=await Chat.find({'members.user':req.user._id}).select('members.user');
    const ids=new Set([String(req.user._id)]);for(const c of chats)for(const m of c.members)ids.add(String(m.user));
    const users=[...ids].filter(mongoose.isValidObjectId);
    const stories=await Story.find({user:{$in:users},expiresAt:{$gt:new Date()}}).sort({createdAt:1}).populate('user','name username avatar bio role lastSeen');
    res.json({stories:stories.map(s=>({id:String(s._id),user:cleanUser(s.user),text:s.text,media:s.media,createdAt:s.createdAt,expiresAt:s.expiresAt,views:s.views.length,seen:s.views.some(x=>String(x)===String(req.user._id)),reactions:s.reactions.map(r=>({emoji:r.emoji,user:String(r.user)}))}))});
  });
  app.post('/api/stories',auth,async(req,res)=>{
    const media=req.body.media||{};const text=String(req.body.text||'').trim().slice(0,1000);
    if(!text&&!media.url)return res.status(400).json({error:'Story bo‘sh'});
    const s=await Story.create({user:req.user._id,text,media:media.url?{url:String(media.url).slice(0,1500),name:String(media.name||'').slice(0,200),mime:String(media.mime||'').slice(0,120),size:Number(media.size)||0}:undefined,expiresAt:new Date(Date.now()+24*60*60*1000)});
    res.json({story:{id:String(s._id),text:s.text,media:s.media,expiresAt:s.expiresAt}});
  });
  app.post('/api/stories/:id/view',auth,async(req,res)=>{
    const s=await Story.findById(req.params.id);if(!s||s.expiresAt<=new Date())return res.status(404).json({error:'Story topilmadi'});
    if(!s.views.some(x=>String(x)===String(req.user._id))){s.views.push(req.user._id);await s.save()}
    res.json({ok:true,views:s.views.length});
  });
  app.post('/api/stories/:id/react',auth,async(req,res)=>{
    const s=await Story.findById(req.params.id);if(!s||s.expiresAt<=new Date())return res.status(404).json({error:'Story topilmadi'});
    const emoji=String(req.body.emoji||'❤️').slice(0,8);const x=s.reactions.find(r=>String(r.user)===String(req.user._id));if(x)x.emoji=emoji;else s.reactions.push({user:req.user._id,emoji});await s.save();
    res.json({ok:true,reactions:s.reactions.length});
  });
  app.delete('/api/stories/:id',auth,async(req,res)=>{
    const s=await Story.findOne({_id:req.params.id,user:req.user._id});if(!s)return res.status(404).json({error:'Story topilmadi'});await s.deleteOne();res.json({ok:true});
  });

  app.get('/api/chats/:id/search',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});
    const q=String(req.query.q||'').trim();if(q.length<2)return res.json({messages:[]});
    const a=await Msg.find({chat:c._id,text:safeRegex(q)}).sort({createdAt:-1}).limit(50).populate('sender','name username avatar role lastSeen');
    res.json({messages:a.map(m=>({id:String(m._id),chat:String(m.chat),sender:cleanUser(m.sender),text:m.text,file:m.file,createdAt:m.createdAt}))});
  });
  app.get('/api/chats/:id/media',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});
    const a=await Msg.find({chat:c._id,'file.url':{$exists:true,$ne:''}}).sort({createdAt:-1}).limit(80).populate('sender','name username avatar');
    res.json({media:a.map(m=>({id:String(m._id),file:m.file,sender:cleanUser(m.sender),createdAt:m.createdAt}))});
  });
  app.get('/api/chats/:id/extras',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});
    const ids=String(req.query.ids||'').split(',').filter(mongoose.isValidObjectId).slice(0,100);
    const x=await MessageExtra.find({message:{$in:ids}});
    const extras={};for(const e of x)extras[String(e.message)]={kind:e.kind,title:e.title,media:e.media,editedAt:e.editedAt};res.json({extras});
  });

  app.patch('/api/messages/:id/edit',auth,async(req,res)=>{
    const m=await Msg.findById(req.params.id);if(!m)return res.status(404).json({error:'Xabar topilmadi'});
    if(String(m.sender)!==String(req.user._id))return res.status(403).json({error:'Faqat o‘z xabaringizni tahrirlaysiz'});
    const text=String(req.body.text||'').trim().slice(0,10000);if(!text&&!m.file?.url)return res.status(400).json({error:'Xabar bo‘sh'});
    m.text=text;await m.save();await MessageExtra.findOneAndUpdate({message:m._id},{$set:{editedAt:new Date()}},{upsert:true,new:true});
    io.to('c:'+m.chat).emit('message:edited',{id:String(m._id),text:m.text,editedAt:new Date()});res.json({ok:true,text:m.text});
  });
  app.delete('/api/messages/:id',auth,async(req,res)=>{
    const m=await Msg.findById(req.params.id);if(!m)return res.status(404).json({error:'Xabar topilmadi'});const c=await Chat.findById(m.chat);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});
    const can=String(m.sender)===String(req.user._id)||['owner','admin'].includes(roleIn(c,req.user._id));if(!can)return res.status(403).json({error:'O‘chirishga ruxsat yo‘q'});
    await MessageExtra.deleteOne({message:m._id});await m.deleteOne();if(String(c.lastMessage)===String(m._id)){const last=await Msg.findOne({chat:c._id}).sort({createdAt:-1});c.lastMessage=last?last._id:null;await c.save()}
    io.to('c:'+c._id).emit('message:deleted',{id:String(m._id)});res.json({ok:true});
  });

  app.post('/api/chats/:id/rich-message',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});
    if(c.type!=='channel')return res.status(400).json({error:'Rich post kanal uchun'});if(!['owner','admin'].includes(roleIn(c,req.user._id)))return res.status(403).json({error:'Kanalga faqat admin post joylaydi'});
    const text=String(req.body.text||'').trim().slice(0,10000),title=String(req.body.title||'').trim().slice(0,180),media=safeMedia(req.body.media);
    if(!text&&!title&&!media.length)return res.status(400).json({error:'Post bo‘sh'});
    let m=await Msg.create({chat:c._id,sender:req.user._id,text,file:media[0]||undefined});c.lastMessage=m._id;c.updatedAt=new Date();await c.save();
    const extra=await MessageExtra.create({message:m._id,kind:'post',title,media});m=await Msg.findById(m._id).populate('sender','name username avatar bio role lastSeen');
    const out={id:String(m._id),chat:String(m.chat),sender:cleanUser(m.sender),text:m.text,file:m.file||null,reactions:m.reactions||[],createdAt:m.createdAt,extra:{kind:'post',title:extra.title,media:extra.media}};
    io.to('c:'+c._id).emit('message',out);res.json({message:out});
  });

  app.get('/api/social/health',(_,res)=>res.json({ok:true,profiles:true,stories:true,richPosts:true,messageEdit:true,chatSearch:true}));
};
