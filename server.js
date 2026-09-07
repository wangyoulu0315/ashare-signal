
import express from "express";
import webpush from "web-push";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

const PORT = process.env.PORT || 3000;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:you@example.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const DB = path.join(__dirname,"data.json");
let db = { subscriptions:[], watchlist:[] };
try { db = JSON.parse(fs.readFileSync(DB,"utf8")); } catch {}
function save(){ fs.writeFileSync(DB,JSON.stringify(db,null,2)); }

function prefix(code){
  if (/^(6|68|60|90)/.test(code)) return "sh";
  if (/^(0|2|3)/.test(code)) return "sz";
  if (/^(8|4|92)/.test(code)) return "bj";
  return "sz";
}
async function quote(code){
  const key = prefix(code)+code;
  const url = `https://qt.gtimg.cn/q=${key}&_=${Date.now()}`;
  const r = await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}});
  const t = await r.text();
  const m = t.match(/="([^"]*)"/);
  if(!m) throw new Error("quote parse failed");
  const f=m[1].split("~");
  const price=Number(f[3]), prev=Number(f[4]), name=f[1]||code;
  const high=Number(f[33]||0), low=Number(f[34]||0);
  return {name,code,price,prev,pct:prev?100*(price/prev-1):0,high,low,time:new Date().toISOString()};
}
async function history(code){
  const secid = prefix(code)==="sh" ? "1."+code : "0."+code;
  const u = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&lmt=40&end=20500101&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
  const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0"}});
  const j=await r.json();
  const rows=(j?.data?.klines||[]).map(x=>x.split(","));
  const closes=rows.map(r=>Number(r[2])).filter(Boolean);
  const vols=rows.map(r=>Number(r[5])).filter(Boolean);
  const avg=(arr,n)=>{const a=arr.slice(-n);return a.length?a.reduce((s,v)=>s+v,0)/a.length:0}
  function rsi(arr,p=14){
    if(arr.length<=p)return 50;
    let g=0,l=0;
    for(let i=arr.length-p;i<arr.length;i++){const d=arr[i]-arr[i-1]; if(d>0)g+=d; else l-=d;}
    if(l===0)return 80;
    const rs=(g/p)/(l/p); return 100-100/(1+rs);
  }
  return {
    ma5:avg(closes,5), ma10:avg(closes,10), ma20:avg(closes,20),
    rsi:rsi(closes), vr:vols.length>6 ? vols.at(-1)/(avg(vols.slice(0,-1),5)||1):1
  };
}
function analyze(x){
  let score=0,reasons=[];
  if(x.price>x.ma5){score++;reasons.push("站上MA5")} else {score--;reasons.push("跌破MA5")}
  if(x.ma5>x.ma10){score++;reasons.push("MA5>MA10")} else {score--;reasons.push("短均线偏弱")}
  if(x.price>x.ma20){score++;reasons.push("站上MA20")} else {score--;reasons.push("跌破MA20")}
  if(x.rsi>=50&&x.rsi<=72){score++;reasons.push("RSI偏强")}
  if(x.rsi>78){score-=2;reasons.push("RSI过热")}
  if(x.vr>=1.3){score++;reasons.push("量能放大")}
  if(x.pct>7){score--;reasons.push("涨幅偏大，避免追高")}
  let signal="观察";
  if(score>=4) signal="偏多";
  else if(score<=-2) signal="风险";
  else if(score>=1) signal="持有";
  return {score,signal,reasons};
}

app.get("/api/vapid-public",(req,res)=>res.json({key:VAPID_PUBLIC}));
app.get("/api/quote/:code", async(req,res)=>{
  try{
    const q=await quote(req.params.code); let h={};
    try{h=await history(req.params.code)}catch{}
    res.json({...q,...h,...analyze({...q,...h})});
  }catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/subscribe",(req,res)=>{
  if(!req.body?.endpoint) return res.status(400).json({error:"bad subscription"});
  if(!db.subscriptions.find(x=>x.endpoint===req.body.endpoint)) db.subscriptions.push(req.body);
  save(); res.json({ok:true});
});
app.post("/api/watchlist",(req,res)=>{
  db.watchlist = Array.isArray(req.body)?req.body:[];
  save(); res.json({ok:true});
});
app.get("/api/watchlist",(req,res)=>res.json(db.watchlist));

async function notifyAll(title,body,url="/"){
  if(!VAPID_PUBLIC||!VAPID_PRIVATE) return;
  const payload=JSON.stringify({title,body,url});
  const keep=[];
  for(const s of db.subscriptions){
    try{await webpush.sendNotification(s,payload);keep.push(s)}catch(e){
      if(![404,410].includes(e.statusCode)) keep.push(s);
    }
  }
  db.subscriptions=keep;save();
}

const lastSignals = new Map();
async function scan(){
  const d=new Date();
  const dow=d.getDay(), mins=d.getHours()*60+d.getMinutes();
  const trading=dow>=1&&dow<=5&&((mins>=570&&mins<=690)||(mins>=780&&mins<=900));
  if(!trading) return;
  for(const item of db.watchlist){
    if(!/^\d{6}$/.test(item.code||"")) continue;
    try{
      const q=await quote(item.code); const h=await history(item.code);
      const a=analyze({...q,...h});
      const k=item.code;
      const prev=lastSignals.get(k);
      if(prev && prev!==a.signal && ["偏多","风险"].includes(a.signal)){
        await notifyAll(`${q.name} ${a.signal}提醒`,
          `${q.price.toFixed(2)}元，${q.pct>=0?"+":""}${q.pct.toFixed(2)}%。${a.reasons.join("、")}`);
      }
      // 自定义价位提醒
      if(item.buyBelow && q.price<=Number(item.buyBelow)) {
        const flag=k+":buy"; if(!lastSignals.get(flag)){await notifyAll(`${q.name} 到达关注买点`,`现价 ${q.price.toFixed(2)} ≤ ${item.buyBelow}`);lastSignals.set(flag,true)}
      }
      if(item.sellAbove && q.price>=Number(item.sellAbove)) {
        const flag=k+":sell"; if(!lastSignals.get(flag)){await notifyAll(`${q.name} 到达止盈观察`,`现价 ${q.price.toFixed(2)} ≥ ${item.sellAbove}`);lastSignals.set(flag,true)}
      }
      if(item.stopBelow && q.price<=Number(item.stopBelow)) {
        const flag=k+":stop"; if(!lastSignals.get(flag)){await notifyAll(`${q.name} 风险位提醒`,`现价 ${q.price.toFixed(2)} ≤ ${item.stopBelow}`);lastSignals.set(flag,true)}
      }
      lastSignals.set(k,a.signal);
    }catch(e){}
  }
}
setInterval(scan,60000);

app.listen(PORT,()=>console.log(`A股盯盘助手已启动：http://localhost:${PORT}`));
