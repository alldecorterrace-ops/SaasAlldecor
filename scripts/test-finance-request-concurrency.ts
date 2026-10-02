import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { emptyItem } from "../src/lib/estimates";
async function main() {
  const url=new URL(process.env.QUEUE_TEST_DATABASE_URL ?? "");
  if (!["localhost","127.0.0.1"].includes(url.hostname)||url.pathname!=="/saas_queue_test") throw new Error("Dedicated local test database required");
  const pool=new Pool({connectionString:url.href,max:10,statement_timeout:30000});
  const owner=randomUUID(),company=randomUUID(),customer=randomUUID(),estimate=randomUUID();
  const actor=async <T>(fn:(c:PoolClient)=>Promise<T>)=>{
    const c=await pool.connect();try {await c.query("begin");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await c.query("set local role authenticated");const result=await fn(c);await c.query("commit");return result;}catch(e){await c.query("rollback");throw e;}finally{c.release();}
  };
  const execute=(operation:string,id:string,version:number,data:object,request:string)=>actor(async c=>(await c.query("select execute_finance_action($1,$2,$3,$4,$5,$6) data",[company,request,operation,id,version,JSON.stringify(data)])).rows[0].data);
  try {
    await pool.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[owner,`${owner}@example.test`]);
    await actor(async c=>{
      await c.query("select create_company($1,'Finance request concurrency')",[company]);
      await c.query("select save_customer($1,$2,0,$3)",[company,customer,JSON.stringify({full_name:"Synthetic",status:"active"})]);
      await c.query("select save_estimate($1,$2,0,$3)",[company,estimate,JSON.stringify({customer_id:customer,estimate_date:"2026-10-01",valid_until:null,status:"PENDIENTE",notes:"",discount:"0",taxes:"0",items:[{...emptyItem,name:"QA",unit_price:"100.00"}]})]);
    });
    const request=randomUUID(),approval={date:"2026-10-01",name:"Synthetic project",note:"Synthetic approval"};
    const results=await Promise.all(Array.from({length:8},()=>execute("approve",estimate,1,approval,request)));
    assert(results.every(x=>JSON.stringify(x)===JSON.stringify(results[0])));
    const invoice=results[0].id;
    const payment=randomUUID(),payRequest=randomUUID(),data={payment_id:payment,amount:"25.10",payment_date:"2026-10-01",method:"ZELLE",reference:"QA",notes:""};
    const paid=await Promise.all(Array.from({length:8},()=>execute("payment",invoice,1,data,payRequest)));
    assert(paid.every(x=>JSON.stringify(x)===JSON.stringify(paid[0])));
    const race=await Promise.allSettled([execute("invoice",invoice,2,{date:"2026-10-01",due:null,notes:"First writer"},randomUUID()),execute("invoice",invoice,2,{date:"2026-10-01",due:null,notes:"Second writer"},randomUUID())]);
    assert.equal(race.filter(x=>x.status==="fulfilled").length,1);assert.equal(race.filter(x=>x.status==="rejected").length,1);
    const row=(await pool.query("select (select count(*)::int from invoices where company_id=$1) invoices,(select count(*)::int from projects where company_id=$1) projects,(select count(*)::int from payments where company_id=$1) payments,(select count(*)::int from app_private.finance_requests where company_id=$1) receipts,paid_amount,balance_due,version from invoices where company_id=$1",[company])).rows[0];
    assert.deepEqual(row,{invoices:1,projects:1,payments:1,receipts:3,paid_amount:"25.10",balance_due:"74.90",version:3});
    assert.equal((await pool.query("select method from payments where id=$1",[payment])).rows[0].method,"ZELLE");
    const before=(await pool.query("select count(*)::int n from audit_events where company_id=$1",[company])).rows[0].n;
    await assert.rejects(execute("payment",invoice,1,{...data,amount:"25.11"},payRequest),/request_conflict/);
    assert.equal((await pool.query("select count(*)::int n from audit_events where company_id=$1",[company])).rows[0].n,before);
    for (const [method,version] of [["NOT_CHARGED",3],["SIN_METODO",4]] as const) {
      const id=randomUUID(),req=randomUUID(),payload={payment_id:id,amount:"1.01",payment_date:"2026-10-02",method,reference:method,notes:"Synthetic legacy method"};
      const replies=await Promise.all(Array.from({length:8},()=>execute("payment",invoice,version,payload,req)));
      assert(replies.every(x=>JSON.stringify(x)===JSON.stringify(replies[0])));
      assert.equal((await pool.query("select method from payments where id=$1",[id])).rows[0].method,method);
    }
    const final=(await pool.query("select (select count(*)::int from payments where company_id=$1) payments,paid_amount,balance_due,version from invoices where company_id=$1",[company])).rows[0];
    assert.deepEqual(final,{payments:3,paid_amount:"27.12",balance_due:"72.88",version:5});
    const document=await actor(async c=>(await c.query("select to_jsonb(prepare_commercial_document($1,'invoice',$2,5)) data",[company,invoice])).rows[0].data);
    const voidRequest=randomUUID(),voidData={date:"2026-10-01",due:null,notes:"",reason:"Synthetic annulment"};
    const voidReplies=await Promise.all(Array.from({length:8},()=>execute("void-invoice",invoice,5,voidData,voidRequest)));
    assert(voidReplies.every(x=>JSON.stringify(x)===JSON.stringify(voidReplies[0])));
    assert.deepEqual((await pool.query("select status,payment_status,paid_amount,balance_due,version from invoices where id=$1",[invoice])).rows[0],{status:"VOID",payment_status:"VOID",paid_amount:"27.12",balance_due:"72.88",version:6});
    const associated=(await pool.query("select status,version from payments where invoice_id=$1",[invoice])).rows;
    assert.equal(associated.length,3);assert(associated.every(x=>x.status==="ASSOCIATED_TO_VOID_INVOICE"&&x.version===2));
    const voidAudit=(await pool.query("select count(*)::int n from audit_events where company_id=$1",[company])).rows[0].n;
    await assert.rejects(execute("payment",invoice,6,{...data,payment_id:randomUUID(),reference:"After void"},randomUUID()),/invoice_void/);
    await assert.rejects(execute("void-invoice",invoice,5,{...voidData,reason:"Changed intent"},voidRequest),/request_conflict/);
    assert.equal((await pool.query("select count(*)::int n from audit_events where company_id=$1",[company])).rows[0].n,voidAudit);
    const reverseRequest=randomUUID();
    const reversed=await Promise.all(Array.from({length:8},()=>execute("void-payment",payment,2,{reason:"Synthetic reversal"},reverseRequest)));
    assert(reversed.every(x=>JSON.stringify(x)===JSON.stringify(reversed[0])));
    assert.deepEqual((await pool.query("select status,payment_status,paid_amount,balance_due,version from invoices where id=$1",[invoice])).rows[0],{status:"VOID",payment_status:"VOID",paid_amount:"0.00",balance_due:"100.00",version:7});
    assert.equal((await pool.query("select status from payments where id=$1",[payment])).rows[0].status,"VOID");
    assert.equal((await pool.query("select count(*)::int n from payments where invoice_id=$1 and status='ASSOCIATED_TO_VOID_INVOICE'",[invoice])).rows[0].n,2);
    assert.deepEqual((await pool.query("select to_jsonb(d) data from commercial_documents d where id=$1",[document.id])).rows[0].data,document);
    // Exercise both invoice-lock orders with a competing new payment. The loser
    // must have no effect and no successful request receipt.
    for (const firstOperation of ["void-invoice","payment"] as const) {
      const est=randomUUID();
      await actor(c=>c.query("select save_estimate($1,$2,0,$3)",[company,est,JSON.stringify({customer_id:customer,estimate_date:"2026-10-01",valid_until:null,status:"PENDIENTE",notes:"",discount:"0",taxes:"0",items:[{...emptyItem,name:"Race QA",unit_price:"100.00"}]})]));
      const inv=(await execute("approve",est,1,approval,randomUUID())).id;
      await execute("payment",inv,1,{...data,payment_id:randomUUID(),reference:"Race deposit"},randomUUID());
      const nextPay={...data,payment_id:randomUUID(),amount:"1.01",reference:"Race extra"};
      const secondOperation=firstOperation==="payment"?"void-invoice":"payment";
      const lock=await pool.connect();
      try {
        await lock.query("begin");await lock.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await lock.query("set local role authenticated");
        await lock.query("select 1 from invoices where company_id=$1 and id=$2 for update",[company,inv]);
        const competing=execute(secondOperation,inv,2,secondOperation==="payment"?nextPay:voidData,randomUUID()).then(()=>({ok:true,error:""}),e=>({ok:false,error:String(e.message)}));
        await lock.query("select execute_finance_action($1,$2,$3,$4,2,$5)",[company,randomUUID(),firstOperation,inv,JSON.stringify(firstOperation==="payment"?nextPay:voidData)]);
        await lock.query("commit");
        const loser=await competing;assert.equal(loser.ok,false);assert.match(loser.error,/record_conflict|invoice_void/);
      } catch(e){await lock.query("rollback");throw e;}finally{lock.release();}
      const result=(await pool.query("select status,paid_amount,balance_due,version from invoices where id=$1",[inv])).rows[0];
      assert.deepEqual(result,firstOperation==="payment"?{status:"OPEN",paid_amount:"26.11",balance_due:"73.89",version:3}:{status:"VOID",paid_amount:"25.10",balance_due:"74.90",version:3});
      assert.equal((await pool.query("select count(*)::int n from payments where invoice_id=$1",[inv])).rows[0].n,firstOperation==="payment"?2:1);
      assert.equal((await pool.query("select count(*)::int n from app_private.finance_requests where company_id=$1 and payload->>'id'=$2",[company,inv])).rows[0].n,2);
      assert.equal((await pool.query("select count(*)::int n from payments where invoice_id=$1 and status='APPLIED'",[inv])).rows[0].n,firstOperation==="payment"?2:0);
    }
    console.log("Finance concurrency: eight retries for each method, paid invoice annulment and associated payment reversal; one effect per request, preserved invoice values/documents and rejected stale writers/new payments.");
  } finally {await pool.end();}
}
main().catch(()=>{console.error("Finance concurrency verification failed");process.exitCode=1;});
