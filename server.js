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

app.get("/register",(req,res)=>{
  if(!BOT_USERNAME) return res.status(500).send("Telegram bot is not configured.");
  const token=crypto.randomBytes(18).toString("hex");
  sessions.set(token,{created:Date.now(),chatId:null,code:null,verified:false});
  const html=`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Регистрация — ARTICLES</title><style>body{margin:0;background:#08090d;color:#fff;font-family:system-ui;min-height:100vh;display:grid;place-items:center;padding:20px}.box{width:min(460px,100%);padding:30px;border:1px solid #ffffff14;border-radius:28px;background:#ffffff0b}.field{margin:16px 0}.field label{display:block;color:#aeb5c7;font-size:13px;margin-bottom:7px}.field input{width:100%;padding:13px;border-radius:13px;border:1px solid #ffffff16;background:#ffffff08;color:#fff;box-sizing:border-box}.btn{display:inline-block;border:0;border-radius:14px;padding:12px 18px;font-weight:700;color:#fff;background:#6475ff;cursor:pointer;text-decoration:none}.status{margin:14px 0;color:#9ba6ff}</style></head><body><main class="box"><h1>Регистрация</h1><p>1. Открой Telegram-бота и нажми START. 2. Бот пришлёт одноразовый код. 3. Введи его здесь.</p><a class="btn" href="https://t.me/${BOT_USERNAME}?start=${token}" target="_blank">Открыть Telegram-бота</a><form method="POST" action="/register/finish"><input type="hidden" name="token" value="${token}"><div class="field"><label>Имя</label><input name="name" maxlength="50" required></div><div class="field"><label>Псевдоним</label><input name="nickname" maxlength="24" placeholder="@psevdonim" required></div><div class="field"><label>Код из Telegram</label><input name="code" maxlength="6" inputmode="numeric" required></div><button class="btn" type="submit">Зарегистрироваться</button></form></main></body></html>`;
  res.send(html);
});
app.use(express.urlencoded({extended:false}));
app.post("/register/finish",(req,res)=>{
  const {token,name,nickname,code}=req.body||{}; const s=sessions.get(token);
  if(!s||Date.now()-s.created>10*60*1000) return res.status(400).send("Сессия регистрации истекла. Вернись назад и начни заново.");
  if(!s.verified||String(code)!==String(s.code)) return res.status(400).send("Неверный код из Telegram. Вернись назад.");
  const cleanNick=String(nickname||"").trim().replace(/^@/,"");
  if(!/^[A-Za-z0-9_]{3,24}$/.test(cleanNick)) return res.status(400).send("Неверный псевдоним.");
  if([...users.values()].some(u=>u.nickname.toLowerCase()===cleanNick.toLowerCase())) return res.status(400).send("Этот псевдоним уже занят.");
  const cleanName=String(name||"").trim();
  if(!cleanName) return res.status(400).send("Введите имя.");
  const user={id:crypto.randomUUID(),name:cleanName,nickname:cleanNick,telegramChatId:s.chatId,createdAt:new Date().toISOString()};
  users.set(user.id,user); sessions.delete(token);
  res.send(`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Готово — ARTICLES</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#1b2040 0,#08090d 48%,#05060a 100%);color:#fff;font-family:Inter,system-ui,-apple-system,sans-serif}.card{width:min(520px,100%);padding:42px 34px;text-align:center;border:1px solid #ffffff18;border-radius:30px;background:#ffffff0b;backdrop-filter:blur(20px);box-shadow:0 25px 80px #0008}.icon{width:72px;height:72px;margin:0 auto 20px;border-radius:22px;display:grid;place-items:center;background:#6475ff;color:#fff;font-size:34px;font-weight:900}.muted{color:#aeb5c7}.nick{font-size:24px;font-weight:800;margin:12px 0 28px}.btn{display:inline-block;padding:13px 20px;border-radius:14px;background:#6475ff;color:#fff;text-decoration:none;font-weight:800}</style></head><body><main class="card"><div class="icon">✓</div><h1>Регистрация завершена</h1><p class="muted">Добро пожаловать в ARTICLES 2026</p><div class="nick">@${user.nickname}</div><a class="btn" href="/">Перейти на главную</a></main></body></html>`);
});

app.listen(PORT,async()=>{console.log("ARTICLES server listening on "+PORT);if(BOT_TOKEN&&process.env.PUBLIC_URL){try{await fetch("https://api.telegram.org/bot"+BOT_TOKEN+"/setWebhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:process.env.PUBLIC_URL+"/api/telegram/webhook"})});console.log("Telegram webhook configured");}catch(e){console.error("Webhook setup failed",e.message)}}});