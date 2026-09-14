const mongoose=require('mongoose');

module.exports=function mountPowerV4({app,io,auth}){
  const O=mongoose.Schema.Types.ObjectId;
  const User=mongoose.model('User'),Chat=mongoose.model('Chat'),Msg=mongoose.model('Msg');
  const Profile=mongoose.models.LumoProfile;
  const MessageExtra=mongoose.models.LumoMessageExtra;
  const ReadState=mongoose.models.LumoReadState;

  const Presence=mongoose.models.LumoPresence||mongoose.model('LumoPresence',new mongoose.Schema({
    user:{type:O,ref:'User',required:true,unique:true,index:true},lastPing:{type:Date,default:Date.now,index:true}
  },{timestamps:true}));
  const Notification=mongoose.models.LumoNotification||mongoose.model('LumoNotification',new mongoose.Schema({
    user:{type:O,ref:'User',required:true,index:true},actor:{type:O,ref:'User'},type:{type:String,default:'system',index:true},title:{type:String,default:''},text:{type:String,default:''},chat:{type:O,ref:'Chat'},message:{type:O,ref:'Msg'},read:{type:Boolean,default:false,index:true},meta:{type:mongoose.Schema.Types.Mixed,default:{}}
  },{timestamps:true}));
  const Block=mongoose.models.LumoBlock||mongoose.model('LumoBlock',new mongoose.Schema({
    user:{type:O,ref:'User',required:true,index:true},target:{type:O,ref:'User',required:true,index:true}
  },{timestamps:true}));
  Block.schema.index({user:1,target:1},{unique:true});
  const Report=mongoose.models.LumoReport||mongoose.model('LumoReport',new mongoose.Schema({
    reporter:{type:O,ref:'User',required:true,index:true},targetType:{type:String,enum:['user','chat','message'],required:true},targetId:{type:O,required:true,index:true},reason:{type:String,required:true},details:{type:String,default:''},status:{type:String,enum:['open','reviewed','closed'],default:'open',index:true}
  },{timestamps:true}));
  const Comment=mongoose.models.LumoPostComment||mongoose.model('LumoPostComment',new mongoose.Schema({
    message:{type:O,ref:'Msg',required:true,index:true},user:{type:O,ref:'User',required:true,index:true},parent:{type:O,ref:'LumoPostComment',default:null},text:{type:String,required:true,maxlength:3000},reactions:[{emoji:String,users:[{type:O,ref:'User'}]}]
  },{timestamps:true}));
  const MsgMeta=mongoose.models.LumoMessageMeta||mongoose.model('LumoMessageMeta',new mongoose.Schema({
    message:{type:O,ref:'Msg',required:true,unique:true,index:true},mentions:[{type:O,ref:'User'}],hashtags:[{type:String,index:true}]
  },{timestamps:true}));
  const Scheduled=mongoose.models.LumoScheduledPost||mongoose.model('LumoScheduledPost',new mongoose.Schema({
    chat:{type:O,ref:'Chat',required:true,index:true},author:{type:O,ref:'User',required:true,index:true},title:{type:String,default:'',maxlength:180},text:{type:String,default:'',maxlength:10000},media:[{url:String,name:String,mime:String,size:Number}],publishAt:{type:Date,required:true,index:true},status:{type:String,enum:['pending','publishing','published','cancelled','failed'],default:'pending',index:true},publishedMessage:{type:O,ref:'Msg'},error:{type:String,default:''}
  },{timestamps:true}));

  const member=(c,id)=>c&&c.members.some(m=>String(m.user?._id||m.user)===String(id));
  const role=(c,id)=>c?.members.find(m=>String(m.user?._id||m.user)===String(id))?.role||'';
  const admin=(c,id)=>['owner','admin'].includes(role(c,id));
  const cleanUser=u=>u?{id:String(u._id),name:u.name,username:u.username,avatar:u.avatar||'',lastSeen:u.lastSeen}:null;
  const safeMedia=a=>(Array.isArray(a)?a:[]).slice(0,4).map(x=>({url:String(x?.url||'').slice(0,1500),name:String(x?.name||'').slice(0,200),mime:String(x?.mime||'').slice(0,120),size:Number(x?.size)||0})).filter(x=>/^https?:\/\//i.test(x.url));
  const unique=a=>[...new Set(a)];
  const parseTokens=text=>({
    usernames:unique([...String(text||'').matchAll(/(^|\s)@([a-z0-9_]{3,32})\b/gi)].map(x=>x[2].toLowerCase())).slice(0,30),
    hashtags:unique([...String(text||'').matchAll(/(^|\s)#([\p{L}\p{N}_]{2,50})/gu)].map(x=>x[2].toLowerCase())).slice(0,30)
  });
  async function blocked(a,b){return !!await Block.exists({$or:[{user:a,target:b},{user:b,target:a}]});}
  async function notify(user,actor,type,title,text,chat,message,meta={}){
    if(!user||String(user)===String(actor))return;
    await Notification.create({user,actor,type,title:String(title||'').slice(0,160),text:String(text||'').slice(0,500),chat,message,meta});
    io.to('u:'+user).emit('notification:new',{type,title,text,chat:chat?String(chat):null,message:message?String(message):null});
  }
  async function indexMessage(m,c,actor){
    const {usernames,hashtags}=parseTokens(m.text);
    const users=usernames.length?await User.find({username:{$in:usernames}}).select('_id username'):[];
    const mentionIds=users.filter(u=>member(c,u._id)).map(u=>u._id);
    await MsgMeta.findOneAndUpdate({message:m._id},{$set:{mentions:mentionIds,hashtags}},{upsert:true,new:true,setDefaultsOnInsert:true});
    for(const uid of mentionIds)await notify(uid,actor._id,'mention','Sizni xabarda belgilashdi',`@${actor.username}: ${String(m.text||'').slice(0,180)}`,c._id,m._id,{username:actor.username});
  }
  async function outMessage(m){
    await m.populate('sender','name username avatar bio role lastSeen');
    const x=m.toObject();return{id:String(x._id),chat:String(x.chat),sender:cleanUser(x.sender),text:x.text,file:x.file||null,reactions:x.reactions||[],createdAt:x.createdAt};
  }

  app.post('/api/presence/ping',auth,async(req,res)=>{
    const now=new Date();await Presence.findOneAndUpdate({user:req.user._id},{$set:{lastPing:now}},{upsert:true,new:true,setDefaultsOnInsert:true});req.user.lastSeen=now;await req.user.save();res.json({ok:true,at:now});
  });
  app.get('/api/presence',auth,async(req,res)=>{
    const ids=String(req.query.ids||'').split(',').filter(mongoose.isValidObjectId).slice(0,100);
    const [rows,users,profiles]=await Promise.all([Presence.find({user:{$in:ids}}),User.find({_id:{$in:ids}}).select('_id lastSeen'),Profile?Profile.find({user:{$in:ids}}).select('user settings.lastSeen'):[]]);
    const pm=new Map(rows.map(x=>[String(x.user),x.lastPing])),lm=new Map(users.map(x=>[String(x._id),x.lastSeen])),privacy=new Map((profiles||[]).map(x=>[String(x.user),x.settings?.lastSeen!==false]));
    const now=Date.now(),presence={};for(const id of ids){const ping=pm.get(id);presence[id]={online:!!ping&&now-new Date(ping).getTime()<55000,lastSeen:privacy.get(id)===false&&id!==String(req.user._id)?null:(ping||lm.get(id)||null)}}res.json({presence});
  });

  app.get('/api/notifications',auth,async(req,res)=>{
    const rows=await Notification.find({user:req.user._id}).sort({createdAt:-1}).limit(80).populate('actor','name username avatar');const unread=await Notification.countDocuments({user:req.user._id,read:false});
    res.json({unread,notifications:rows.map(n=>({id:String(n._id),type:n.type,title:n.title,text:n.text,chat:n.chat?String(n.chat):null,message:n.message?String(n.message):null,read:n.read,createdAt:n.createdAt,actor:cleanUser(n.actor),meta:n.meta||{}}))});
  });
  app.post('/api/notifications/read-all',auth,async(req,res)=>{await Notification.updateMany({user:req.user._id,read:false},{$set:{read:true}});res.json({ok:true})});
  app.post('/api/notifications/:id/read',auth,async(req,res)=>{await Notification.updateOne({_id:req.params.id,user:req.user._id},{$set:{read:true}});res.json({ok:true})});

  app.get('/api/blocks',auth,async(req,res)=>{const rows=await Block.find({user:req.user._id}).sort({createdAt:-1}).populate('target','name username avatar lastSeen');res.json({users:rows.map(x=>cleanUser(x.target))})});
  app.post('/api/users/:id/block',auth,async(req,res)=>{if(String(req.params.id)===String(req.user._id)||!mongoose.isValidObjectId(req.params.id))return res.status(400).json({error:'User noto‘g‘ri'});await Block.findOneAndUpdate({user:req.user._id,target:req.params.id},{$set:{user:req.user._id,target:req.params.id}},{upsert:true,new:true,setDefaultsOnInsert:true});res.json({ok:true})});
  app.delete('/api/users/:id/block',auth,async(req,res)=>{await Block.deleteOne({user:req.user._id,target:req.params.id});res.json({ok:true})});
  app.get('/api/users/:id/block-status',auth,async(req,res)=>{const mine=!!await Block.exists({user:req.user._id,target:req.params.id}),theirs=!!await Block.exists({user:req.params.id,target:req.user._id});res.json({blocked:mine,blockedByThem:theirs,blockedEither:mine||theirs})});

  app.post('/api/reports',auth,async(req,res)=>{
    const targetType=['user','chat','message'].includes(req.body.targetType)?req.body.targetType:null,targetId=String(req.body.targetId||''),reason=String(req.body.reason||'').trim().slice(0,120),details=String(req.body.details||'').trim().slice(0,1500);
    if(!targetType||!mongoose.isValidObjectId(targetId)||reason.length<3)return res.status(400).json({error:'Hisobot ma’lumotlari noto‘g‘ri'});
    const r=await Report.create({reporter:req.user._id,targetType,targetId,reason,details});res.json({ok:true,id:String(r._id)});
  });

  app.post('/api/power/chats/:id/messages',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});
    if(c.type==='channel'&&!admin(c,req.user._id))return res.status(403).json({error:'Kanalga faqat admin yozadi'});
    if(c.type==='dm'){const other=c.members.map(x=>x.user).find(x=>String(x)!==String(req.user._id));if(other&&await blocked(req.user._id,other))return res.status(403).json({error:'Bu foydalanuvchi bilan yozishma bloklangan'});}
    const text=String(req.body.text||'').trim().slice(0,10000),file=req.body.file?.url?{url:String(req.body.file.url).slice(0,1500),name:String(req.body.file.name||'').slice(0,200),mime:String(req.body.file.mime||'').slice(0,120),size:Number(req.body.file.size)||0}:undefined;
    if(!text&&!file?.url)return res.status(400).json({error:'Xabar bo‘sh'});
    let m=await Msg.create({chat:c._id,sender:req.user._id,text,file});c.lastMessage=m._id;c.updatedAt=new Date();await c.save();await indexMessage(m,c,req.user);const out=await outMessage(m);io.to('c:'+c._id).emit('message',out);res.json({message:out});
  });
  app.post('/api/messages/:id/index',auth,async(req,res)=>{const m=await Msg.findById(req.params.id),c=m&&await Chat.findById(m.chat);if(!m||!c||String(m.sender)!==String(req.user._id)||!member(c,req.user._id))return res.status(404).json({error:'Xabar topilmadi'});await indexMessage(m,c,req.user);res.json({ok:true})});

  app.get('/api/tags/:tag/messages',auth,async(req,res)=>{
    const tag=String(req.params.tag||'').toLowerCase().replace(/^#/,'').slice(0,50);const chats=await Chat.find({'members.user':req.user._id}).select('_id');const chatIds=chats.map(x=>x._id);const metas=await MsgMeta.find({hashtags:tag}).sort({createdAt:-1}).limit(100).select('message');const msgs=await Msg.find({_id:{$in:metas.map(x=>x.message)},chat:{$in:chatIds}}).sort({createdAt:-1}).limit(50).populate('sender','name username avatar');res.json({messages:await Promise.all(msgs.map(outMessage))});
  });

  app.get('/api/posts/:mid/comments',auth,async(req,res)=>{
    const m=await Msg.findById(req.params.mid),c=m&&await Chat.findById(m.chat);if(!m||!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});const rows=await Comment.find({message:m._id}).sort({createdAt:1}).limit(200).populate('user','name username avatar').populate({path:'parent',populate:{path:'user',select:'name username'}});res.json({comments:rows.map(x=>({id:String(x._id),text:x.text,user:cleanUser(x.user),parent:x.parent?{id:String(x.parent._id),user:cleanUser(x.parent.user),text:x.parent.text}:null,reactions:x.reactions||[],createdAt:x.createdAt}))});
  });
  app.get('/api/chats/:id/comment-counts',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});const ids=String(req.query.ids||'').split(',').filter(mongoose.isValidObjectId).slice(0,100);const agg=await Comment.aggregate([{$match:{message:{$in:ids.map(x=>new mongoose.Types.ObjectId(x))}}},{$group:{_id:'$message',count:{$sum:1}}}]);const counts={};agg.forEach(x=>counts[String(x._id)]=x.count);res.json({counts})});
  app.post('/api/posts/:mid/comments',auth,async(req,res)=>{
    const m=await Msg.findById(req.params.mid),c=m&&await Chat.findById(m.chat);if(!m||!c||c.type!=='channel'||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});const text=String(req.body.text||'').trim().slice(0,3000);if(!text)return res.status(400).json({error:'Izoh bo‘sh'});let parent=null;if(req.body.parent&&mongoose.isValidObjectId(req.body.parent))parent=await Comment.findOne({_id:req.body.parent,message:m._id});const x=await Comment.create({message:m._id,user:req.user._id,parent:parent?parent._id:null,text});const author=String(m.sender);await notify(author,req.user._id,'comment','Kanal postingizga izoh',`${req.user.name}: ${text.slice(0,180)}`,c._id,m._id,{commentId:String(x._id)});if(parent&&String(parent.user)!==author)await notify(parent.user,req.user._id,'reply','Izohingizga javob',`${req.user.name}: ${text.slice(0,180)}`,c._id,m._id,{commentId:String(x._id)});io.to('c:'+c._id).emit('comments:updated',{messageId:String(m._id)});res.json({comment:{id:String(x._id),text:x.text,user:cleanUser(req.user),parent:parent?String(parent._id):null,createdAt:x.createdAt}});
  });
  app.delete('/api/comments/:id',auth,async(req,res)=>{const x=await Comment.findById(req.params.id);if(!x)return res.status(404).json({error:'Izoh topilmadi'});const m=await Msg.findById(x.message),c=m&&await Chat.findById(m.chat);if(!c||(!admin(c,req.user._id)&&String(x.user)!==String(req.user._id)))return res.status(403).json({error:'Ruxsat yo‘q'});await x.deleteOne();io.to('c:'+c._id).emit('comments:updated',{messageId:String(m._id)});res.json({ok:true})});
  app.post('/api/comments/:id/react',auth,async(req,res)=>{const x=await Comment.findById(req.params.id);if(!x)return res.status(404).json({error:'Izoh topilmadi'});const m=await Msg.findById(x.message),c=m&&await Chat.findById(m.chat);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});const e=String(req.body.emoji||'❤️').slice(0,8);let r=x.reactions.find(z=>z.emoji===e);if(!r)x.reactions.push({emoji:e,users:[req.user._id]});else{const i=r.users.findIndex(z=>String(z)===String(req.user._id));i>=0?r.users.splice(i,1):r.users.push(req.user._id)}await x.save();res.json({reactions:x.reactions})});

  app.post('/api/power/chats/:id/read',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id)||!ReadState)return res.status(403).json({error:'Ruxsat yo‘q'});let allow=true;if(Profile){const p=await Profile.findOne({user:req.user._id});allow=p?.settings?.readReceipts!==false}if(allow){const at=new Date();await ReadState.findOneAndUpdate({chat:c._id,user:req.user._id},{$set:{lastReadAt:at}},{upsert:true,new:true,setDefaultsOnInsert:true});io.to('c:'+c._id).emit('read:updated',{chatId:String(c._id),userId:String(req.user._id),at})}res.json({ok:true});
  });
  app.get('/api/chats/:id/read-status',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id)||!ReadState)return res.status(403).json({error:'Ruxsat yo‘q'});const ids=String(req.query.ids||'').split(',').filter(mongoose.isValidObjectId).slice(0,100),msgs=await Msg.find({_id:{$in:ids},chat:c._id}).select('_id sender createdAt');const others=c.members.map(x=>x.user).filter(x=>String(x)!==String(req.user._id)),states=await ReadState.find({chat:c._id,user:{$in:others}});let hidden=new Set;if(Profile){const ps=await Profile.find({user:{$in:others},'settings.readReceipts':false}).select('user');hidden=new Set(ps.map(x=>String(x.user)))}const map={};for(const m of msgs){let readers=0;for(const s of states)if(!hidden.has(String(s.user))&&new Date(s.lastReadAt)>=new Date(m.createdAt))readers++;map[String(m._id)]={seen:readers>0,readers}}res.json({status:map});
  });

  app.get('/api/chats/:id/scheduled',auth,async(req,res)=>{const c=await Chat.findById(req.params.id);if(!c||!admin(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});const rows=await Scheduled.find({chat:c._id,status:'pending'}).sort({publishAt:1}).limit(100);res.json({posts:rows.map(x=>({id:String(x._id),title:x.title,text:x.text,media:x.media,publishAt:x.publishAt,status:x.status}))})});
  app.post('/api/chats/:id/scheduled',auth,async(req,res)=>{const c=await Chat.findById(req.params.id);if(!c||c.type!=='channel'||!admin(c,req.user._id))return res.status(403).json({error:'Faqat kanal admini rejalashtiradi'});const publishAt=new Date(req.body.publishAt);if(!publishAt.getTime()||publishAt<=new Date(Date.now()+30000)||publishAt>new Date(Date.now()+366*86400000))return res.status(400).json({error:'Vaqt kamida 30 soniya keyin bo‘lsin'});const title=String(req.body.title||'').trim().slice(0,180),text=String(req.body.text||'').trim().slice(0,10000),media=safeMedia(req.body.media);if(!title&&!text&&!media.length)return res.status(400).json({error:'Post bo‘sh'});const x=await Scheduled.create({chat:c._id,author:req.user._id,title,text,media,publishAt});res.json({post:{id:String(x._id),publishAt:x.publishAt}})});
  app.delete('/api/scheduled/:id',auth,async(req,res)=>{const x=await Scheduled.findById(req.params.id);if(!x)return res.status(404).json({error:'Topilmadi'});const c=await Chat.findById(x.chat);if(!c||!admin(c,req.user._id)||x.status!=='pending')return res.status(403).json({error:'Ruxsat yo‘q'});x.status='cancelled';await x.save();res.json({ok:true})});

  async function publishScheduled(){
    try{
      const x=await Scheduled.findOneAndUpdate({status:'pending',publishAt:{$lte:new Date()}},{$set:{status:'publishing'}},{new:true,sort:{publishAt:1}});if(!x)return;
      const c=await Chat.findById(x.chat),u=await User.findById(x.author);if(!c||!u){x.status='failed';x.error='Chat yoki muallif topilmadi';return x.save()}
      let m=await Msg.create({chat:c._id,sender:u._id,text:x.text,file:x.media?.[0]||undefined});c.lastMessage=m._id;c.updatedAt=new Date();await c.save();if(MessageExtra)await MessageExtra.create({message:m._id,kind:'post',title:x.title,media:x.media||[]});await indexMessage(m,c,u);x.status='published';x.publishedMessage=m._id;await x.save();const out=await outMessage(m);out.extra={kind:'post',title:x.title,media:x.media||[]};io.to('c:'+c._id).emit('message',out);
    }catch(e){console.error('scheduled publish',e.message)}
  }
  const scheduler=setInterval(()=>{publishScheduled();publishScheduled();publishScheduled()},15000);scheduler.unref?.();

  app.get('/api/power/health',(_,res)=>res.json({ok:true,presence:true,notifications:true,blocks:true,reports:true,voiceReady:true,mentions:true,hashtags:true,comments:true,scheduled:true,readReceipts:true}));
};
