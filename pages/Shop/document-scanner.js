/* Local document preparation. Originals remain the authoritative attachment. */
(function () {
    'use strict';
    function project(points, u, v) {
        const [a,b,c,d]=points;
        const dx=b.x-c.x,dy=b.y-c.y,ex=d.x-c.x,ey=d.y-c.y;
        const sx=a.x-b.x+c.x-d.x,sy=a.y-b.y+c.y-d.y;
        const det=dx*ey-ex*dy;
        const g=Math.abs(det)>1e-9?(sx*ey-ex*sy)/det:0;
        const h=Math.abs(det)>1e-9?(dx*sy-sx*dy)/det:0;
        const z=g*u+h*v+1;
        return {x:((b.x-a.x+g*b.x)*u+(d.x-a.x+h*d.x)*v+a.x)/z,y:((b.y-a.y+g*b.y)*u+(d.y-a.y+h*d.y)*v+a.y)/z};
    }
    function valid(p) {
        return p.every((a,i)=>{const b=p[(i+1)%4],c=p[(i+2)%4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)>0.002;});
    }
    async function prepare(file) {
        const bitmap=await createImageBitmap(file);
        const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));
        const source=document.createElement('canvas');source.width=Math.round(bitmap.width*scale);source.height=Math.round(bitmap.height*scale);source.getContext('2d').drawImage(bitmap,0,0,source.width,source.height);bitmap.close();
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');dialog.className='document-scanner';
            dialog.innerHTML='<h2>Frame your document</h2><p>Drag the four corners to the paper edges. Full sheets, half sheets and narrow receipts keep their own shape. For a long receipt, keep every line readable; retake closer if needed.</p><canvas aria-label="Document corners; use the numbered coordinate controls below as an alternative"></canvas><div class="scan-corners"></div><label><input type="checkbox" class="scan-clean" checked> Enhance text contrast</label><p class="scan-status" role="status"></p><div class="scan-actions"><button type="button" data-action="preview">Preview scan</button><button type="button" data-action="back" hidden>Adjust corners</button><button type="button" data-action="use" hidden>Use scan</button><button type="button" data-action="cancel">Retake / Cancel</button></div>';
            document.body.append(dialog);const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');canvas.width=source.width;canvas.height=source.height;
            let points=[{x:.02,y:.02},{x:.98,y:.02},{x:.98,y:.98},{x:.02,y:.98}],drag=-1,output=null;
            const controls=dialog.querySelector('.scan-corners');
            points.forEach((p,i)=>{const label=document.createElement('label');label.textContent=`Corner ${i+1} (across / down %)`;['x','y'].forEach(axis=>{const input=document.createElement('input');input.type='number';input.min=0;input.max=100;input.step=.1;input.value=p[axis]*100;input.setAttribute('aria-label',`Corner ${i+1} ${axis} percent`);input.oninput=()=>{p[axis]=Math.max(0,Math.min(1,Number(input.value)/100));draw();};label.append(input);});controls.append(label);});
            function draw(){ctx.drawImage(source,0,0);ctx.fillStyle='#0008';ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);points.forEach((p,i)=>i?ctx.lineTo(p.x*canvas.width,p.y*canvas.height):ctx.moveTo(p.x*canvas.width,p.y*canvas.height));ctx.closePath();ctx.fill('evenodd');ctx.strokeStyle='#f36a2a';ctx.lineWidth=5;ctx.stroke();points.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,Math.max(16,canvas.width*.025),0,Math.PI*2);ctx.fillStyle='#f36a2a';ctx.fill();ctx.fillStyle='#111';ctx.font=`bold ${Math.max(20,canvas.width*.03)}px sans-serif`;ctx.fillText(i+1,p.x*canvas.width-8,p.y*canvas.height+8);});}
            function position(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
            canvas.onpointerdown=e=>{if(output)return;const p=position(e);drag=points.reduce((best,q,i)=>Math.hypot(q.x-p.x,q.y-p.y)<Math.hypot(points[best].x-p.x,points[best].y-p.y)?i:best,0);canvas.setPointerCapture(e.pointerId);};
            canvas.onpointermove=e=>{if(drag<0)return;Object.assign(points[drag],position(e));controls.querySelectorAll('label').forEach((l,i)=>l.querySelectorAll('input').forEach((input,j)=>input.value=(points[i][j?'y':'x']*100).toFixed(1)));draw();};canvas.onpointerup=canvas.onpointercancel=()=>drag=-1;
            function finish(value){dialog.close();dialog.remove();resolve(value);}
            dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
            dialog.addEventListener('click',e=>{
                const action=e.target.dataset.action;if(!action)return;
                if(action==='cancel'){finish(null);return;}
                if(action==='use'){finish(output);return;}
                if(action==='back'){output=null;canvas.width=source.width;canvas.height=source.height;controls.hidden=false;draw();}
                if(action==='preview'){
                    if(!valid(points)){dialog.querySelector('.scan-status').textContent='Keep corners clockwise without crossing, with a readable area between them.';return;}
                    dialog.querySelector('.scan-status').textContent='Check all edges and small print before using this scan.';
                    const p=points.map(q=>({x:q.x*source.width,y:q.y*source.height}));
                    const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
                    output=document.createElement('canvas');output.width=Math.max(1,Math.round(Math.max(distance(p[0],p[1]),distance(p[3],p[2]))));output.height=Math.max(1,Math.round(Math.max(distance(p[0],p[3]),distance(p[1],p[2]))));
                    const pixels=source.getContext('2d').getImageData(0,0,source.width,source.height),target=output.getContext('2d').createImageData(output.width,output.height),clean=dialog.querySelector('.scan-clean').checked;
                    for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){
                        const q=project(p,x/Math.max(1,output.width-1),y/Math.max(1,output.height-1));const si=(Math.max(0,Math.min(source.height-1,Math.round(q.y)))*source.width+Math.max(0,Math.min(source.width-1,Math.round(q.x))))*4,ti=(y*output.width+x)*4;
                        const gray=.299*pixels.data[si]+.587*pixels.data[si+1]+.114*pixels.data[si+2];
                        for(let k=0;k<3;k++)target.data[ti+k]=clean?Math.max(0,Math.min(255,(gray-128)*1.25+145)):pixels.data[si+k];target.data[ti+3]=255;
                    }
                    output.getContext('2d').putImageData(target,0,0);canvas.width=output.width;canvas.height=output.height;ctx.drawImage(output,0,0);controls.hidden=true;
                }
                dialog.querySelector('[data-action="preview"]').hidden=!!output;dialog.querySelector('[data-action="back"]').hidden=!output;dialog.querySelector('[data-action="use"]').hidden=!output;
            });draw();dialog.showModal();
        });
    }
    window.shopDocumentScanner={prepare,project,valid};
})();
