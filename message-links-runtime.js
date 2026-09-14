const mongoose=require('mongoose');
module.exports=function mountMessageLinks({app,io,auth}){
  const O=mongoose.Schema.Types.ObjectId;
  const Chat=mongoose.model('Chat'),Msg=mongoose.model('Msg');
  const Link=mongoose.models.LumoMessageLink||mongoose.model('LumoMessageLink',new mongoose.Schema({message:{type:O,ref:'Msg',required:true,unique:true,index:true},replyTo:{type:O,ref:'Msg',default:null},forwardedFrom:{type:O,ref:'Msg',default:null}},{timestamps:true}));
  const member=(c,id)=>c&&c.members.some(m=>String(m.user?._id||m.user)===String(id));
  const role=(c,id)=>c?.members.find(m=>String(m.user?._id||m.user)===String(id))?.role||'';
  const canPost=(c,id)=>c.type!=='channel'||['owner','admin'].includes(role(c,id));
  const cleanUser=u=>u?{id:String(u._id),name:u.name,username:u.username,avatar:u.avatar||'',role:u.role}:null;
  const out=m=>({id:String(m._id),chat:String(m.chat),sender:cleanUser(m.sender),text:m.text,file:m.file||null,reactions:m.reactions||[],createdAt:m.createdAt});

  app.get('/api/chats/:id/links',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});
    const ids=String(req.query.ids||'').split(',').filter(mongoose.isValidObjectId).slice(0,100),links=await Link.find({message:{$in:ids}}).populate({path:'replyTo',populate:{path:'sender',select:'name username avatar role'}}).populate({path:'forwardedFrom',populate:{path:'sender',select:'name username avatar role'}});
    const map={};for(const x of links){const r=x.replyTo,f=x.forwardedFrom;map[String(x.message)]={replyTo:r?{id:String(r._id),text:r.text,file:r.file,sender:cleanUser(r.sender)}:null,forwardedFrom:f?{id:String(f._id),text:f.text,file:f.file,sender:cleanUser(f.sender)}:null}}res.json({links:map})
  });

  app.post('/api/chats/:id/reply/:mid',auth,async(req,res)=>{
    const c=await Chat.findById(req.params.id);if(!c||!member(c,req.user._id))return res.status(403).json({error:'Ruxsat yo‘q'});if(!canPost(c,req.user._id))return res.status(403).json({error:'Kanalga faqat admin yozadi'});const target=await Msg.findOne({_id:req.params.mid,chat:c._id});if(!target)return res.status(404).json({error:'Asl xabar topilmadi'});const text=String(req.body.text||'').trim().slice(0,10000);if(!text)return res.status(400).json({error:'Javob bo‘sh'});let m=await Msg.create({chat:c._id,sender:req.user._id,text});await Link.create({message:m._id,replyTo:target._id});c.lastMessage=m._id;c.updatedAt=new Date();await c.save();m=await Msg.findById(m._id).populate('sender','name username avatar role');const d=out(m);d.link={replyTo:{id:String(target._id),text:target.text,file:target.file}};io.to('c:'+c._id).emit('message',d);res.json({message:d})
  });

  app.post('/api/messages/:mid/forward',auth,async(req,res)=>{
    const src=await Msg.findById(req.params.mid);if(!src)return res.status(404).json({error:'Xabar topilmadi'});const sourceChat=await Chat.findById(src.chat);if(!sourceChat||!member(sourceChat,req.user._id))return res.status(403).json({error:'Asl chatga ruxsat yo‘q'});const target=await Chat.findById(req.body.chatId);if(!target||!member(target,req.user._id))return res.status(403).json({error:'Target chatga ruxsat yo‘q'});if(!canPost(target,req.user._id))return res.status(403).json({error:'Bu kanalga yozish mumkin emas'});let m=await Msg.create({chat:target._id,sender:req.user._id,text:src.text,file:src.file?.url?src.file:undefined});await Link.create({message:m._id,forwardedFrom:src._id});target.lastMessage=m._id;target.updatedAt=new Date();await target.save();m=await Msg.findById(m._id).populate('sender','name username avatar role');const d=out(m);d.link={forwardedFrom:{id:String(src._id),text:src.text,file:src.file}};io.to('c:'+target._id).emit('message',d);res.json({message:d})
  });
};
