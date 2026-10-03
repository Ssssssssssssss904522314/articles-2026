import express from "express";
import crypto from "node:crypto";
const app=express();
app.use(express.json());
app.use(express.static("."));
const PORT=process.env.PORT||3000;
const BOT_TOKEN=process.env.TELEGRAM_BOT_TOKEN||"";
const BOT_USERNAME=process.env.TELEGRAM_BOT_USERNAME||"";
const sessions=new Map();
const users=new Map();

app.post("/api/auth/start",(req,res)=>{
  if(!BOT_TOKEN||!BOT_USERNAME) return res.status(500).json({error:"Telegram bot is not configured on the server."});
  const token=crypto.randomBytes(18).toString("hex");
  sessions.set(token,{created:Date.now(),chatId:null,code:null,verified:false});
  res.json({token,botUrl:"https://t.me/"+BOT_USERNAME+"?start="+token});
});

app.post("/api/auth/verify",(req,res)=>{
  const {token,name,nickname,code}=req.body||{};
  const s=sessions.get(token);
  if(!s||Date.now()-s.created>10*60*1000) return res.status(400).json({error:"Сессия регистрации истекла. Начни заново."});
  if(!s.verified||String(code)!==String(s.code)) return res.status(400).json({error:"Неверный код из Telegram."});
  const cleanNick=String(nickname||"").trim().replace(/^@/,"");
  if(!/^[A-Za-z0-9_]{3,24}$/.test(cleanNick)) return res.status(400).json({error:"Псевдоним: 3–24 символа, только латиница, цифры и _."});
  if([...users.values()].some(u=>u.nickname.toLowerCase()===cleanNick.toLowerCase())) return res.status(400).json({error:"Этот псевдоним уже занят."});
  const user={id:crypto.randomUUID(),name:String(name).trim(),nickname:cleanNick,telegramChatId:s.chatId,createdAt:new Date().toISOString()};
  users.set(user.id,user);
  sessions.delete(token);
  res.json({ok:true,user:{id:user.id,name:user.name,nickname:"@"+user.nickname}});
});

app.post("/api/telegram/webhook",(req,res)=>{
  const msg=req.body?.message;
  if(!msg?.chat?.id) return res.sendStatus(200);
  const text=String(msg.text||"");
  if(!text.startsWith("/start")) return res.sendStatus(200);
  const token=text.split(" ")[1];
  const s=sessions.get(token);
  if(!s) return res.sendStatus(200);
  const code=String(crypto.randomInt(100000,1000000));
  s.chatId=msg.chat.id;s.code=code;s.verified=true;
  fetch("https://api.telegram.org/bot"+BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:msg.chat.id,text:"Ваш код регистрации ARTICLES: "+code+"\nНикому его не сообщайте."})}).catch(()=>{});
  res.sendStatus(200);
});

app.get("/health",(req,res)=>res.json({ok:true}));
app.listen(PORT,()=>console.log("ARTICLES server listening on "+PORT));