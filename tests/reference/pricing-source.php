<?php
// Frozen pure portions of the ADT pricing controller. No state, credentials or HTTP access.
final class PricingSource {
  private const PROV = [
    'Classic Metals', 'Florida Aluminum (FAS)', 'V&C', 'Luces Poliled', 'Home Depot',
    'American Fasteners', 'Brazilian Lumber', 'Jegam Stones', 'Above Ground (Blaze)', '— servicio —',
  ];
  private const REGLAS = [
    'por proyecto', 'por área de techo', 'por área de pared', 'por área de piedra', 'por panel',
    'por viga/columna', 'por ft lineal', 'cada 2 ft (lado mayor)', 'por perímetro ÷ 20', 'por perímetro ÷ 24',
    'manual (cliente)', 'según diseño',
  ];
  private const UNIDADES = ['$/ft', '$/ft²', 'c/u', 'losa', 'corte', 'lote', 'rollo', 'caja', 'tornillo', 'panel', 'tramo', 'saco', 'ft', 'ft²'];
  private const COLORS = ['Bronce', 'Blanco', 'Mil finish', 'White stucco', 'KWILA (madera)', 'CARPINO (madera)'];
  private const AREAS = ['techo' => 'Techo', 'estructura' => 'Estructura', 'pared' => 'Pared decorativa', 'cocina' => 'Cocina'];

  /** Partidas reales del configurador agrupadas por área (para los márgenes). */
  private const AREA_KEYS = [
    'techo' => ['techo', 'canal', 'fascia', 'composite_mad'],
    'estructura' => ['estructura', 'cimentacion', 'herraje', 'torn'],
    'pared' => ['pared'],
    'cocina' => ['cocina', 'equipos'],
  ];

  /** Etiqueta legible de cada partida del configurador. */
  private const KEY_LABEL = [
    'techo' => 'Techo (paneles)', 'canal' => 'Canal', 'fascia' => 'Fascia', 'composite_mad' => 'Composite madera',
    'estructura' => 'Estructura aluminio', 'cimentacion' => 'Cimentación', 'herraje' => 'Herraje', 'torn' => 'Tornillería',
    'pared' => 'Pared decorativa',
    'cocina' => 'Cocina (estructura + piedra)', 'equipos' => 'Equipos (Blaze)',
  ];

  private function defaults(): array {
    return [
      // General (fluye al configurador).
      'markup' => 0.75, 'markupProducto' => 1, 'overhead' => 3500, 'permisoCosto' => 3200,
      'diaTrabajoExtra' => 400, 'columnasBase' => 4,
      // Margen de ganancia por área (fluye al configurador como markups por partida).
      'margenArea' => ['techo' => 0.75, 'estructura' => 0.75, 'pared' => 0.75, 'cocina' => 1.0],
      // Override de margen por partida específica (vacío = hereda el del área).
      'markupsOverride' => [],
      // TARIFAS DE PRECIO AL CLIENTE (modelo $/ft² top-down). El precio al cliente
      // = área × tarifa. El cálculo por componentes queda solo para costo/materiales.
      'tarifas' => [
        'pergolaBlanco' => 45,      // $/ft² techo blanco económico
        'pergolaCert' => 55,        // $/ft² techo certificado
        'pergolaComposite' => 65,   // $/ft² techo composite
        'paredPanel' => 25,         // $/ft² pared panel con tablitas
        'paredComposite' => 30,     // $/ft² pared composite
        'cocinaPorFt' => 900,       // $/ft lineal (cocina + isla)
        'equiposMargen' => 0.20,    // equipos = costo × (1 + margen)
        'permisoFijo' => 3200,      // permiso fijo si área ≤ umbral
        'permisoUmbralFt2' => 620,  // sobre este área, permiso = $/ft²
        'permisoPorFt2' => 5,       // $/ft² de permiso cuando área > umbral
        'heavyPorPieza' => 1000,    // material 1/4": $ por cada viga + columna
      ],
      'capa2' => ['demanda' => 0.15, 'demandaUmbral' => 6, 'zonaDefault' => 0.1, 'zonaFueraMiami' => 0.3, 'zonaFueraFL' => 0.5],
      // Catálogo de perfiles (fluye al configurador → CAT).
      'catalogo' => [
        ['medida' => '6x6', 'calibre' => '0.125', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 24, 'precio' => 518.77],
        ['medida' => '6x6', 'calibre' => '0.125', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 30, 'precio' => 648.47],
        ['medida' => '7x7', 'calibre' => '0.139', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 12, 'precio' => 232.56],
        ['medida' => '8x8', 'calibre' => '0.148', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 24, 'precio' => 752.85],
        ['medida' => '3x6', 'calibre' => '0.125', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 24, 'precio' => 357],
        ['medida' => '2x6', 'calibre' => '0.125', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 24, 'precio' => 328.73],
        ['medida' => '2x5', 'calibre' => '0.088', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 24, 'precio' => 233.1],
        ['medida' => '4x10', 'calibre' => '0.187', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 24, 'precio' => 831.19],
        ['medida' => '4x12', 'calibre' => '0.187', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 24, 'precio' => 962.52],
        ['medida' => '6x8', 'calibre' => '0.187', 'color' => 'Bronce', 'proveedor' => 'Classic Metals', 'largo' => 24, 'precio' => 781.5],
      ],
      // Componentes por área (Fase 2).
      'componentes' => [
        'techo' => [
          ['nombre' => 'Panel aislado certificado', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'por área de techo', 'cant' => '', 'unidad' => '$/ft²', 'precio' => 6.75, 'detalle' => 'premium'],
          ['nombre' => 'Panel aislado económico', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'por área de techo', 'cant' => '', 'unidad' => '$/ft²', 'precio' => 3.62, 'detalle' => 'blanco'],
          ['nombre' => 'Luz (foco)', 'tipo' => 'material', 'proveedor' => 'Luces Poliled', 'regla' => 'manual (cliente)', 'cant' => '', 'unidad' => 'c/u', 'precio' => 50, 'detalle' => ''],
          ['nombre' => "Tira LED 8'", 'tipo' => 'material', 'proveedor' => 'Luces Poliled', 'regla' => 'manual (cliente)', 'cant' => '', 'unidad' => 'c/u', 'precio' => 69, 'detalle' => ''],
          ['nombre' => 'Ventilador', 'tipo' => 'material', 'proveedor' => 'Luces Poliled', 'regla' => 'manual (cliente)', 'cant' => '', 'unidad' => 'c/u', 'precio' => 75, 'detalle' => ''],
          ['nombre' => 'Cable eléctrico 14.2', 'tipo' => 'material', 'proveedor' => 'Home Depot', 'regla' => 'por proyecto', 'cant' => 1, 'unidad' => 'rollo', 'precio' => '', 'detalle' => ''],
          ['nombre' => 'Composite', 'tipo' => 'material', 'proveedor' => 'Brazilian Lumber', 'regla' => 'por área de techo', 'cant' => '', 'unidad' => '$/ft²', 'precio' => 3.62, 'detalle' => ''],
          ['nombre' => 'Coking (impermeabilizar)', 'tipo' => 'material', 'proveedor' => 'American Fasteners', 'regla' => 'por proyecto', 'cant' => 1, 'unidad' => 'caja', 'precio' => '', 'detalle' => ''],
          ['nombre' => 'Tornillos de panel', 'tipo' => 'material', 'proveedor' => 'American Fasteners', 'regla' => 'por panel', 'cant' => 8, 'unidad' => 'tornillo', 'precio' => '', 'detalle' => '8 por panel'],
          ['nombre' => 'Viga 2x4 mill finish', 'tipo' => 'material', 'proveedor' => 'V&C', 'regla' => 'cada 2 ft (lado mayor)', 'cant' => '', 'unidad' => 'tramo', 'precio' => 177.97, 'detalle' => 'solo composite · viene 24ft, corte a lado menor'],
          ['nombre' => 'Angular 1x1 (composite)', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'por perímetro ÷ 20', 'cant' => '', 'unidad' => 'tramo', 'precio' => '', 'detalle' => 'solo composite · 20ft · color = aluminio'],
          ['nombre' => 'Canal (e-gutter)', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'según diseño', 'cant' => '', 'unidad' => 'tramo', 'precio' => '', 'detalle' => ''],
          ['nombre' => 'Fascia', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'según diseño', 'cant' => '', 'unidad' => 'tramo', 'precio' => '', 'detalle' => '25ft'],
        ],
        'estructura' => [
          ['nombre' => 'Tornillos estructura', 'tipo' => 'material', 'proveedor' => 'American Fasteners', 'regla' => 'por viga/columna', 'cant' => 15, 'unidad' => 'tornillo', 'precio' => '', 'detalle' => '15 por pieza'],
          ['nombre' => 'Angular 3x3 1/4" 20ft', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'por proyecto', 'cant' => 1, 'unidad' => 'tramo', 'precio' => 240, 'detalle' => ''],
          ['nombre' => 'End cap', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'por viga/columna', 'cant' => 1, 'unidad' => 'c/u', 'precio' => '', 'detalle' => 'tapa base · 1 por columna'],
          ['nombre' => 'Cemento cimentación', 'tipo' => 'material', 'proveedor' => 'Home Depot', 'regla' => 'por proyecto', 'cant' => 6, 'unidad' => 'saco', 'precio' => 5, 'detalle' => '6 sacos por hueco'],
        ],
        'pared' => [
          ['nombre' => 'U channel', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'por ft lineal', 'cant' => '', 'unidad' => '$/ft', 'precio' => 3.19, 'detalle' => ''],
          ['nombre' => 'Paneles económicos', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'por área de pared', 'cant' => '', 'unidad' => '$/ft²', 'precio' => 3.62, 'detalle' => ''],
          ['nombre' => 'Composite', 'tipo' => 'material', 'proveedor' => 'Brazilian Lumber', 'regla' => 'por área de pared', 'cant' => '', 'unidad' => '$/ft²', 'precio' => 3.62, 'detalle' => ''],
        ],
        'cocina' => [
          ['nombre' => 'Estructura aluminio', 'tipo' => 'material', 'proveedor' => 'Classic Metals', 'regla' => 'por ft lineal', 'cant' => '', 'unidad' => '$/ft', 'precio' => 22.92, 'detalle' => ''],
          ['nombre' => 'Durock', 'tipo' => 'material', 'proveedor' => 'Home Depot', 'regla' => 'por ft lineal', 'cant' => '', 'unidad' => '$/ft', 'precio' => 7.29, 'detalle' => ''],
          ['nombre' => 'Composite', 'tipo' => 'material', 'proveedor' => 'Brazilian Lumber', 'regla' => 'por ft lineal', 'cant' => '', 'unidad' => '$/ft', 'precio' => '', 'detalle' => ''],
          ['nombre' => 'Piedra / encimera', 'tipo' => 'material', 'proveedor' => 'Jegam Stones', 'regla' => 'por área de piedra', 'cant' => 1, 'unidad' => 'losa', 'precio' => 1300, 'detalle' => ''],
          ['nombre' => 'Labor de piedra', 'tipo' => 'servicio', 'proveedor' => '— servicio —', 'regla' => 'por área de piedra', 'cant' => 1, 'unidad' => 'corte', 'precio' => 20, 'detalle' => ''],
          ['nombre' => 'Mano de obra', 'tipo' => 'servicio', 'proveedor' => '— servicio —', 'regla' => 'por proyecto', 'cant' => 1, 'unidad' => 'lote', 'precio' => 2000, 'detalle' => ''],
          ['nombre' => 'Equipos (grill, plancha…)', 'tipo' => 'material', 'proveedor' => 'Above Ground (Blaze)', 'regla' => 'manual (cliente)', 'cant' => '', 'unidad' => 'c/u', 'precio' => '', 'detalle' => 'el cliente elige'],
          ['nombre' => 'Concreto', 'tipo' => 'material', 'proveedor' => 'Home Depot', 'regla' => 'por proyecto', 'cant' => 1, 'unidad' => 'lote', 'precio' => '', 'detalle' => ''],
        ],
      ],
    ];
  }

  public function effective(array $saved): array {
    $s = $saved;
    $s = is_array($s) ? $s : [];
    $d = $this->defaults();
    // catalogo y overrides se reemplazan completos (no se fusionan).
    foreach (['catalogo', 'markupsOverride'] as $k) {
      if (isset($s[$k])) {
        $d[$k] = $s[$k];
        unset($s[$k]);
      }
    }
    // componentes: conservar lo guardado por el usuario + AGREGAR los componentes nuevos
    // de defaults que falten (match por nombre). Así no se pierden precios ya trabajados
    // pero aparecen los componentes nuevos al actualizar el código.
    if (isset($s['componentes']) && is_array($s['componentes'])) {
      $merged = $s['componentes'];
      foreach ($d['componentes'] as $area => $rows) {
        $have = [];
        foreach (($merged[$area] ?? []) as $r) {
          $have[] = mb_strtolower(trim((string) ($r['nombre'] ?? '')));
        }
        foreach ($rows as $r) {
          if (!in_array(mb_strtolower(trim((string) ($r['nombre'] ?? ''))), $have, TRUE)) {
            $merged[$area][] = $r;
          }
        }
      }
      $d['componentes'] = $merged;
      unset($s['componentes']);
    }
    $d = $this->deep($d, $s);
    // Resolver markups por partida: override por partida > margen del área.
    $resolved = [];
    foreach (self::AREA_KEYS as $area => $keys) {
      $am = $d['margenArea'][$area] ?? NULL;
      foreach ($keys as $key) {
        $ov = $d['markupsOverride'][$key] ?? NULL;
        if ($ov !== NULL && $ov !== '') {
          $resolved[$key] = (float) $ov;
        }
        elseif ($am !== NULL) {
          $resolved[$key] = (float) $am;
        }
      }
    }
    $d['markups'] = $resolved;
    return $d;
  }

  private function deep(array $a, array $b): array {
    foreach ($b as $k => $v) {
      $a[$k] = (is_array($v) && isset($a[$k]) && is_array($a[$k])) ? $this->deep($a[$k], $v) : $v;
    }
    return $a;
  }

  public function ratesFromComponentes(array $e): array {
    $comp = $e['componentes'] ?? [];
    $find = function (string $area, string $needle) use ($comp): ?float {
      foreach (($comp[$area] ?? []) as $c) {
        if (mb_stripos((string) ($c['nombre'] ?? ''), $needle) !== FALSE) {
          $p = $c['precio'] ?? '';
          return is_numeric($p) ? (float) $p : NULL;
        }
      }
      return NULL;
    };
    $ov = [];
    // Luces (techo).
    if (($v = $find('techo', 'foco')) !== NULL) { $ov['foco'] = $v; }
    if (($v = $find('techo', 'LED')) !== NULL) { $ov['led8'] = $v; }
    if (($v = $find('techo', 'Ventilador')) !== NULL) { $ov['fan'] = $v; }
    // Cemento (estructura → cimentación).
    if (($v = $find('estructura', 'Cemento')) !== NULL) { $ov['saco'] = $v; }
    // Paneles de techo (PANELES.*.ft2).
    $paneles = [];
    if (($v = $find('techo', 'certificado')) !== NULL) { $paneles['certificado'] = ['ft2' => $v]; }
    if (($v = $find('techo', 'económico')) !== NULL) { $paneles['economico'] = ['ft2' => $v]; }
    // NOTA: el composite imitación-madera usa el MISMO costo/ft² que el panel económico
    // (el motor fuerza PANELES.madera = PANELES.economico). Por eso no se mapea aquí:
    // edita "Panel aislado económico" para cambiar también el costo del composite.
    if ($paneles) { $ov['PANELES'] = $paneles; }
    // Cocina (RATES.cocina.*).
    $cocina = [];
    if (($v = $find('cocina', 'aluminio')) !== NULL) { $cocina['aluminioPorFt'] = $v; }
    if (($v = $find('cocina', 'Durock')) !== NULL) { $cocina['durockPorFt'] = $v; }
    if (($v = $find('cocina', 'Piedra')) !== NULL) { $cocina['piedraCosto'] = $v; }
    if (($v = $find('cocina', 'Labor de piedra')) !== NULL) { $cocina['cortadorGranito'] = $v; }
    if (($v = $find('cocina', 'Mano de obra')) !== NULL) { $cocina['managerFijo'] = $v; }
    if ($cocina) { $ov['cocina'] = $cocina; }
    // Tarifas de precio al cliente ($/ft²) → fluyen a RATES.tarifas para el motor.
    if (!empty($e['tarifas']) && is_array($e['tarifas'])) {
      $ov['tarifas'] = $e['tarifas'];
    }
    return $ov;
  }

  public function capture(array $f): array {
    $p = $f['p'] ?? [];
    $c2 = $f['c2'] ?? [];
    $cat = $f['cat'] ?? [];
    $comp = $f['comp'] ?? [];
    $ma = $f['ma'] ?? [];
    $mk = $f['mk'] ?? [];
    $num = fn($v) => is_numeric($v) ? (float) $v : NULL;

    $out = [];
    foreach ((array) $p as $k => $v) {
      if (($n = $num($v)) !== NULL) {
        $out[$k] = $n;
      }
    }
    foreach (['markup', 'markupProducto'] as $k) {
      if (isset($out[$k])) {
        $out[$k] = $out[$k] / 100;
      }
    }
    foreach ((array) $c2 as $k => $v) {
      if (($n = $num($v)) !== NULL) {
        $out['capa2'][$k] = in_array($k, ['demanda', 'zonaDefault', 'zonaFueraMiami', 'zonaFueraFL'], TRUE) ? $n / 100 : $n;
      }
    }
    // Catálogo de perfiles.
    $catalogo = [];
    foreach ((array) $cat as $row) {
      $medida = trim((string) ($row['medida'] ?? ''));
      $precio = $num($row['precio'] ?? NULL);
      if ($medida === '' && $precio === NULL) {
        continue;
      }
      $catalogo[] = [
        'medida' => mb_substr($medida, 0, 32),
        'calibre' => mb_substr(trim((string) ($row['calibre'] ?? '')), 0, 16),
        'color' => mb_substr(trim((string) ($row['color'] ?? '')), 0, 40),
        'proveedor' => mb_substr(trim((string) ($row['proveedor'] ?? '')), 0, 60),
        'largo' => $num($row['largo'] ?? NULL),
        'precio' => $precio,
      ];
    }
    $out['catalogo'] = $catalogo;
    // Componentes por área.
    $componentes = [];
    foreach (array_keys(self::AREAS) as $area) {
      $componentes[$area] = [];
      foreach ((array) ($comp[$area] ?? []) as $row) {
        $nombre = trim((string) ($row['nombre'] ?? ''));
        if ($nombre === '') {
          continue;
        }
        $componentes[$area][] = [
          'nombre' => mb_substr($nombre, 0, 60),
          'tipo' => ($row['tipo'] ?? 'material') === 'servicio' ? 'servicio' : 'material',
          'proveedor' => mb_substr(trim((string) ($row['proveedor'] ?? '')), 0, 60),
          'regla' => mb_substr(trim((string) ($row['regla'] ?? '')), 0, 40),
          'cant' => $num($row['cant'] ?? NULL),
          'unidad' => mb_substr(trim((string) ($row['unidad'] ?? '')), 0, 16),
          'precio' => $num($row['precio'] ?? NULL),
          'detalle' => mb_substr(trim((string) ($row['detalle'] ?? '')), 0, 120),
        ];
      }
    }
    $out['componentes'] = $componentes;

    // Margen por área (%) → decimal.
    $out['margenArea'] = [];
    foreach (array_keys(self::AREA_KEYS) as $area) {
      if (($n = $num($ma[$area] ?? NULL)) !== NULL) {
        $out['margenArea'][$area] = $n / 100;
      }
    }
    // Override de margen por partida (%) → decimal; vacío = no override.
    $out['markupsOverride'] = [];
    foreach ((array) $mk as $key => $v) {
      if (is_numeric($v) && trim((string) $v) !== '') {
        $out['markupsOverride'][$key] = ((float) $v) / 100;
      }
    }
    // Tarifas de precio al cliente.
    $tar = $f['tar'] ?? [];
    $out['tarifas'] = [];
    foreach ((array) $tar as $key => $v) {
      if (is_numeric($v) && trim((string) $v) !== '') {
        $out['tarifas'][$key] = ($key === 'equiposMargen') ? (((float) $v) / 100) : (float) $v;
      }
    }

    return $out;
  }
  public function defaultPayload(): array { return $this->defaults(); }
}
