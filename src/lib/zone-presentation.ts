// ADT formats table amounts without decimals; the report and CSV retain cents.
// Keep the dollar prefix separate: this also preserves ADT's negative format.
export function zoneTableMoney(value: number) {
  return (
    "$" +
    Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })
  );
}
export function zoneTableTicket(value: number) {
  return value > 0 ? zoneTableMoney(value) : "-";
}
