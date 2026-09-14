require('dotenv').config();
const http=require('http');
const PORT=Number(process.env.PORT||10000);
http.createServer((req,res)=>{
  res.writeHead(200,{'content-type':'application/json; charset=utf-8'});
  res.end(JSON.stringify({ok:true,service:'Lumo Bot Compatibility Worker',mode:'integrated',message:'Bot engine now runs inside Lumo server'}));
}).listen(PORT,'0.0.0.0',()=>console.log('Lumo bot worker compatibility mode :'+PORT));
