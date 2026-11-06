import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../client.js', import.meta.url),'utf8').replace('exports.__test = {','exports.__test = { FreePage, Roster, freePoolView,');
let bundle;
const react={ createElement:(type,props,...children)=>({type,props:props??{},children}),Fragment:'fragment',useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect(){},useMemo:fn=>fn(),useCallback:fn=>fn };
const window={__ModuleLoader__:{load:value=>{bundle=value}},addEventListener(){},removeEventListener(){},localStorage:{getItem:()=>null,setItem(){}}};
new Function('window',source)(window);
const seams=bundle.factory(()=>react).__test;
const {FreePage,Roster,freePoolView,DICT,CSS}=seams;
const t=key=>DICT.zh[key]; t.locale='zh-CN';
const main='our-free-model', region='our-free-model-region';
const catalog=[
  {id:'anonymous-unknown',availability:'unknown',route:null},
  {id:'anonymous-ok',availability:'available',route:main},
  {id:'kilo/listed',channel:'kilo',availability:'available',availabilitySource:'listing',route:main},
  {id:'kilo/measured',channel:'kilo',availability:'available',availabilitySource:'manual',route:main},
  {id:'kilo/hidden',channel:'kilo',availability:'available',availabilitySource:'manual',hiddenByUser:true,route:null},
  ...['eac','aggregate','combo','subscription'].map(channel=>({id:channel+'/other',channel,availability:'available',route:main})),
];
let checks=0;
const check=(name,run)=>{run();checks++;console.log('ok '+name)};
const data={catalog,settings:{enabled:true,exposeRegionModels:true}};
const pool=freePoolView(data);
check('the free pool merges only anonymous and Kilo, excluding EAC, aggregate, subscriptions and routes',()=>{assert.equal(pool.total,5);assert.equal(pool.anonymous,2);assert.equal(pool.kilo,3)});
check('the water level counts the models the picker publishes, ignoring user-hidden and unpublished models',()=>assert.equal(pool.selectable,3));
check('listed-only Kilo models stay unprobed; the five states are complete and do not inflate measured availability',()=>{assert.equal(pool.counts.available,3);assert.equal(pool.counts.unknown,2);assert.equal(Object.values(pool.counts).reduce((a,b)=>a+b,0),pool.total)});
check('pausing inference zeroes the water level but keeps the model catalog',()=>{const value=freePoolView({...data,settings:{enabled:false}});assert.equal(value.selectable,0);assert.equal(value.total,5)});
check('the region display setting and group hiding affect the selectable count',()=>{const value=freePoolView({catalog:[{id:'a',route:region},{id:'b',channel:'kilo',route:main,hiddenByGroup:true}],settings:{exposeRegionModels:false}});assert.equal(value.selectable,0);assert.equal(value.total,2)});
check('an empty pool and missing states produce no invalid statistics',()=>{assert.equal(freePoolView({catalog:[],settings:{}}).total,0);assert.equal(freePoolView({catalog:[{id:'a'}],settings:{}}).counts.unknown,1)});
const props={t,data,counts:pool.counts,summary:{reload(){}},stats:{status:'idle'},eacAuth:{},eacLogin:{},busy:false,apply(){},bench(){},benches:{},refresh(){},reprobe(){}};
const tree=FreePage(props);
const nodes=[];function visit(node){if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;nodes.push(node);visit(node.children)}
visit(tree);
check('the real page water level is 3/5, and the copy states the selectable share and its sources',()=>{const tank=nodes.find(node=>typeof node.type==='function'&&node.type.name==='Tank');assert.equal(tank.props.pct,60);assert.match(tank.props.label,/可选占比/);const text=JSON.stringify(tree,(key,value)=>typeof value==='function'?value.name:value);assert.match(text,/3\/5/);assert.match(text,/匿名免费 2 · Kilo 3/);assert.match(text,/不代表实测成功率/)});
check('the list and the pool use the same scope, and Kilo model cards are kept',()=>{const roster=Roster({summary:data,t,only:'free'});const models=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node||typeof node!=='object')return;if(node.props?.model)models.push(node.props.model.id);walk(node.children)}walk(roster);assert.equal(models.length,5);assert.ok(models.includes('kilo/listed'));assert.ok(!models.some(id=>id.startsWith('aggregate/')))});
check('the 9 throttled models in the screenshot are excluded; 26 models show 17 candidates and a 65% water level',()=>{
  const screenshotCatalog=[
    ...Array.from({length:9},(_,i)=>({id:'anonymous-'+i,availability:'throttled',route:main})),
    ...Array.from({length:17},(_,i)=>({id:'kilo/'+i,channel:'kilo',availability:i<6?'available':'unknown',availabilitySource:i<6?'manual':'listing',route:main})),
  ];
  const screenshotData={catalog:screenshotCatalog,settings:{enabled:true}};
  const view=freePoolView(screenshotData);
  assert.equal(view.total,26);assert.equal(view.selectable,17);assert.equal(view.counts.throttled,9);assert.equal(view.counts.available,6);assert.equal(view.counts.unknown,11);
  const rendered=FreePage({...props,data:screenshotData,counts:view.counts});
  const flat=[];function collect(n){if(Array.isArray(n))return n.forEach(collect);if(!n||typeof n!=='object')return;flat.push(n);collect(n.children)}collect(rendered);
  assert.equal(flat.find(n=>typeof n.type==='function'&&n.type.name==='Tank').props.pct,65);
  assert.match(JSON.stringify(rendered,(k,v)=>typeof v==='function'?v.name:v),/17\/26/);
});
check('throttled, explicitly unavailable and region-restricted models do not count toward the water level even while still in the picker',()=>{
  const view=freePoolView({catalog:['throttled','unavailable','region-blocked'].map((availability,i)=>({id:'blocked-'+i,availability,route:i===2?region:main})),settings:{exposeRegionModels:true}});
  assert.equal(view.total,3);assert.equal(view.selectable,0);
});
check('once throttling lifts, a model counts toward the water level again with its new state',()=>{
  const model={id:'kilo/recover',channel:'kilo',availabilitySource:'manual',availability:'throttled',route:main};
  assert.equal(freePoolView({catalog:[model],settings:{}}).selectable,0);
  assert.equal(freePoolView({catalog:[{...model,availability:'available'}],settings:{}}).selectable,1);
});
const empty=FreePage({...props,data:{catalog:[],settings:{}},counts:{}});const emptyNodes=[];function collect(node){if(Array.isArray(node))return node.forEach(collect);if(!node||typeof node!=='object')return;emptyNodes.push(node);collect(node.children)}collect(empty);
check('an empty pool does not fake a water level',()=>assert.equal(emptyNodes.find(node=>typeof node.type==='function'&&node.type.name==='Tank').props.pct,null));
console.log(checks+'/'+checks+' free pool checks passed');
