
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>self.clients.claim());
self.addEventListener("push",e=>{
  let d={title:"A股盯盘提醒",body:"出现新的交易信号",url:"/"};
  try{d={...d,...e.data.json()}}catch{}
  e.waitUntil(self.registration.showNotification(d.title,{body:d.body,tag:"stock-signal",data:{url:d.url}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{
    if(ws.length){ws[0].focus();return ws[0].navigate(e.notification.data?.url||"/")}
    return clients.openWindow(e.notification.data?.url||"/");
  }));
});
