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
  if($this->operation==='select'){
   if($this->table==='adt_crm_invoice')return new ReferenceResult($this->db->invoice['external_id']===$this->conditions['external_id']?$this->db->invoice:false);
   foreach($this->db->payments as $p)if($p['external_id']===$this->conditions['external_id'])return new ReferenceResult($p);
   return new ReferenceResult(false);
  }
  if($this->operation==='insert'){$this->db->payments[]=$this->values;return 1;}
  if($this->operation==='update'){
   if($this->table==='adt_crm_invoice'){$this->db->invoice=array_merge($this->db->invoice,$this->values);return 1;}
   foreach($this->db->payments as &$p){$match=true;foreach($this->conditions as $key=>$value)if(($p[$key]??null)!==$value)$match=false;if($match)$p=array_merge($p,$this->values);}unset($p);return 1;
  }
  throw new RuntimeException('Unexpected reference operation');
 }
}
class ReferenceDb {
 public array $invoice=['external_id'=>'QA-INV','client_external_id'=>'QA-C','project_external_id'=>'QA-P','total'=>'100.10','status'=>'OPEN','paid_amount'=>'0.00','balance_due'=>'100.10','payment_status'=>'UNPAID'];
 public array $payments=[];
 public function select($table,$alias){return new ReferenceQuery($this,'select',$table);}
 public function insert($table){if($table!=='adt_crm_payment')throw new RuntimeException('Unexpected insert table');return new ReferenceQuery($this,'insert',$table);}
 public function update($table){if(!in_array($table,['adt_crm_invoice','adt_crm_payment'],true))throw new RuntimeException('Unexpected update table');return new ReferenceQuery($this,'update',$table);}
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
  public function invoiceVoid(Request $request): JsonResponse {
    if (!$this->allowedWrite() || !$this->roleCan('invoices')) { return new JsonResponse(['ok' => FALSE, 'error' => 'forbidden'], 403); }
    $d = $this->body($request);
    $ext = trim((string) ($d['external_id'] ?? ''));
    if ($ext === '') { return new JsonResponse(['ok' => FALSE, 'error' => 'external_id_required'], 422); }
    $inv = $this->db()->select('adt_crm_invoice', 'i')->fields('i')
      ->condition('external_id', $ext)->execute()->fetchAssoc();
    if (!$inv) { return new JsonResponse(['ok' => FALSE, 'error' => 'invoice_not_found'], 404); }
    if (strtoupper((string) $inv['status']) === 'VOID') {
      return new JsonResponse(['ok' => TRUE, 'external_id' => $ext, 'already_void' => TRUE]);
    }
    $actor = $this->adtUser() ?: 'system';
    $reason = (string) ($d['reason'] ?? $d['void_reason'] ?? '');
    $now = time();
    $txn = $this->db()->startTransaction();
    try {
      $this->db()->update('adt_crm_invoice')->fields([
        'status' => 'VOID', 'payment_status' => 'VOID',
        'closed_at' => $now, 'closed_by' => $actor, 'void_reason' => $reason, 'changed' => $now,
      ])->condition('external_id', $ext)->execute();
      $this->db()->update('adt_crm_payment')->fields([
        'status' => 'ASSOCIATED_TO_VOID_INVOICE', 'void_reason' => $reason, 'changed_by' => $actor, 'changed' => $now,
      ])->condition('invoice_external_id', $ext)->condition('status', 'APPLIED')->execute();
      $after = $this->db()->select('adt_crm_invoice', 'i')->fields('i')->condition('external_id', $ext)->execute()->fetchAssoc();
      $this->financialEvent('invoice', $ext, $ext, (string) $inv['client_external_id'], 'VOID', $inv, $after, $reason);
    }
    catch (\Exception $e) {
      $txn->rollBack();
      return new JsonResponse(['ok' => FALSE, 'error' => 'void_failed', 'detail' => $e->getMessage()], 500);
    }
    return new JsonResponse(['ok' => TRUE, 'external_id' => $ext, 'status' => 'VOID']);
  }
  // ADT-AUTOFACT-V1 (2026-08-06, decisión Lemuel): lógica única para facturar un estimado.
  // Candado anti-duplicado + crea/liga proyecto (ADT-PROY-V1). El PAGO nunca se registra aquí:
  // la palabra del cliente no mueve dinero — Zelle/cash/wire los confirma finanzas; solo Stripe se auto-verifica.
  public function paymentVoid(Request $request): JsonResponse {
    if (!$this->allowedWrite() || !$this->roleCan('payments')) { return new JsonResponse(['ok' => FALSE, 'error' => 'forbidden'], 403); }
    $d = $this->body($request);
    $ext = trim((string) ($d['external_id'] ?? ''));
    if ($ext === '') { return new JsonResponse(['ok' => FALSE, 'error' => 'external_id_required'], 422); }
    $pay = $this->db()->select('adt_crm_payment', 'p')->fields('p')
      ->condition('external_id', $ext)->execute()->fetchAssoc();
    if (!$pay) { return new JsonResponse(['ok' => FALSE, 'error' => 'payment_not_found'], 404); }
    if (strtoupper((string) $pay['status']) === 'VOID') {
      return new JsonResponse(['ok' => TRUE, 'external_id' => $ext, 'already_void' => TRUE]);
    }
    $actor = $this->adtUser() ?: 'system';
    $reason = (string) ($d['reason'] ?? $d['void_reason'] ?? '');
    $now = time();
    $invExt = (string) $pay['invoice_external_id'];
    $txn = $this->db()->startTransaction();
    try {
      $this->db()->update('adt_crm_payment')->fields([
        'status' => 'VOID', 'void_reason' => $reason, 'changed_by' => $actor, 'changed' => $now,
      ])->condition('external_id', $ext)->execute();
      $rc = $this->recomputeInvoice($invExt);
      $after = $this->db()->select('adt_crm_payment', 'p')->fields('p')->condition('external_id', $ext)->execute()->fetchAssoc();
      $this->financialEvent('payment', $ext, $invExt, (string) $pay['client_external_id'], 'VOID', $pay, $after, $reason);
    }
    catch (\Exception $e) {
      $txn->rollBack();
      return new JsonResponse(['ok' => FALSE, 'error' => 'void_failed', 'detail' => $e->getMessage()], 500);
    }
    return new JsonResponse(['ok' => TRUE, 'external_id' => $ext, 'invoice' => $rc]);
  }

   /* ===================== ADT DELETE ENGINE (admin) =====================
   * Borrado real gated por allowedWrite(). Un método para factura y lead.
   * - invoice: borra la factura + sus pagos. SOLO si status=VOID (anula primero),
   *            salvo que se pase force:true. Protege facturas reales.
   * - lead: borra la webform_submission de Drupal por id (sid).
   * Ruta: POST /adt/api/crm/record-delete  { type:'invoice'|'lead', external_id|id, force? }
   */
  // ===================== ADT PRODUCTOS (catalogo parametrico) =====================
  // Tabla adt_crm_product autocreada. Un producto = regla de precio:
  // base (area_ft2|linear_ft|volume_ft3|unit|fixed|manual), unit_price, specs[], options[].
  // El configurador leera GET /products y calculara el total con las medidas del vendedor.
}
