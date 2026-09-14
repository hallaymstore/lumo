const mongoose=require('mongoose');

module.exports=function mountChatAdmin({app,io,auth}){
  const O=mongoose.Schema.Types.ObjectId;
  const User=mongoose.model('User'),Chat=mongoose.model('Chat'),Msg=mongoose.model('Msg');
  const ChatState=mongoose.models.LumoChatState||mongoose.model('LumoChatState',new mongoose.Schema({chat:{type:O,ref:'Chat',required:true,unique:true,index:true},pinned:[{type:O,ref:'Msg'}]},{timestamps:true}));
  const ReadState=mongoose.models.LumoReadState||mongoose.model('LumoReadState',new mongoose.Schema({chat:{type:O,ref:'Chat',required:true,index:true},user:{type:O,ref:'User',required:true,index:true},lastReadAt:{type:Date,default:Date.now}},{timestamps:true}));
  ReadState.schema.index({chat:1,user:1},{unique:true});
  const member=(c,id)=>c&&c.members.some(m=>String(m.user?._id||m.user)===String(id));
  const role=(c,id)=>c?.members.find(m=>String(m.user?._id||m.user)===String(id))?.role||'';
  const admin=(c,id)=>['owner','admin'].includes(role(c,id));
  const clean=u=>u?{id:String(u._id),name:u.name,username:u.username,avatar:u.avatar||'',role:u.role}:null;

  app.patch('/api/chats/:id/manage',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(404).json({error:'Chat topilmadi'});if(!admin(c,req.user._id))return res.status(403).json({error:'Faqat admin boshqaradi'});if(c.type==='dm')return res.status(400).json({error:'Shaxsiy chat boshqarilmaydi'});
    if(req.body.title!==undefined)c.title=String(req.body.title||'').trim().slice(0,120)||c.title;if(req.body.description!==undefined)c.description=String(req.body.description||'').trim().slice(0,1000);if(req.body.public!==undefined)c.public=!!req.body.public;await c.save();io.to('c:'+c._id).emit('chat:updated',{id:String(c._id),title:c.title,description:c.description,public:c.public});res.json({ok:true,chat:{id:String(c._id),title:c.title,description:c.description,public:c.public}})
  });
  app.post('/api/chats/:id/members',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||c.type==='dm')return res.status(404).json({error:'Chat topilmadi'});if(!admin(c,req.user._id))return res.status(403).json({error:'Faqat admin a’zo qo‘shadi'});const u=await User.findById(req.body.userId);if(!u)return res.status(404).json({error:'User topilmadi'});if(!member(c,u._id)){c.members.push({user:u._id,role:'member'});await c.save()}io.to('c:'+c._id).emit('members:updated',{chatId:String(c._id)});res.json({ok:true,user:clean(u)})
  });
  app.patch('/api/chats/:id/members/:uid',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||c.type==='dm')return res.status(404).json({error:'Chat topilmadi'});if(role(c,req.user._id)!=='owner')return res.status(403).json({error:'Faqat owner rolni o‘zgartiradi'});if(String(c.owner)===String(req.params.uid))return res.status(400).json({error:'Owner rolini o‘zgartirib bo‘lmaydi'});const m=c.members.find(x=>String(x.user)===String(req.params.uid));if(!m)return res.status(404).json({error:'A’zo topilmadi'});m.role=req.body.role==='admin'?'admin':'member';await c.save();io.to('c:'+c._id).emit('members:updated',{chatId:String(c._id)});res.json({ok:true,role:m.role})
  });
  app.delete('/api/chats/:id/members/:uid',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||c.type==='dm')return res.status(404).json({error:'Chat topilmadi'});if(!admin(c,req.user._id))return res.status(403).json({error:'Faqat admin a’zoni chiqaradi'});if(String(c.owner)===String(req.params.uid))return res.status(400).json({error:'Ownerni chiqarib bo‘lmaydi'});c.members=c.members.filter(x=>String(x.user)!==String(req.params.uid));await c.save();io.to('c:'+c._id).emit('members:updated',{chatId:String(c._id)});res.json({ok:true})
  });
  app.post('/api/chats/:id/leave',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(404).json({error:'Chat topilmadi'});if(String(c.owner)===String(req.user._id))return res.status(400).json({error:'Owner avval kanal/guruhni boshqa egaga topshirishi kerak'});c.members=c.members.filter(x=>String(x.user)!==String(req.user._id));await c.save();res.json({ok:true})
  });
  app.get('/api/chats/:id/pins',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});const s=await ChatState.findOne({chat:c._id}).populate({path:'pinned',populate:{path:'sender',select:'name username avatar'}});res.json({messages:(s?.pinned||[]).map(m=>({id:String(m._id),text:m.text,file:m.file,createdAt:m.createdAt,sender:clean(m.sender)}))})
  });
  app.post('/api/chats/:id/pins/:mid',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});if(!admin(c,req.user._id))return res.status(403).json({error:'Faqat admin pin qiladi'});const m=await Msg.findOne({_id:req.params.mid,chat:c._id});if(!m)return res.status(404).json({error:'Xabar topilmadi'});let s=await ChatState.findOne({chat:c._id});if(!s)s=await ChatState.create({chat:c._id,pinned:[]});if(!s.pinned.some(x=>String(x)===String(m._id))){s.pinned.unshift(m._id);s.pinned=s.pinned.slice(0,10);await s.save()}io.to('c:'+c._id).emit('pins:updated',{chatId:String(c._id)});res.json({ok:true})
  });
  app.delete('/api/chats/:id/pins/:mid',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!admin(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});await ChatState.updateOne({chat:c._id},{$pull:{pinned:req.params.mid}});io.to('c:'+c._id).emit('pins:updated',{chatId:String(c._id)});res.json({ok:true})
  });
  app.post('/api/chats/:id/read',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});await ReadState.findOneAndUpdate({chat:c._id,user:req.user._id},{$set:{lastReadAt:new Date()}},{upsert:true,new:true,setDefaultsOnInsert:true});res.json({ok:true})
  });
  app.get('/api/unread',auth,async(req,res)=>{
    const chats=await Chat.find({'members.user':req.user._id}).select('_id');const states=await ReadState.find({user:req.user._id,chat:{$in:chats.map(c=>c._id)}});const sm=new Map(states.map(s=>[String(s.chat),s.lastReadAt]));const unread={};let total=0;for(const c of chats){const at=sm.get(String(c._id))||new Date(0),n=await Msg.countDocuments({chat:c._id,createdAt:{$gt:at},sender:{$ne:req.user._id}});if(n){unread[String(c._id)]=n;total+=n}}res.json({total,unread})
  });
  app.get('/api/chat-admin/health',(_,res)=>res.json({ok:true,management:true,pins:true,unread:true}));
};
