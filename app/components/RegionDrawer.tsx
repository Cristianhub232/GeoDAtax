"use client";

import { useEffect, useRef } from "react";
import type { RegionInfo } from "../data/regions";

type Props = {
  open: boolean;
  region: RegionInfo | null;
  onClose: () => void;
  onSubmit: (payload: FormData) => void;
};

export default function RegionDrawer({ open, region, onClose, onSubmit }: Props) {
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstFieldRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSubmit(fd);
  };

  return (
    <div
      aria-hidden={!open}
      role="dialog"
      aria-label="Información de Gerencia"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: open ? "auto" : "none",
        zIndex: 50,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: open ? "rgba(0,0,0,0.25)" : "transparent",
          transition: "background .2s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 92vw)",
          background: "#fff",
          color: "#111",
          boxShadow: "-8px 0 20px rgba(0,0,0,0.12)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform .25s ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottom: "1px solid #eee" }}>
          <div>
            <div style={{ fontSize: 14, opacity: 0.7 }}>Gerencia</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{region?.label ?? "Sin selección"}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: "transparent", border: 0, fontSize: 22, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 16, overflow: "auto" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13 }}>Gerencia</span>
              <input ref={firstFieldRef} value={region?.label ?? ""} readOnly style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13 }}>RIF</span>
              <input name="rif" placeholder="J-00000000-0" required minLength={10} maxLength={15} style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13 }}>Razón social</span>
              <input name="razon" placeholder="Empresa C.A." required style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13 }}>Teléfono</span>
              <input name="telefono" placeholder="0412-0000000" inputMode="tel" style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13 }}>Email</span>
              <input name="email" type="email" placeholder="correo@dominio.com" style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13 }}>Dirección</span>
              <textarea name="direccion" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13 }}>Observaciones</span>
              <textarea name="obs" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 16 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancelar</button>
            <button type="submit" style={btnPrimary}>Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "#0a66c2",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "#f2f2f2",
  color: "#111",
  border: 0,
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
};


