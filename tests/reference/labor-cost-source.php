<?php
declare(strict_types=1);
namespace Drupal\adt_crm2026\Domain;

/** Pure preview model. Never records a payment, changes a punch or posts an expense. */
final class LaborCostModel {
  public const ADJUSTMENT_RATES = [
    'pergola_ft2' => 1000, 'kitchen_lf' => 10000,
    'privacy_ft2' => 500, 'composite_ft2' => 500,
    'plumbing' => 80000, 'electrical_subpanel' => 80000,
  ];

  /** Explicit measured scope only. The result is a budget, not an agreed expense. */
  public static function adjustmentBudget(array $scope): array {
    if (array_diff(array_keys($scope), array_keys(self::ADJUSTMENT_RATES))) {
      throw new \InvalidArgumentException('Unknown labor scope');
    }
    $lines = [];
    foreach (self::ADJUSTMENT_RATES as $key => $rate) {
      $quantity = $scope[$key] ?? 0;
      if (in_array($key, ['plumbing', 'electrical_subpanel'], TRUE)) {
        if (!is_bool($quantity) && $quantity !== 0 && $quantity !== 1) {
          throw new \InvalidArgumentException('Fixed service must be explicitly included or excluded');
        }
        $hundredths = $quantity ? 100 : 0;
      } else {
        if (!preg_match('/^\d{1,8}(?:\.\d{1,2})?$/D', (string) $quantity)) {
          throw new \InvalidArgumentException('Quantity must be non-negative with at most two decimal places');
        }
        $parts = explode('.', (string) $quantity);
        $hundredths = (int) $parts[0] * 100 + (int) str_pad($parts[1] ?? '', 2, '0');
      }
      if (!$hundredths) { continue; }
      $lines[] = ['scope' => $key, 'quantityHundredths' => $hundredths,
        'rateCents' => $rate, 'amountCents' => intdiv($hundredths * $rate + 50, 100)];
    }
    return ['state' => 'BUDGET_ONLY', 'lines' => $lines,
      'amountCents' => array_sum(array_column($lines, 'amountCents'))];
  }

  /**
   * Rules use immutable worker/project IDs, not names or current team membership.
   * Project mode: day, adjustment, or absent (requires review).
   * Adjustment: id, workerId, amountCents, estimateId, revision; scope is whole crew.
   * Rates: workerId => [{from, to(optional), cents}], with non-overlapping dates.
   * No guessed rate, adjustment amount, historic mode, or cross-project day split.
   */
  public static function preview(array $entries, array $rates, array $projects,
    array $adjustments, string $splitRule = 'review'): array {
    if (!in_array($splitRule, ['review', 'minutes'], TRUE)) {
      throw new \InvalidArgumentException('Invalid split rule');
    }
    $costs = []; $attendance = []; $pending = []; $days = []; $seen = [];
    $agreementIds = [];
    foreach ($projects as $pid => $project) {
      if (!in_array($project['mode'] ?? '', ['day', 'adjustment'], TRUE)) {
        throw new \InvalidArgumentException('Invalid project labor mode');
      }
      if (($project['mode'] ?? '') !== 'adjustment') { continue; }
      $agreement = $adjustments[$pid] ?? NULL;
      if (!$agreement || !isset($agreement['amountCents']) ||
        !is_int($agreement['amountCents']) || $agreement['amountCents'] <= 0 ||
        empty($agreement['id']) || empty($agreement['workerId']) ||
        empty($agreement['estimateId']) || empty($agreement['revision'])) {
        $pending[] = ['projectId' => (string) $pid, 'reason' => 'ADJUSTMENT_SNAPSHOT_REQUIRED'];
        continue;
      }
      if (isset($agreementIds[$agreement['id']])) {
        throw new \InvalidArgumentException('Agreement assigned to multiple projects');
      }
      $agreementIds[$agreement['id']] = TRUE;
      $costs[] = ['id' => 'labor_adjustment_' . $agreement['id'], 'kind' => 'ADJUSTMENT',
        'projectId' => (string) $pid, 'workerId' => $agreement['workerId'],
        'amountCents' => $agreement['amountCents'], 'estimateId' => $agreement['estimateId'],
        'revision' => $agreement['revision'], 'crewIncluded' => TRUE];
    }
    foreach ($entries as $entry) {
      $eid = (string) ($entry['external_id'] ?? '');
      if ($eid === '') { throw new \InvalidArgumentException('Missing entry ID'); }
      $fingerprint = hash('sha256', json_encode($entry, JSON_THROW_ON_ERROR));
      if (isset($seen[$eid])) {
        if ($seen[$eid] !== $fingerprint) { throw new \InvalidArgumentException('Conflicting duplicate entry'); }
        continue;
      }
      $seen[$eid] = $fingerprint;
      if (strtolower((string) ($entry['status'] ?? '')) === 'void') { continue; }
      $wid = (string) ($entry['worker_id'] ?? '');
      $pid = (string) ($entry['project_external_id'] ?? '');
      $ci = (int) ($entry['clock_in'] ?? 0); $co = (int) ($entry['clock_out'] ?? 0);
      if ($ci <= 0 || $wid === '') {
        $pending[] = ['entryId' => $eid, 'reason' => 'INVALID_ENTRY']; continue;
      }
      $date = (new \DateTimeImmutable('@' . $ci))->setTimezone(new \DateTimeZone('America/New_York'))->format('Y-m-d');
      $mode = $projects[$pid]['mode'] ?? 'review';
      $key = json_encode([$wid, $date], JSON_THROW_ON_ERROR);
      $days[$key] ??= ['workerId' => $wid, 'date' => $date, 'projects' => [], 'blocked' => FALSE];
      $days[$key]['projects'][$pid] ??= ['minutes' => 0, 'mode' => $mode, 'sources' => []];
      $days[$key]['projects'][$pid]['sources'][] = $eid;
      $valid = strtolower((string) ($entry['status'] ?? '')) === 'closed' && $co > $ci &&
        strtoupper((string) ($entry['review_status'] ?? '')) !== 'NEEDS_REVIEW' &&
        strtoupper((string) ($entry['req_status'] ?? '')) !== 'PENDING';
      $minutes = (int) ($entry['minutes'] ?? 0);
      if ($valid && $minutes <= 0) { $minutes = (int) round(($co - $ci) / 60); }
      if (!$valid || $minutes <= 0) {
        $pending[] = ['entryId' => $eid, 'projectId' => $pid, 'workerId'=>$wid, 'date'=>$date, 'reason' => 'SHIFT_REVIEW_REQUIRED'];
        $days[$key]['blocked'] = TRUE;
      } else {
        $days[$key]['projects'][$pid]['minutes'] += $minutes;
      }
      $attendance[] = ['entryId' => $eid, 'workerId' => $wid, 'projectId' => $pid,
        'date' => $date, 'minutes' => $valid ? $minutes : NULL,
        'mode' => $mode, 'paidBy' => $mode === 'adjustment' ? ($adjustments[$pid]['workerId'] ?? NULL) : NULL,
        'includedInAdjustment' => $mode === 'adjustment'];
    }
    ksort($days);
    foreach ($days as $day) {
      $parts = $day['projects']; ksort($parts);
      $dayParts = array_filter($parts, fn($p) => $p['mode'] !== 'adjustment');
      if (!$dayParts) { continue; } // Entire crew is paid from the contractor's adjustment.
      $ref = ['workerId' => $day['workerId'], 'date' => $day['date']];
      if ($day['blocked']) { continue; }
      if (array_filter($parts, fn($p) => $p['mode'] === 'review')) {
        $pending[] = $ref + ['reason' => 'PROJECT_MODE_REQUIRED']; continue;
      }
      if (count($parts) > 1 && $splitRule !== 'minutes') {
        $pending[] = $ref + ['reason' => 'SHARED_DAY_RULE_REQUIRED']; continue;
      }
      $matches = array_values(array_filter($rates[$day['workerId']] ?? [],
        fn($r) => isset($r['from']) && $r['from'] <= $day['date'] &&
          (empty($r['to']) || $r['to'] >= $day['date'])));
      if (count($matches) !== 1 || !is_int($matches[0]['cents']) || $matches[0]['cents'] <= 0) {
        $pending[] = $ref + ['reason' => 'DATED_DAILY_RATE_REQUIRED']; continue;
      }
      $rate = $matches[0]['cents'];
      $allocations = self::split($rate, array_map(fn($p) => $p['minutes'], $parts));
      foreach ($parts as $pid => $part) {
        if ($part['mode'] === 'adjustment') { continue; }
        sort($part['sources']);
        $costs[] = $ref + ['id' => 'labor_day_' . substr(hash('sha256', json_encode([$day['workerId'], $day['date'], (string) $pid])),0,32),
          'kind' => 'DAILY', 'projectId' => (string) $pid, 'rateCents' => $rate,
          'amountCents' => $allocations[$pid], 'sources' => $part['sources']];
      }
    }
    usort($costs, fn($a, $b) => strcmp($a['id'], $b['id']));
    return ['costs' => $costs, 'attendance' => $attendance, 'pending' => $pending,
      'knownCostCents' => array_sum(array_column($costs, 'amountCents')),
      'complete' => !$pending, 'posted' => FALSE];
  }

  /** Allocate cents deterministically. All project parts sum to one daily wage. */
  private static function split(int $total, array $weights): array {
    $sum = array_sum($weights);
    if ($sum <= 0) { throw new \InvalidArgumentException('Invalid work duration'); }
    ksort($weights); $out = []; $remainders = [];
    foreach ($weights as $key => $weight) {
      $out[$key] = intdiv($total * $weight, $sum);
      $remainders[$key] = ($total * $weight) % $sum;
    }
    arsort($remainders, SORT_NUMERIC);
    $remaining = $total - array_sum($out);
    foreach ($remainders as $key => $_) { if ($remaining-- <= 0) { break; } $out[$key]++; }
    return $out;
  }
}
