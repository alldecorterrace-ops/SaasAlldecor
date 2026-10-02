<?php
// Memory-only ADT payment comparison. No Drupal boot, real database, filesystem writes or network.
class Request { public function __construct(public array $data) {} }
class JsonResponse { public function __construct(public array $data, public int $status=200) {} }
class ReferenceResult {
 public function __construct(private $value) {}
 public function fetchAssoc(){return $this->value;}
 public function fetchField(){return $this->value;}
}
class ReferenceQuery {
 private array $values=[];private array $conditions=[];
 public function __construct(private ReferenceDb $db, private string $operation, private string $table) {}
 public function fields(...$args){ if($this->operation!=='select')$this->values=$args[0];return $this; }
 public function condition($field,$value){$this->conditions[$field]=$value;return $this;}
 public function execute(){
  if($this->operation==='select')return new ReferenceResult($this->db->invoice['external_id']===$this->conditions['external_id']?$this->db->invoice:false);
  if($this->operation==='insert'){$this->db->payments[]=$this->values;return 1;}
  if($this->operation==='update'){$this->db->invoice=array_merge($this->db->invoice,$this->values);return 1;}
  throw new RuntimeException('Unexpected reference operation');
 }
}
class ReferenceDb {
 public array $invoice=['external_id'=>'QA-INV','client_external_id'=>'QA-C','project_external_id'=>'QA-P','total'=>'100.10','status'=>'OPEN','paid_amount'=>'0.00','balance_due'=>'100.10','payment_status'=>'UNPAID'];
 public array $payments=[];
 public function select($table,$alias){return new ReferenceQuery($this,'select',$table);}
 public function insert($table){if($table!=='adt_crm_payment')throw new RuntimeException('Unexpected insert table');return new ReferenceQuery($this,'insert',$table);}
 public function update($table){if($table!=='adt_crm_invoice')throw new RuntimeException('Unexpected update table');return new ReferenceQuery($this,'update',$table);}
 public function query($sql,$params){
  if(!str_contains($sql,'SUM(amount)')||$params[':s']!=='APPLIED')throw new RuntimeException('Unexpected query');
  return new ReferenceResult(array_sum(array_map(fn($p)=>$p['status']==='APPLIED'?(float)$p['amount']:0,$this->payments)));
 }
 public function startTransaction(){return new class {public function rollBack(){throw new RuntimeException('Unexpected reference rollback');}};}
}

// Original financial methods below, frozen from ADT controller SHA256
// 578144f99dd8a57043df03915c27f5e3b962633668b315c13013c7ee9c3d4401.
class PaymentReference {
 public ReferenceDb $state;
 private int $sequence=0;
 public function __construct(){ $this->state=new ReferenceDb(); }
 private function db(){return $this->state;}
 private function allowedWrite(){return true;}
 private function roleCan($module){return true;}
 private function body(Request $request){return $request->data;}
 private function projectForClient($project,$client){return $project==='QA-P'&&$client==='QA-C';}
 private function genExtId($table){return 'QA-PAY-'.(++$this->sequence);}
 private function adtUser(){return 'synthetic-actor';}
 private function financialEvent(...$args){}
  private function money($v): string { return number_format((float) $v, 2, '.', ''); }
  private function recomputeInvoice(string $invExt): array {
    $inv = $this->db()->select('adt_crm_invoice', 'i')->fields('i')
      ->condition('external_id', $invExt)->execute()->fetchAssoc();
    if (!$inv) { return ['ok' => FALSE, 'error' => 'invoice_not_found']; }
    $paid = (float) $this->db()->query(
      'SELECT COALESCE(SUM(amount), 0) FROM {adt_crm_payment} WHERE invoice_external_id = :x AND status = :s',
      [':x' => $invExt, ':s' => 'APPLIED']
    )->fetchField();
    $total = (float) $inv['total'];
    $balance = $total - $paid;
    if (strtoupper((string) $inv['status']) === 'VOID') {
      $ps = 'VOID';
    }
    else {
      $ps = ($balance <= 0.005) ? 'PAID' : (($paid > 0.005) ? 'PARTIAL' : 'UNPAID');
    }
    $this->db()->update('adt_crm_invoice')->fields([
      'paid_amount' => $this->money($paid),
      'balance_due' => $this->money($balance),
      'payment_status' => $ps,
      'changed' => time(),
    ])->condition('external_id', $invExt)->execute();
    return ['ok' => TRUE, 'paid' => $this->money($paid), 'balance' => $this->money($balance), 'payment_status' => $ps];
  }
  public function paymentCreate(Request $request): JsonResponse {
    if(!$this->allowedWrite()||!$this->roleCan('payments'))return new JsonResponse(['ok'=>FALSE,'error'=>'forbidden'],403); $d=$this->body($request); $invExt=trim((string)($d['invoice_external_id']??'')); if($invExt==='')return new JsonResponse(['ok'=>FALSE,'error'=>'invoice_required'],422);
    $inv=$this->db()->select('adt_crm_invoice','i')->fields('i')->condition('external_id',$invExt)->execute()->fetchAssoc(); if(!$inv)return new JsonResponse(['ok'=>FALSE,'error'=>'invoice_not_found'],404); if(strtoupper((string)$inv['status'])==='VOID')return new JsonResponse(['ok'=>FALSE,'error'=>'invoice_void'],422); $amount=(float)($d['amount']??0); if($amount<=0)return new JsonResponse(['ok'=>FALSE,'error'=>'amount_positive'],422);
    $paid=(float)$this->db()->query('SELECT COALESCE(SUM(amount),0) FROM {adt_crm_payment} WHERE invoice_external_id=:x AND status=:s',[':x'=>$invExt,':s'=>'APPLIED'])->fetchField(); $remaining=max(0,(float)$inv['total']-$paid); if($amount>$remaining+0.005)return new JsonResponse(['ok'=>FALSE,'error'=>'overpayment','remaining'=>$this->money($remaining)],422);
    $projExt=trim((string)($inv['project_external_id']??'')); if($projExt===''||!$this->projectForClient($projExt,(string)$inv['client_external_id']))return new JsonResponse(['ok'=>FALSE,'error'=>'invoice_project_required'],422);
    $ext=$this->genExtId('adt_crm_payment');$now=time();$fields=['external_id'=>$ext,'invoice_external_id'=>$invExt,'client_external_id'=>(string)$inv['client_external_id'],'project_external_id'=>$projExt,'payment_date'=>(string)($d['payment_date']??date('Y-m-d')),'amount'=>$this->money($amount),'method'=>(string)($d['method']??''),'notes'=>(string)($d['notes']??''),'status'=>'APPLIED','created'=>$now,'changed'=>$now,'reference'=>(string)($d['reference']??''),'created_by'=>$this->adtUser()?:'system']; $txn=$this->db()->startTransaction();try{$this->db()->insert('adt_crm_payment')->fields($fields)->execute();$rc=$this->recomputeInvoice($invExt);$this->financialEvent('payment',$ext,$invExt,(string)$inv['client_external_id'],'CREATE',NULL,$fields,(string)($d['notes']??''));}catch(\Exception $e){$txn->rollBack();return new JsonResponse(['ok'=>FALSE,'error'=>'payment_failed','detail'=>$e->getMessage()],500);}return new JsonResponse(['ok'=>TRUE,'external_id'=>$ext,'invoice'=>$rc]);
  }
}
