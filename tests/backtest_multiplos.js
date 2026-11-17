global.Val=require('../js/val.js');const V=Val,L=require('../js/logic.js'),fs=require('fs');
let d=JSON.parse(fs.readFileSync(process.argv[2]));L.normalizar(d);
const H=JSON.parse(fs.readFileSync(__dirname+'/../datos/precios_anuales.json')).simbolos;
const clone=o=>JSON.parse(JSON.stringify(o)), med=a=>{a=a.filter(x=>x!=null&&isFinite(x)).sort((x,y)=>x-y);return a.length?(a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2):null};
const rank=a=>{const o=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]),r=[];o.forEach((x,k)=>r[x[1]]=k);return r};
const spear=(a,b)=>{if(a.length<4)return null;const x=rank(a),y=rank(b),n=a.length,mx=(n-1)/2;let c=0,sx=0,sy=0;for(let i=0;i<n;i++){c+=(x[i]-mx)*(y[i]-mx);sx+=(x[i]-mx)**2;sy+=(y[i]-mx)**2}return c/Math.sqrt(sx*sy)};
const NOW='2026-11-17';
const CUTS=[2021,2022,2023,2024], rows=[];
const ES=f=>(!f.tipo||f.tipo==='industrial')&&f.metodo!=='margen_objetivo'&&f.metodo!=='fcfa2s';
Object.keys(d.fichas).forEach(tk=>{
  const F=d.fichas[tk]; if(!ES(F)) return; const e=H[tk]; if(!e||e.divisa!==F.divisa) return;
  let pNow; try{pNow=L.precioFicha(d,tk).precio}catch(x){return} if(!(pNow>0)) return;
  const an=F.anios, full=clone(F); const sp=(e.splits&&e.splits.length)?e.splits:V.inferirSplits(full.hist.acciones,an,12);
  const adj=V.accAjustadas(full.hist,sp,an,12).acc; full.hist.acciones=adj;
  CUTS.forEach(N=>{
    const idx=an.indexOf(N); if(idx<2||idx>=an.length-1&&false) return; if(idx<0) return;
    const f=clone(full); Object.keys(f.hist).forEach(k=>{if(Array.isArray(f.hist[k])) f.hist[k]=f.hist[k].slice(0,idx+1)});
    f.anios=an.slice(0,idx+1); f.anio_base=N; ['escenarios','base_ttm','deuda_neta_proy','mult_hist','mult_hist_auto','solo_fcf','_borrador'].forEach(k=>delete f[k]);
    const dm=(N+1)+'-03'; const P0=e.cierres[dm]; if(!(P0>0)) return; f.precio=P0;
    const yrs=((Date.parse(NOW)-Date.parse((N+1)+'-03-15'))/(365.25*864e5)), k=Math.max(1,Math.min(5,Math.round(yrs)));
    const cierresHasta={}; Object.keys(e.cierres).forEach(c=>{if(c<=dm) cierresHasta[c]=e.cierres[c]});
    const mh=V.multiplosHistoricos(f,cierresHasta,[],{min:3}); let propios=null; if(mh&&mh.valido&&!['per','pfcf'].some(x=>mh.mult[x]>40)) propios=mh.mult;
    const ds=L.distorsion(f), distors=!!(ds&&ds.distorsionada);
    const run=(mult,sf)=>{ try{const g=clone(f); if(mult) g.mult_hist=mult; if(sf) g.solo_fcf=true; const sc=Object.assign({},V.defaults(g).conservador,{}); const r=V.proyectar(g,sc); const q=r.rows[k-1]; if(!q) return null;
      const pp=sf&&q.po.pfcf>0?q.po.pfcf:Math.max(q.po.per,q.po.pfcf), ref=sf&&q.po.pfcf>0?pp:(pp+q.po.ev_ebitda)/2; if(!(ref>0)) return null;
      const pes=V.proyectar(g,V.defaults(g).pesimista).rows[k-1], opt=V.proyectar(g,V.defaults(g).optimista).rows[k-1];
      const rf=(qq)=>{const p2=sf&&qq.po.pfcf>0?qq.po.pfcf:Math.max(qq.po.per,qq.po.pfcf);return sf&&qq.po.pfcf>0?p2:(p2+qq.po.ev_ebitda)/2};
      return {ref,lo:rf(pes),hi:rf(opt)};}catch(x){return null}};
    const A=run(null,false), B=propios?run(propios,false):null, C=distors?run(propios,true):null, C2=distors?run(null,true):null;
    rows.push({tk,N,k,yrs,P0,pNow,propios,distors,A,B,C,C2});
  });
});
const real=r=>Math.pow(r.pNow/r.P0,1/r.yrs)-1;
const pred=(r,x)=>x?Math.pow(x.ref/r.P0,1/r.k)-1:null;
const vnow=(r,x)=>x?r.P0*Math.pow(x.ref/r.P0,r.yrs/r.k):null;
const out={};
function stats(name,sel,get){ // get(r)->variant result
  const R=rows.filter(r=>sel(r)&&get(r)); const err=R.map(r=>vnow(r,get(r))/r.pNow-1), pr=R.map(r=>pred(r,get(r))), re=R.map(real);
  const dentro=R.filter(r=>{const x=get(r);const v=(y)=>r.P0*Math.pow(y/r.P0,r.yrs/r.k);return r.pNow>=v(Math.min(x.lo,x.hi))*0.0+Math.min(v(x.lo),v(x.hi))&&r.pNow<=Math.max(v(x.lo),v(x.hi))}).length;
  return {name,n:R.length,errMed:med(err),errAbsMed:med(err.map(Math.abs)),dentro20:err.filter(e=>Math.abs(e)<=0.2).length,dentroRango:dentro,sesgoPred:med(pr.map((p,i)=>p-re[i])),spearman:spear(pr,re)};
}
const naive=rows.filter(r=>r.A); 
const res=[];
CUTS.forEach(N=>{
  res.push(Object.assign(stats('A genérico '+N,r=>r.N===N,r=>r.A),{cut:N,v:'A'}));
  res.push(Object.assign(stats('B propios '+N,r=>r.N===N,r=>r.B),{cut:N,v:'B'}));
  res.push(Object.assign(stats('A (mismas que B) '+N,r=>r.N===N&&r.B,r=>r.A),{cut:N,v:'A|B'}));
});
res.push(Object.assign(stats('A genérico, todos',r=>true,r=>r.A),{v:'A'})); res.push(Object.assign(stats('B propios, todos',r=>true,r=>r.B),{v:'B'})); res.push(Object.assign(stats('A (mismas que B)',r=>r.B,r=>r.A),{v:'A|B'}));
res.push(stats('Distorsionadas: A',r=>r.distors,r=>r.A)); res.push(stats('Distorsionadas: B propios',r=>r.distors,r=>r.B)); res.push(stats('Distorsionadas: C propios+solo FCF',r=>r.distors,r=>r.C)); res.push(stats('Distorsionadas: C2 genérico+solo FCF',r=>r.distors,r=>r.C2));
res.push(stats('No distorsionadas: A',r=>!r.distors,r=>r.A)); res.push(stats('No distorsionadas: B',r=>!r.distors,r=>r.B));
console.log(JSON.stringify(res.map(x=>({...x,errMed:x.errMed&&+x.errMed.toFixed(3),errAbsMed:x.errAbsMed&&+x.errAbsMed.toFixed(3),sesgoPred:x.sesgoPred&&+x.sesgoPred.toFixed(3),spearman:x.spearman&&+x.spearman.toFixed(2)})),null,0).replace(/\},\{/g,'}\n{'));
// buckets por rentabilidad predicha (A)
const bk=(get,t)=>{const R=rows.filter(r=>get(r)); const g=(a,b)=>R.filter(r=>{const p=pred(r,get(r));return p>=a&&p<b}); return [['≥15 %',0.15,9],['8–15 %',0.08,0.15],['<8 %',-9,0.08]].map(([n,a,b])=>{const x=g(a,b);return n+': n='+x.length+' real mediana '+(med(x.map(real))*100).toFixed(1)+' %, pred mediana '+(med(x.map(r=>pred(r,get(r))))*100).toFixed(1)+' %'})};
console.log('BUCKETS A',bk(r=>r.A)); console.log('BUCKETS B',bk(r=>r.B));
fs.writeFileSync(require('os').tmpdir()+'/bt_rows.json',JSON.stringify(rows.map(r=>({tk:r.tk,corte:r.N,k:r.k,anios:+r.yrs.toFixed(2),precio_corte:+r.P0.toFixed(2),precio_hoy:r.pNow,real:+real(r).toFixed(4),predA:pred(r,r.A)&&+pred(r,r.A).toFixed(4),predB:pred(r,r.B)&&+pred(r,r.B).toFixed(4),predC:pred(r,r.C)&&+pred(r,r.C).toFixed(4),valorHoyA:r.A&&+vnow(r,r.A).toFixed(2),valorHoyB:r.B&&+vnow(r,r.B).toFixed(2),distors:r.distors,mult:r.propios}))));
console.log('filas',rows.length);
