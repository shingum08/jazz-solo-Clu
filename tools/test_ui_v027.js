'use strict';
const {JSDOM,VirtualConsole}=require('jsdom'),fs=require('fs'),assert=require('assert');
const html=fs.readFileSync(require('path').resolve(__dirname,'../index.html'),'utf8');
const errors=[],v=new VirtualConsole();v.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:v,beforeParse(w){
 w.matchMedia=()=>({matches:false,addListener(){},addEventListener(){}});
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=function(){};
 if(w.SVGElement){w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:100,height:20});w.SVGElement.prototype.getComputedTextLength=()=>100;}
 w.alert=s=>errors.push(String(s));w.confirm=()=>false;
 }});
setTimeout(()=>{
 try{
 const w=dom.window,d=w.document;
 assert(!errors.length,errors.join('\n'));
 d.querySelector('#topicSel').value='gt';d.querySelector('#topicSel').dispatchEvent(new w.Event('change',{bubbles:true}));
 w.eval("cur.view='drill';gen(false)");
 assert(d.querySelector('#drillSheet svg'),'guide rendered SVG');
 assert(!errors.length,errors.join('\n'));
 const xml=w.eval('buildMusicXml()');assert(xml&&xml.includes('<score-partwise'));
 const doc=new w.DOMParser().parseFromString(xml,'application/xml');assert(!doc.querySelector('parsererror'));
 console.log(JSON.stringify({test:'DOM integration (jsdom, not real browser)',guideSvg:true,xml:true,errors}));
 dom.window.close();
 }catch(e){console.error(e);dom.window.close();process.exitCode=1;}
},2000);
