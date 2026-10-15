import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('    function shopPageName('),source.indexOf('    function addShopSettingsMenu('));
for(const suffix of ['.html','','/']) {
 for(const name of ['technician-dashboard','repair-orders','repair-order-details']) {
  const redirects=[],path=`/pages/Shop/${name}${suffix}`;
  const scope={URL,window:{location:{pathname:path,href:'https://qa.test'+path,replace:p=>redirects.push(p)},trackRightCan:()=>false},document:{querySelectorAll:()=>[]},loginPath:'../../login.html'};
  vm.createContext(scope);vm.runInContext(functions,scope);
  assert.equal(scope.applyShopPageAccess({role:'technician'}),true);assert.deepEqual(redirects,[]);
 }
 for(const name of ['invoices','invoice-details','shop-settings','accounts-payable','net-accounts']) {
  const redirects=[],path=`/pages/Shop/${name}${suffix}`;
  const scope={URL,window:{location:{pathname:path,href:'https://qa.test'+path,replace:p=>redirects.push(p)},trackRightCan:()=>false},document:{querySelectorAll:()=>[]},loginPath:'../../login.html'};
  vm.createContext(scope);vm.runInContext(functions,scope);
  assert.equal(scope.applyShopPageAccess({role:'technician'}),false);assert.equal(redirects.length,1);assert.match(redirects[0],/technician-dashboard.html$/);
  if(['shop-settings','accounts-payable'].includes(name)){redirects.length=0;assert.equal(scope.applyShopPageAccess({role:'service_writer'}),false);assert.equal(redirects.length,1);}
 }
}
console.log('Shop page access: HTML/extensionless/trailing-slash tech routes load without self-redirect; restricted invoice/settings/AP routes remain denied.');
