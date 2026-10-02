// Frozen pure ADT catalog insertion function; the harness supplies synthetic inputs.
module.exports=function(p){
 const catalogo=[p],prodSel=p.external_id||p.id;let items=[];
 function setItems(v){items=v;}
  function addFromCatalog(){
    const p = catalogo.find(function(x){ return (x.external_id || x.id) === prodSel; });
    if (!p) return;
    setItems(items.concat([{ product_external_id: p.external_id || p.id || '', name: p.name, category: p.category || '', base: p.base || 'fixed', unit_price: Number(p.unitPrice != null ? p.unitPrice : p.price) || 0, qty: 1, largo: 0, ancho: 0, alto: 0, line_total: 0 }]));
  }

 addFromCatalog();return items[0];
};
