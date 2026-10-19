import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const window={};vm.runInNewContext(fs.readFileSync(new URL('../pages/Shop/document-scanner.js',import.meta.url),'utf8'),{window});
const {project,valid}=window.shopDocumentScanner;
const quad=[{x:.1,y:.2},{x:.9,y:.1},{x:.8,y:.95},{x:.2,y:.8}];
assert.equal(valid(quad),true);
for(const [i,[u,v]] of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]]){const p=project(quad,u,v);assert.ok(Math.abs(p.x-quad[i].x)<1e-9);assert.ok(Math.abs(p.y-quad[i].y)<1e-9);}
assert.equal(valid([quad[0],quad[2],quad[1],quad[3]]),false);
for(const ratio of [.2,.5,1,2,5]){const r=[{x:0,y:0},{x:ratio,y:0},{x:ratio,y:1},{x:0,y:1}];const p=project(r,.25,.75);assert.ok(Math.abs(p.x-ratio*.25)<1e-9);assert.equal(p.y,.75);}
console.log('Document scanner: perspective corner mapping, crossed-corner rejection, sheet and long-receipt aspect ratios passed.');
