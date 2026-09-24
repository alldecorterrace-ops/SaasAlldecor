// PT409 is a terminal business conflict. Keep legacy 40001 readable while
// environments roll forward; never deliberately raise it for a stale edit.
export function isRecordConflict(code?: string) {
  return code === "PT409" || code === "40001";
}
