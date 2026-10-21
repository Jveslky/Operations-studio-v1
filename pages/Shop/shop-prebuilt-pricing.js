(function(){
'use strict';
const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
function number(value,name,precision=2){const n=Number(value);if(value===''||value==null||!Number.isFinite(n)||n<0||n>9999999||Math.abs(n*10**precision-Math.round(n*10**precision))>.00001)throw Error(`Invalid ${name}.`);return n;}
function validate(input){
 const d=structuredClone(input);
 if(!d||!['flat','itemized','mixed'].includes(d.mode)||typeof d.name!=='string'||!d.name.trim()||d.name.length>150)throw Error('Name and pricing mode are required.');
 d.name=d.name.trim();d.base_price=number(d.base_price,'package price');d.labor_hours=number(d.labor_hours,'labor hours',3);
 if(!['included','hours'].includes(d.labor_pricing))throw Error('Choose labor pricing.');
 if(!Array.isArray(d.lines)||d.lines.length>50)throw Error('Use at most 50 parts.');
 d.lines=d.lines.map(l=>{
  if(!l.description?.trim()||l.description.length>500||!['included','difference','itemized'].includes(l.pricing))throw Error('Describe each part and choose its pricing.');
  const r={...l};for(const k of ['unit_price','allowance','extra_price'])r[k]=number(l[k],k);for(const k of ['quantity','included_quantity'])r[k]=number(l[k],k,3);
  if(!r.quantity)throw Error('Part quantity must be positive.');return r;
 });return d;
}
function quote(input,rate){
 const d=validate(input);rate=number(rate,'shop labor rate');
 const laborHours=d.mode==='itemized'||(d.mode==='mixed'&&d.labor_pricing==='hours')?d.labor_hours:0;
 const packagePrice=d.mode==='itemized'?0:d.base_price;
 const lines=d.lines.map(l=>{
  const included=Math.min(l.quantity,l.included_quantity),extra=Math.max(0,l.quantity-l.included_quantity);
  const price=d.mode==='itemized'||(d.mode==='mixed'&&l.pricing==='itemized')?l.quantity*l.unit_price:
   extra*l.extra_price+(l.pricing==='difference'?included*Math.max(0,l.unit_price-l.allowance):0);
  return {...l,charge:cents(price)};
 });
 const parts=cents(lines.reduce((s,l)=>s+l.charge,0));
 if(packagePrice+laborHours*rate+parts>9999999)throw Error('Job price is too large.');
 return {definition:d,packagePrice,laborHours,labor:cents(laborHours*rate),parts,lines,total:cents(packagePrice+laborHours*rate+parts)};
}
window.shopPrebuiltPricing={validate,quote};
})();
