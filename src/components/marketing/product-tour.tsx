"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { FileCheck2, ReceiptText, ArrowUpRight, X } from "lucide-react";
import styles from "./landing.module.css";

const screens = [
  {
    id: "facturas",
    title: "Facturas y pagos",
    icon: ReceiptText,
    heading: "Cada factura, con su estado y su saldo.",
    description:
      "Consulta importes, pagos registrados y saldos pendientes. Filtra por estado y conoce el cupo disponible de tu suscripción.",
    alt: "Pantalla real de Facturas de All Decor con filtros, cupo mensual y tabla de total, pagado, saldo y estado; datos ficticios.",
  },
  {
    id: "estimados",
    title: "Estimados",
    icon: FileCheck2,
    heading: "Tus propuestas, organizadas de principio a fin.",
    description:
      "Encuentra cada estimado por número, fecha o estado. Conserva sus revisiones y convierte su aprobación en una factura.",
    alt: "Pantalla real de Estimados de All Decor con filtros por fecha y estado, importes y revisiones; datos ficticios.",
  },
] as const;

export function ProductTour() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = screens[selected];
  return (
    <div className={styles.tour}>
      <div
        className={styles.tourTabs}
        role="tablist"
        aria-label="Pantallas de la aplicación"
      >
        {screens.map((screen, index) => (
          <button
            key={screen.id}
            type="button"
            role="tab"
            id={`tab-${screen.id}`}
            aria-controls={`panel-${screen.id}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? screens.length - 1
                    : (selected +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        screens.length) %
                      screens.length;
              setSelected(next);
              tabs.current[next]?.focus();
            }}
          >
            <screen.icon size={18} aria-hidden="true" />
            {screen.title}
          </button>
        ))}
      </div>
      {screens.map((screen, index) => (
        <div
          key={screen.id}
          id={`panel-${screen.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${screen.id}`}
          hidden={selected !== index}
          tabIndex={0}
        >
          <div className={styles.tourDescription}>
            <div>
              <h3>{screen.heading}</h3>
              <p>{screen.description}</p>
            </div>
            <button
              type="button"
              className={styles.textLink}
              onClick={() => dialog.current?.showModal()}
            >
              Ampliar captura <ArrowUpRight size={18} aria-hidden="true" />
            </button>
          </div>
          <Image
            src={`/images/landing/${screen.id}.jpg`}
            alt={screen.alt}
            width={1265}
            height={713}
            sizes="(max-width: 768px) 94vw, 1120px"
            className={styles.tourImage}
          />
        </div>
      ))}
      <p className={styles.demoCaption}>
        Capturas reales de la aplicación en el entorno de pruebas. Todos los
        datos mostrados son ficticios.
      </p>
      <dialog
        ref={dialog}
        className={styles.imageDialog}
        aria-label={`Captura de ${current.title}`}
      >
        <div className={styles.dialogHeader}>
          <strong>{current.title}</strong>
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
            aria-label="Cerrar captura"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <Image
          src={`/images/landing/${current.id}.jpg`}
          alt={current.alt}
          width={1265}
          height={713}
          sizes="95vw"
        />
        <p>Vista de demostración con datos ficticios.</p>
      </dialog>
    </div>
  );
}
