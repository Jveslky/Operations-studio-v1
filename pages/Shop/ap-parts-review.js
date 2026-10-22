(function () {
    'use strict';
    // Conservative suggestions only. Unsupported layouts remain visible in the source text.
    function suggest(text) {
        return String(text || '').split(/\r?\n/).map(source => {
            const match = source.trim().match(/^([A-Z0-9][A-Z0-9._/-]*\d[A-Z0-9._/-]*)\s+(.+?)\s+(\d+(?:\.\d{1,3})?)\s+\$?(\d+(?:\.\d{2,4}))\s+\$?(\d+(?:\.\d{2}))$/i);
            if (!match || Math.abs(Math.round(Number(match[3])*Number(match[4])*100)/100-Number(match[5]))>0.01) return null;
            return {source, part_number:match[1], description:match[2], ordered:match[3], supplier_cost:match[4]};
        }).filter(Boolean).slice(0,100);
    }
    function number(value, places, positive=false) {
        if (!new RegExp(`^[0-9]+(?:\\.[0-9]{1,${places}})?$`).test(String(value)) || !Number.isFinite(Number(value)) || (positive && Number(value)<=0)) throw Error('Review quantities, pack sizes and costs.');
        return Number(value);
    }
    function stockLine(row) {
        const received=number(row.received,3,true),pack=number(row.pack,3,true),cost=number(row.supplier_cost,4);
        const quantity=Math.round(received*pack*1000)/1000,unit_cost=Math.round(cost/pack*10000)/10000;
        if (quantity<=0 || Math.abs(quantity-received*pack)>0.0000001) throw Error('Converted quantity needs more than three decimal places.');
        if (!row.item_id) throw Error('Match every received line to an inventory part.');
        return {item_id:row.item_id,quantity,unit_cost};
    }
    window.shopAPParts={suggest,stockLine};
})();
