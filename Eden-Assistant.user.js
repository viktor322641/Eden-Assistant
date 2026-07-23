// ==UserScript==
// @name Eden Assistant
// @namespace eden-assistant
// @version 0.35
// @match https://login.eden1vision.com/*
// @match https://eden.dealfile.co.uk/*
// @grant none
// @run-at document-idle
// ==/UserScript==
(function(){'use strict';
const VERSION='0.35',ACTIVE_WIP='32668',ACTIVE_VEHICLE='RK73VTL',MAX_DESCRIPTION=96,MARKER='EDEN_ASSISTANT_PENDING:';
const PROFILE={inspection:{defaultColour:'green',colours:{'Tyre Pressure':'amber','Tyre Pressures':'amber','TPMS':'amber','Tyre Pressure Monitoring':'amber'},comments:{
'Brake Pads/Shoes - Front':'Current 10 mm; approx. 11% wear. Good condition.',
'Brake Discs/Drums - Front':'Current 25.0 mm; minimum 23.0 mm; approx. 0% wear.',
'Brake Pads/Shoes - Rear':'Current 8 mm; approx. 25% wear. Good condition.',
'Brake Discs/Drums - Rear':'Current 10.0 mm; minimum 8.0 mm; approx. 0% wear.',
'Washers':'Washer pump blocked. System stripped, pump cleaned and refitted. Working correctly.',
'Windscreen Washers':'Washer pump blocked. System stripped, pump cleaned and refitted. Working correctly.',
'Washer System':'Washer pump blocked. System stripped, pump cleaned and refitted. Working correctly.',
'Tyre Pressure':'TPMS warning illuminated. Check all tyre pressures and identify affected wheel.',
'Tyre Pressures':'TPMS warning illuminated. Check all tyre pressures and identify affected wheel.',
'TPMS':'TPMS warning illuminated. Check all tyre pressures and identify affected wheel.',
'Tyre Pressure Monitoring':'TPMS warning illuminated. Check all tyre pressures and identify affected wheel.'}},
tyres:{
fl:{outer:5,mid:5,inner:5,make:'KUMHO',size:'215/55 R18',notes:'',status:'Green'},
fr:{outer:6,mid:6,inner:6,make:'KUMHO',size:'215/55 R18',notes:'',status:'Green'},
rl:{outer:5,mid:5,inner:5,make:'KUMHO',size:'215/55 R18',notes:'',status:'Green'},
rr:{outer:5,mid:5,inner:5,make:'KUMHO',size:'215/55 R18',notes:'',status:'Green'}}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function visible(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0}
async function waitFor(find,timeout=20000){const st=Date.now();while(Date.now()-st<timeout){const el=find();if(el)return el;await sleep(350)}return null}
function status(t,e=false){console.log('[Eden Assistant]',t);const el=document.getElementById('edenAssistantStatus');if(el){el.textContent=t;el.style.background=e?'#b71c1c':'#263238'}}
function setValue(el,v){const t=String(v??'');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(el,t);else el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));if(window.jQuery)window.jQuery(el).val(t).trigger('input').trigger('change')}
function commit(el){if(window.jQuery)window.jQuery(el).trigger('change').trigger('blur');else{el.dispatchEvent(new Event('change',{bubbles:true}));el.blur()}}
function click(el){if(!el)return;if(window.jQuery)window.jQuery(el).trigger('click');else el.click()}
function writeMarker(){window.name=MARKER+ACTIVE_WIP}function readMarker(){return String(window.name||'').startsWith(MARKER)?String(window.name).slice(MARKER.length):''}function clearMarker(){if(String(window.name||'').startsWith(MARKER))window.name=''}
async function openEdenVue(){const tile=await waitFor(()=>Array.from(document.querySelectorAll('a')).find(a=>{const t=String(a.textContent||'').replace(/\s+/g,' ').trim().toLowerCase(),h=String(a.getAttribute('href')||'').toLowerCase();return visible(a)&&(t.includes('eden 1 vue')||h.includes('dealcrm_codeweavers/main.asp'))}),12000);if(!tile)throw new Error('Eden 1 Vue tile not found');writeMarker();tile.target='_self';status(`Opening Eden 1 Vue • WIP ${ACTIVE_WIP}...`);click(tile)}
async function openTab(id,paneId,href){const tab=await waitFor(()=>{const el=document.getElementById(id)||document.querySelector(`a[href="${href}"]`);return visible(el)?el:null});if(!tab)throw new Error(`${paneId} tab not found`);if(window.jQuery&&typeof window.jQuery(tab).tab==='function')window.jQuery(tab).tab('show');else click(tab);const pane=await waitFor(()=>visible(document.getElementById(paneId))?document.getElementById(paneId):null,10000);if(!pane)throw new Error(`${paneId} did not open`);await sleep(600)}
async function fillInspection(){const rows=Array.from(document.querySelectorAll('#vhcinspection .servline_vhc[job]'));if(!rows.length)throw new Error('Inspection rows not found');const sel={green:'.vhcbtn.btn-success, .vhcbtn[class*="_green"]',amber:'.vhcbtn.btn-warning, .vhcbtn[class*="_amber"]',red:'.vhcbtn.btn-danger, .vhcbtn[class*="_red"]'};for(let i=0;i<rows.length;i++){const row=rows[i],item=String(row.getAttribute('job')||'').trim(),colour=PROFILE.inspection.colours[item]||PROFILE.inspection.defaultColour;status(`Inspection ${i+1}/${rows.length}: ${item}`);click(row.querySelector(sel[colour]));await sleep(300);const input=row.querySelector('input.vhcjobdesc, input[id^="vhcjobdesc_"]');if(input){input.maxLength=MAX_DESCRIPTION;setValue(input,String(PROFILE.inspection.comments[item]||'').slice(0,MAX_DESCRIPTION));commit(input);await sleep(300)}}}
async function fillTyre(side,d){for(const f of ['outer','mid','inner','make','size','notes']){const el=document.getElementById(`x_${side}_${f}`);if(!el)continue;setValue(el,d[f]);commit(el);await sleep(450)}const h=document.getElementById(`x_${side}_statusid`);if(h){setValue(h,d.status);commit(h)}}
async function fillTyres(){await openTab('vhctab_tyres','vhctyres','#vhctyres');for(const s of ['fl','fr','rl','rr']){status(`Tyres: ${s.toUpperCase()}`);await fillTyre(s,PROFILE.tyres[s])}}
async function runDealfile(){const input=await waitFor(()=>{const el=document.getElementById('x_searchwip');return visible(el)?el:null},30000);if(!input)throw new Error('WIP field not found');setValue(input,ACTIVE_WIP);await sleep(500);const search=await waitFor(()=>{const el=document.getElementById('mainsearchbuts_serv');return visible(el)?el:null},12000);if(!search)throw new Error('Search control not found');status(`Searching WIP ${ACTIVE_WIP}...`);click(search);await openTab('vhctab_inpection','vhcinspection','#vhcinspection');await fillInspection();await fillTyres();clearMarker();status(`WIP ${ACTIVE_WIP}: filled — CHECK BEFORE SAVE`)}
async function run(){const b=document.getElementById('edenAssistantButton');if(b){b.disabled=true;b.textContent='WORKING...'}try{if(location.hostname==='login.eden1vision.com')await openEdenVue();else if(location.hostname==='eden.dealfile.co.uk'){writeMarker();await runDealfile()}}catch(e){status(`Error: ${e.message||e}`,true)}finally{if(b){b.disabled=false;b.textContent='START'}}}
function panel(){if(document.getElementById('edenAssistantPanel')||!document.body)return;const box=document.createElement('div');box.id='edenAssistantPanel';Object.assign(box.style,{position:'fixed',right:'10px',bottom:'85px',zIndex:'2147483647',display:'flex',flexDirection:'column',gap:'8px',width:'220px'});const s=document.createElement('div');s.id='edenAssistantStatus';s.textContent=`Eden Assistant v${VERSION}`;Object.assign(s.style,{padding:'9px 12px',borderRadius:'9px',background:'#263238',color:'#fff',fontSize:'13px',textAlign:'center'});const info=document.createElement('div');info.textContent=`WIP ${ACTIVE_WIP} • ${ACTIVE_VEHICLE}`;Object.assign(info.style,{padding:'12px',border:'2px solid #1565c0',borderRadius:'10px',background:'#fff',color:'#111',fontSize:'17px',fontWeight:'bold',textAlign:'center'});const b=document.createElement('button');b.id='edenAssistantButton';b.textContent='START';Object.assign(b.style,{padding:'14px 17px',border:'2px solid white',borderRadius:'12px',background:'#1565c0',color:'#fff',fontSize:'16px',fontWeight:'bold'});b.addEventListener('click',run);box.append(s,info,b);document.body.appendChild(box)}
panel();new MutationObserver(panel).observe(document.documentElement,{childList:true,subtree:true});if(location.hostname==='eden.dealfile.co.uk'&&readMarker()===ACTIVE_WIP)setTimeout(runDealfile,1800);
})();