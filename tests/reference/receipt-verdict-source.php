<?php
// ADT source controller SHA256 cd5ebd45684b313b92baa6be9757975c59bc62fde95b1a3cb8e0a8d3d30db021.
// Frozen pure comparison methods. No Drupal bootstrap, credentials or real data.
class ReceiptReference {
 private $projects;
 public function __construct(array $projects) { $this->projects=$projects; }
 private function expenseWorkedProjects(array $row,string $date):array {
  return ['ids'=>array_column($this->projects,'id'),'names'=>array_column($this->projects,'name')];
 }
 public function compare(array $row,array $data):array { return $this->expenseAiVerdict($row,$data); }
  private function expenseAiInvoiceFingerprint(string $merchant, string $invoice): string {
    $merchantKey = preg_replace('/[^A-Z0-9]+/', '', strtoupper($merchant));
    $invoiceKey = preg_replace('/[^A-Z0-9]+/', '', strtoupper($invoice));
    if (strlen((string) $merchantKey) < 3 || strlen((string) $invoiceKey) < 3) { return ''; }
    return hash('sha256', $merchantKey . '|' . $invoiceKey);
  }

  private function expenseAiVerdict(array $row, array $data): array {
    $isReceipt = filter_var($data['es_recibo'], FILTER_VALIDATE_BOOLEAN);
    $legible = filter_var($data['legible'], FILTER_VALIDATE_BOOLEAN);
    $merchant = substr(trim((string) $data['comercio']), 0, 140);
    $merchantAddress = substr(trim((string) $data['direccion_comercio']), 0, 255);
    $date = trim((string) $data['fecha']);
    if (!preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/', $date) || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4))) { $date = ''; }
    $total = is_numeric($data['total']) ? round((float) $data['total'], 2) : NULL;
    $subtotal = is_numeric($data['subtotal']) ? round((float) $data['subtotal'], 2) : NULL;
    $tax = is_numeric($data['impuesto']) ? round((float) $data['impuesto'], 2) : NULL;
    $currency = strtoupper(preg_replace('/[^A-Za-z]/', '', (string) $data['moneda']));
    $currency = strlen($currency) === 3 ? $currency : '';
    $invoice = substr(trim((string) $data['numero_factura']), 0, 100);
    $receiptPayment = substr(trim((string) $data['metodo_pago']), 0, 40);
    $cardDigits = preg_replace('/[^0-9]/', '', (string) $data['tarjeta_ult4']);
    $cardLast4 = strlen((string) $cardDigits) >= 4 ? substr((string) $cardDigits, -4) : '';
    $declared = round((float) $row['amount'], 2);
    $state = 'OK'; $reasons = [];
    if (!$isReceipt) { $state = 'MAL'; $reasons[] = 'La imagen no parece ser un recibo.'; }
    elseif (!$legible) { $state = 'MAL'; $reasons[] = 'El recibo no es suficientemente legible.'; }
    else {
      if ($total === NULL) { $state = 'DUDA'; $reasons[] = 'No se pudo leer el total.'; }
      elseif (abs($total - $declared) > max(1.0, abs($declared) * 0.01)) {
        $state = 'DUDA'; $reasons[] = 'Monto declarado $' . number_format($declared, 2) . '; recibo $' . number_format($total, 2) . '.';
      }
      if ($date === '') { $state = 'DUDA'; $reasons[] = 'No se pudo leer la fecha.'; }
      elseif ($date !== (string) $row['expense_date']) { $state = 'DUDA'; $reasons[] = 'Fecha declarada ' . (string) $row['expense_date'] . '; recibo ' . $date . '.'; }
      if ($merchant === '') { $state = 'DUDA'; $reasons[] = 'No se pudo identificar el proveedor.'; }
      if ($invoice === '') { $state = 'DUDA'; $reasons[] = 'No se pudo leer un numero de factura, recibo o transaccion.'; }
      $paymentLower = strtolower($receiptPayment);
      if ($cardLast4 === '' && (strpos($paymentLower, 'tarjet') !== FALSE || strpos($paymentLower, 'card') !== FALSE || strpos($paymentLower, 'credit') !== FALSE || strpos($paymentLower, 'debit') !== FALSE)) {
        $state = 'DUDA'; $reasons[] = 'La compra parece ser con tarjeta, pero no se pudieron leer los ultimos 4 digitos.';
      }
      $selectedPay = strtolower(trim((string) ($row['pay_method'] ?? '')));
      $looksCard = strpos($paymentLower, 'tarjet') !== FALSE || strpos($paymentLower, 'card') !== FALSE || strpos($paymentLower, 'credit') !== FALSE || strpos($paymentLower, 'debit') !== FALSE;
      $looksCash = strpos($paymentLower, 'efect') !== FALSE || strpos($paymentLower, 'cash') !== FALSE;
      if (($selectedPay === 'efectivo_empresa' && $looksCard) || ($selectedPay === 'empresa' && $looksCash)) {
        $state = 'DUDA'; $reasons[] = 'El metodo de pago elegido no coincide con lo que muestra el recibo.';
      }
    }
    $projectDate = $date !== '' ? $date : (string) $row['expense_date'];
    $worked = $this->expenseWorkedProjects($row, $projectDate);
    $expected = substr(implode(', ', $worked['names']), 0, 500);
    $declaredProject = trim((string) ($row['project_external_id'] ?? ''));
    $projectMatch = 0;
    if (!$worked['ids']) {
      if ($state !== 'MAL') { $state = 'DUDA'; }
      $reasons[] = 'No se encontro una jornada del trabajador el ' . $projectDate . ' para confirmar la obra.';
    }
    elseif ($declaredProject !== '' && in_array($declaredProject, $worked['ids'], TRUE)) { $projectMatch = 1; }
    else {
      if ($state !== 'MAL') { $state = 'DUDA'; }
      $reasons[] = 'La obra del gasto no coincide con la jornada. Ese dia marco en: ' . $expected . '.';
    }
    if (!$reasons) { $reasons[] = 'Factura legible: proveedor, fecha, total, numero y obra coinciden.'; }
    return [
      'ia_estado' => $state,
      'ia_nota' => substr(implode(' ', $reasons), 0, 400),
      'ia_comercio' => $merchant,
      'ia_direccion_comercio' => $merchantAddress,
      'ia_fecha' => $date,
      'ia_monto' => $total,
      'ia_subtotal' => $subtotal,
      'ia_impuesto' => $tax,
      'ia_moneda' => $currency,
      'ia_factura_numero' => $invoice,
      'ia_tarjeta_ult4' => $cardLast4,
      'ia_metodo_pago' => $receiptPayment,
      'ia_invoice_fingerprint' => $this->expenseAiInvoiceFingerprint($merchant, $invoice),
      'ia_duplicate_of' => NULL,
      'ia_project_match' => $projectMatch,
      'ia_expected_projects' => $expected,
    ];
  }


}
