"use strict";(self.webpackChunkmedusa_starter_default=self.webpackChunkmedusa_starter_default||[]).push([[214],{65622:(e,t,r)=>{r.r(t),r.d(t,{remoteMiddlewares:()=>c});var n=r(32718),a=r(5990),s=r(26736),i=r(52478);function c(e,t,r){var c;return(0,n.mG)(this,void 0,void 0,function(){var u,l=this;return(0,n.Jh)(this,function(o){switch(o.label){case 0:if((0,a.s)())return[2,[]];return u=(0,i.Kg)(),[4,Promise.all(Object.entries(null!==(c=t.enabledMiddleware)&&void 0!==c?c:{}).filter(function(e){return e[0],e[1]}).map(function(e){return e[0]}).map(function(t){return(0,n.mG)(l,void 0,void 0,function(){var a,i,c,l;return(0,n.Jh)(this,function(n){switch(n.label){case 0:i=a=t.replace("@segment/",""),r&&(i=btoa(a).replace(/=/g,"")),c="".concat(u,"/middleware/").concat(i,"/latest/").concat(i,".js.gz"),n.label=1;case 1:return n.trys.push([1,3,,4]),[4,(0,s.v)(c)];case 2:return n.sent(),[2,window["".concat(a,"Middleware")]];case 3:return l=n.sent(),e.log("error",l),e.stats.increment("failed_remote_middleware"),[3,4];case 4:return[2]}})})}))];case 1:return[2,o.sent().filter(Boolean)]}})})}}}]);