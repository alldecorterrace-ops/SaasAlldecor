"use client";
import { Button } from "./ui/button";
export function PrintButton() {
  return <Button onClick={() => window.print()}>Imprimir / guardar PDF</Button>;
}
