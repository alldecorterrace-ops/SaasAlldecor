import Link from "next/link";
import { Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({
  href = "/",
  light = false,
  className,
}: {
  href?: string;
  light?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("brand", light && "brand-light", className)}
      aria-label="All Decor · Inicio"
    >
      <span className="brand-mark">
        <Layers3 size={21} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span>
        all decor
        <span className={light ? "text-indigo-200" : "text-primary"}>.</span>
      </span>
    </Link>
  );
}
