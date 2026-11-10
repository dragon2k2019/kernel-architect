// Production balance check:  npx tsx tools/verify-production.ts
// A scripted player who grows the board as cash comes in (extra servers, DBs, a chained second cache, overclocks,
// pokes crashed / hot boxes). Easy builds must fall in the early phases, the strong one must make it deep.
import { Sim } from '../src/game/sim';
import { LEVELS, type Kind } from '../src/game/content';
const SP:[number,number][]=[[536,0],[536,112],[536,224],[536,336],[536,448],[664,0],[664,112],[664,224],[664,336],[664,448]];
const DP:[number,number][]=[[808,40],[808,170],[808,300],[808,430]];
function run(maxS:number,maxD:number,caches:number,reserve:number){
  const sim = new Sim(LEVELS.find(l=>l.id==='L7')!);
  const mk=(k:Kind,x:number,y:number)=>sim.place(k,x,y).node!.id;
  const w=(a:number,b:number)=>{const r=sim.wire(a,b); if(!r.ok) throw new Error(r.reason)};
  const fw=mk('fw',152,236);
  const cs=[mk('cache',280,236)];
  const lb=mk('lb',408,236);
  w(sim.internetId,fw); w(fw,cs[0]);
  if(caches>1){ const c2=mk('cache',280,100); cs.push(c2); w(cs[0],c2); w(c2,lb);} else w(cs[0],lb);
  const sv:number[]=[]; const db:number[]=[];
  const addS=()=>{const [x,y]=SP[sv.length]; const id=mk('server',x,y); w(lb,id); db.forEach(d=>w(id,d)); sv.push(id);};
  const addD=()=>{const [x,y]=DP[db.length]; const id=mk('db',x,y); sv.forEach(s=>w(s,id)); db.push(id);};
  addD(); addS(); addS(); // $80+80=160 ... leaves cash
  sim.go();
  let next=0;
  while(sim.status==='running'&&sim.t<1000){
    sim.step(1/30);
    if(sim.t>=next){ next=sim.t+0.5;
      for(const n of sim.nodes) if(n.down>0||n.hot){sim.poke(n.id);break;}
      const all=[...sv,...db];
      if(sv.length<maxS && sim.cash>=40+reserve && sv.length<=db.length*3) addS();
      else if(db.length<maxD && sim.cash>=80+reserve && sv.length>db.length*2) addD();
      else {
        const lv=Math.min(...all.map(i=>sim.node(i)!.lvl));
        for(const i of all){const c=sim.upgradeCost(i); if(c!==null&&sim.cash>=c+reserve&&sim.node(i)!.lvl<=lv){sim.upgrade(i);break;}}
      }
    }
  }
  return sim;
}
let bad = 0;
const cases = [[4, 2, 1, 1, 6], [10, 4, 2, 5, 12]] as const; // servers, dbs, caches, min cleared, max cleared
for (const [a, b, c, lo, hi] of cases) {
  const s = run(a, b, c, 40);
  const good = s.cleared >= lo && s.cleared <= hi;
  if (!good) bad++;
  console.log(good ? 'ok ' : 'BAD',`${a}s/${b}db`,'t',s.t.toFixed(0),'phase',s.phase,'cleared',s.cleared,'flawless',s.flawless,'ok',s.ok,'fail',s.fail,'cash',Math.round(s.cash),'happy',s.happy.toFixed(0), `(want ${lo}-${hi} cleared)`);
}
process.exit(bad ? 1 : 0);
