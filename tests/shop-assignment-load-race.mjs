import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../pages/Shop/repair-order-details.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('    async function loadTechnicianOptions()'),source.indexOf('    function getNumberValue'));
for(const edit of [true,false]){
 let resolve;const pending=new Promise(r=>resolve=r);
 // A select may still show its default until the historical option is added.
 const primary={value:'Unassigned'},additional={value:''};
 const sandbox={technicianSelect:primary,additionalTechnicianSelect:additional,repairOrder:{technician:'original-tech',additionalTechnician:'original-helper'},addTechnicianOption:()=>{},console,window:{trackRightAuthReady:Promise.resolve(),trackRightSupabase:{rpc:()=>pending}}};
 vm.createContext(sandbox);const running=vm.runInContext(fn+';loadTechnicianOptions()',sandbox);
 await Promise.resolve();if(edit){primary.value='Unassigned';additional.value='new-helper';}
 resolve({data:[{email:'new-tech'}],error:null});await running;
 assert.equal(primary.value,edit?'Unassigned':'original-tech');assert.equal(additional.value,edit?'new-helper':'original-helper');
}
console.log('PASS — delayed technician directory preserves changed and unchanged assignment selections');
