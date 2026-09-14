module.exports=function mountPowerSocket({io}){
  io.on('connection',socket=>{
    if(socket.user?._id)socket.join('u:'+socket.user._id);
  });
};
