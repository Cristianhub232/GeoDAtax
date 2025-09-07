"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RegionInfo } from "../data/regions";

type Props = {
  open: boolean;
  x: number; // coordenada relativa al contenedor
  y: number; // coordenada relativa al contenedor
  region: RegionInfo | null;
  onClose: () => void;
  imageSrc?: string;
  especiales: number;
  ordinarios: number;
  containerWidth: number;
  containerHeight: number;
};

export default function RegionPopup({ open, x, y, region, onClose, imageSrc, especiales, ordinarios, containerWidth, containerHeight }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [toCenter, setToCenter] = useState(false);

  // Ajuste para que la tarjeta no se salga del contenedor
  const { startLeft, startTop, endLeft, endTop, origin } = useMemo(() => {
    const CARD_W = 420;
    const CARD_H = 260;
    let px = x;
    let py = y;
    let ox: "left" | "right" = "left";
    let oy: "top" | "bottom" = "top";
    if (px + CARD_W > containerWidth) {
      px = Math.max(12, containerWidth - CARD_W - 12);
      ox = "right" as const;
    } else {
      px = Math.max(12, px);
    }
    if (py + CARD_H > containerHeight) {
      py = Math.max(12, containerHeight - CARD_H - 12);
      oy = "bottom" as const;
    } else {
      py = Math.max(12, py);
    }
    const centerLeft = Math.max(12, Math.floor((containerWidth - CARD_W) / 2));
    const centerTop = Math.max(12, Math.floor((containerHeight - CARD_H) / 2));
    return { startLeft: px, startTop: py, endLeft: centerLeft, endTop: centerTop, origin: `${oy} ${ox}` };
  }, [x, y, containerWidth, containerHeight]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  // Animación: empieza en cursor y se centra
  useEffect(() => {
    if (!open) {
      setToCenter(false);
      return;
    }
    const t = setTimeout(() => setToCenter(true), 20);
    return () => clearTimeout(t);
  }, [open, region]);

  if (!open || !region) return null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: open ? "auto" : "none" }}>
      {/* Clic fuera cierra */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0 }} />

      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Información de ${region.label}`}
        style={{
          position: "absolute",
          left: toCenter ? endLeft : startLeft,
          top: toCenter ? endTop : startTop,
          width: 420,
          minHeight: 260,
          background: "#ffffff",
          color: "#111",
          borderRadius: 16,
          border: "1px solid #e8e8e8",
          boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
          transformOrigin: origin,
          transform: "scale(1)",
          transition: "left .22s ease, top .22s ease, opacity .2s ease",
          animation: "rg-pop .12s ease-out",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado con colores SENIAT */}
        <div style={{ height: 6, width: "100%", display: "flex" }}>
          <div style={{ background: "#FA152D", flex: 1 }} />
          <div style={{ background: "#146FB4", flex: 1 }} />
        </div>

        {/* Media banner */}
        <div
          style={{
            position: "relative",
            height: 120,
            background: imageSrc ? "#000" : "#f6f6f8",
          }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="Imagen de gerencia"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : null}
          <button onClick={onClose} aria-label="Cerrar" style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", color: "#fff", border: 0, borderRadius: 8, fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "6px 10px" }}>×</button>
        </div>

        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>Gerencia</div>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25, wordBreak: "break-word" }}>{region.label}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Estados incluidos</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(region.states ?? ["Por asignar"]).map((s, i) => (
                <span key={i} style={{ background: "#f3f6ff", color: "#224488", border: "1px solid #e4ebff", borderRadius: 999, padding: "4px 8px", fontSize: 12 }}>{s}</span>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Metric label="Contribuyentes Especiales" value={especiales.toLocaleString()} />
            <Metric label="Contribuyentes Ordinarios" value={ordinarios.toLocaleString()} />
          </div>
        </div>

        {/* Pie con imágenes institucionales */}
        <div style={{ padding: 10, borderTop: "1px solid #efefef", background: "#fafbff" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <img
              src={"/seniat__1_-removebg-preview.png"}
              alt="SENIAT"
              style={{ display: "block", height: 40, objectFit: "contain" }}
            />
            <div style={{ width: 1, height: 26, background: "#dcdcdc" }} />
            <img
              src={"/Logo_basado_en_banner%20(1).png"}
              alt="Imagen institucional"
              style={{ display: "block", height: 40, objectFit: "contain", filter: "saturate(1.05)" }}
            />
          </div>
        </div>
      </div>

      <style>{`@keyframes rg-pop{0%{opacity:.0;transform:scale(.92)}100%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #efefef", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}


