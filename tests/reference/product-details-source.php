<?php
namespace Drupal\adt_crm2026\Service;

/** Additive catalog metadata; no schema or estimate-total changes. */
final class ProductDetails {
  public static function normalize(array $input): array {
    $out = [];
    foreach (['sku'=>100, 'brand'=>120, 'model'=>120, 'description'=>6000, 'material'=>180, 'finish'=>180, 'warranty'=>1500, 'leadTime'=>180, 'includes'=>2000, 'care'=>1500] as $key=>$limit) {
      $value = $input[$key] ?? '';
      if (!is_scalar($value) && $value !== NULL) { throw new \InvalidArgumentException('Campo inválido: ' . $key); }
      $text = trim((string) $value);
      if (mb_strlen($text) > $limit) { throw new \InvalidArgumentException('El campo ' . $key . ' supera ' . $limit . ' caracteres.'); }
      $out[$key] = $text;
    }
    $out['dimensions'] = [];
    $dims = $input['dimensions'] ?? [];
    if (!is_array($dims)) { throw new \InvalidArgumentException('Las medidas no son válidas.'); }
    foreach (['length','width','height','thickness','weight'] as $key) {
      $v = $dims[$key] ?? '';
      if ($v !== '' && $v !== NULL && (!is_numeric($v) || !is_finite((float)$v) || (float)$v <= 0 || (float)$v > 1000000)) {
        throw new \InvalidArgumentException('Las medidas y el peso deben ser mayores que cero.');
      }
      $out['dimensions'][$key] = $v === '' || $v === NULL ? '' : (float)$v;
    }
    $out['dimensions']['unit'] = (string)($dims['unit'] ?? 'in');
    $out['dimensions']['weightUnit'] = (string)($dims['weightUnit'] ?? 'lb');
    if (!in_array($out['dimensions']['unit'], ['in','ft','mm','cm','m'], TRUE) || !in_array($out['dimensions']['weightUnit'], ['lb','kg'], TRUE)) {
      throw new \InvalidArgumentException('Selecciona una unidad válida.');
    }
    $out['images'] = [];
    $images = $input['images'] ?? [];
    if (!is_array($images) || count($images) > 6) { throw new \InvalidArgumentException('Puedes agregar hasta 6 imágenes.'); }
    $bytes = 0;
    foreach ($images as $image) {
      if (!is_string($image) || strlen($image) > 1600000 || !self::imageAllowed($image)) { throw new \InvalidArgumentException('Imagen inválida. Usa JPG, PNG, WebP o una URL HTTPS.'); }
      $bytes += strlen($image);
      if (!in_array($image, $out['images'], TRUE)) { $out['images'][] = $image; }
    }
    if ($bytes > 4000000) { throw new \InvalidArgumentException('La galería supera el tamaño permitido. Reduce las imágenes.'); }
    $out['version'] = 1;
    return $out;
  }

  public static function imageAllowed(string $image): bool {
    if (preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$~D', $image, $m)) {
      $data = base64_decode($m[2], TRUE);
      if ($data === FALSE) { return FALSE; }
      $info = @getimagesizefromstring($data);
      return $info !== FALSE && in_array($info['mime'], ['image/jpeg','image/png','image/webp'], TRUE);
    }
    if (preg_match('~^https://[^\s<>"\x00-\x1f]+$~D', $image) && filter_var($image, FILTER_VALIDATE_URL)) {
      return parse_url($image, PHP_URL_USER) === NULL && parse_url($image, PHP_URL_PASS) === NULL;
    }
    return preg_match('~^/(?:adt/|sites/default/files/)[^\s<>"\x00-\x1f]+$~D', $image) === 1;
  }

  public static function summary(array $d): string {
    $parts = [];
    if (!empty($d['description'])) { $parts[] = $d['description']; }
    foreach (['brand'=>'Marca', 'model'=>'Modelo', 'material'=>'Material', 'finish'=>'Acabado'] as $key=>$label) {
      if (!empty($d[$key])) { $parts[] = $label . ': ' . $d[$key]; }
    }
    $dims = $d['dimensions'] ?? [];
    foreach (['length'=>'Largo', 'width'=>'Ancho', 'height'=>'Alto', 'thickness'=>'Espesor'] as $key=>$label) {
      if (!empty($dims[$key])) { $parts[] = $label . ': ' . $dims[$key] . ' ' . ($dims['unit'] ?? 'in'); }
    }
    if (!empty($d['includes'])) { $parts[] = 'Incluye: ' . $d['includes']; }
    return implode(' · ', $parts);
  }
}
