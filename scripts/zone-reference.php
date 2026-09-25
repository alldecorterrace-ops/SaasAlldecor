<?php
/**
 * Execute only the map calculation extracted from a supplied ADT controller.
 * Usage: php scripts/zone-reference.php controller.php fixtures.json SHA256
 * No Drupal bootstrap, database connection, persistent write, mail or geocoding.
 * The controller is trusted executable code: verify its hash before extraction.
 */
namespace Symfony\Component\HttpFoundation {
    class JsonResponse {
        private $data;
        public function __construct($data) { $this->data = $data; }
        public function getContent() {
            return json_encode($this->data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        }
    }
}

namespace {
    class Drupal {
        public static $tables;
        public static function database() { return new ZoneFixtureDatabase(); }
    }
    class ZoneFixtureDatabase {
        public function select($table, $alias) { return new ZoneFixtureQuery($table); }
    }
    class ZoneFixtureQuery {
        private $table;
        public function __construct($table) { $this->table = $table; }
        public function fields($alias, $fields) { return $this; }
        public function execute() { return $this; }
        public function fetchAll($mode) { return Drupal::$tables[$this->table] ?? []; }
    }
    if ($argc !== 4 || !preg_match('/^[a-f0-9]{64}$/', $argv[3])) {
        fwrite(STDERR, "Expected: controller.php fixtures.json SHA256\n"); exit(2);
    }
    $source = file_get_contents($argv[1]);
    if ($source === false || !hash_equals($argv[3], hash('sha256', $source))) {
        fwrite(STDERR, "Source hash mismatch; inspect the source before running.\n"); exit(2);
    }
    $start = strpos($source, '  public function mapaZip(');
    $end = strpos($source, '  public function campoGeoDist(');
    if ($start === false || $end === false || $end <= $start) {
        fwrite(STDERR, "Map calculation boundaries not found.\n"); exit(2);
    }
    $methods = substr($source, $start, $end - $start);
    eval('class AdtZoneReference {public $leads; function leadMetaEnsure() {} '
        . 'function leadsBase() {return new \\Symfony\\Component\\HttpFoundation\\JsonResponse(["data"=>$this->leads]);}'
        . $methods . '}');
    $cases = json_decode(file_get_contents($argv[2]), true, 512, JSON_THROW_ON_ERROR);
    $results = [];
    foreach ($cases as $case) {
        $s = $case['source'];
        Drupal::$tables = [
            'adt_crm_geozip' => $s['postalCenters'],
            'adt_crm_invoice' => $s['invoices'],
            'adt_crm_client' => $s['customers'],
            'adt_crm_lead_meta' => $s['leadStatuses'],
        ];
        $reference = new AdtZoneReference();
        $reference->leads = $s['webformLeads'];
        $results[] = ['name' => $case['name'], 'result' => json_decode(
            $reference->mapaZonas([])->getContent(), true, 512, JSON_THROW_ON_ERROR
        )];
    }
    echo json_encode([
        'source_sha256' => hash('sha256', $source),
        'method_sha256' => hash('sha256', $methods),
        'cases' => $results,
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE) . "\n";
}
