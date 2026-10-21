import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Shop/invoice-details.js',import.meta.url),'utf8');
const find=source.slice(source.indexOf('function findCurrentInvoice()'),source.indexOf('/* =========================\n   RENDER INVOICE'));
const init=source.slice(source.indexOf('async function initializeInvoiceDetails()'),source.lastIndexOf('initializeInvoiceDetails();'));
const invoice={id:'1012',recordId:'uuid-invoice',legacyLocalId:'legacy-invoice',status:'Sent',balanceDue:67.90};
for(const id of ['1012','uuid-invoice','legacy-invoice','foreign-invoice']) {
 const ctx={window:{trackRightInvoices:{migrateBrowserInvoices:async()=>{},list:async()=>[invoice]},trackRightAuthReady:Promise.resolve({role:'owner'}),location:{search:''}},URLSearchParams,console,identifier:id};
 vm.createContext(ctx);vm.runInContext('let invoiceId=identifier; let currentInvoice=null; const invoices=[]; function getInvoices(){return invoices;} function setInvoiceVisible(){} function renderInvoice(){findCurrentInvoice();}'+find+init,ctx);
 await vm.runInContext('initializeInvoiceDetails()',ctx);
 assert.equal(vm.runInContext('currentInvoice?.recordId || null',ctx),id==='foreign-invoice'?null:invoice.recordId);
 assert.equal(vm.runInContext('invoiceId',ctx),id==='foreign-invoice'?id:'1012');
}
console.log('Invoice alert links: shop-scoped UUID, number and legacy identifiers resolve to actionable canonical invoice; missing/foreign IDs remain unavailable.');
