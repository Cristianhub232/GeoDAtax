"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RegionPopup from "./RegionPopup";
import type { RegionInfo } from "../data/regions";
import { resolveRegionByColor, REGIONS, colorDistance } from "../data/regions";

/**
 * Renderiza el SVG del mapa de Venezuela de `public/file.svg` de forma inline
 * para permitir un efecto de spotlight (resaltar la sección bajo el cursor)
 * usando mask + clipPath dentro del propio SVG. El SVG ocupa el ancho del
 * navegador y mantiene proporción.
 */
export default function InteractiveMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Offscreen para rasterizar el SVG y poder leer colores por píxel
  const rasterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rasterCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const viewBoxRef = useRef<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 1088, h: 960 });
  const colorMaskCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clickAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedKeyRef = useRef<string | null>(null);
  const lastPlayTsRef = useRef<number>(0);
  const [selectedRegion, setSelectedRegion] = useState<RegionInfo | null>(null);
  const [popupOpen, setPopupOpen] = useState<boolean>(false);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    // Preferencia de sonido persistida
    try {
      const saved = localStorage.getItem("interactive-map:soundEnabled");
      if (saved !== null) setSoundEnabled(saved === "1");
    } catch {}

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/file.svg", { cache: "force-cache" });
        const svgText = await res.text();
        if (cancelled) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const svg = doc.documentElement as unknown as SVGSVGElement;

        // Asegurar responsividad
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.style.width = "100%";
        svg.style.height = "auto";
        svg.style.display = "block";
        svg.style.position = "relative";
        svg.style.zIndex = "0";

        // Extraer viewBox para coordenadas
        const vb = svg.getAttribute("viewBox") || "0 0 1088 960";
        const [vbX, vbY, vbW, vbH] = vb.split(/\s+/).map(Number);
        viewBoxRef.current = { x: vbX, y: vbY, w: vbW, h: vbH };

        // Intentar localizar el contorno principal (primer <path>)
        const mainPath = svg.querySelector("path");

        // Crear defs con clipPath y mask para spotlight
        const defs = doc.createElementNS("http://www.w3.org/2000/svg", "defs");

        let clipPathId: string | null = null;
        if (mainPath) {
          clipPathId = "countryClip";
          const clip = doc.createElementNS("http://www.w3.org/2000/svg", "clipPath");
          clip.setAttribute("id", clipPathId);
          clip.setAttribute("clipPathUnits", "userSpaceOnUse");
          const p = doc.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("d", mainPath.getAttribute("d") || "");
          // Igualar atributos básicos por si hay transforms
          const fillRule = mainPath.getAttribute("fill-rule");
          if (fillRule) p.setAttribute("fill-rule", fillRule);
          clip.appendChild(p);
          defs.appendChild(clip);
        }

        const maskId = "spotlightMask";
        const mask = doc.createElementNS("http://www.w3.org/2000/svg", "mask");
        mask.setAttribute("id", maskId);
        mask.setAttribute("maskUnits", "userSpaceOnUse");

        const maskBg = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
        maskBg.setAttribute("x", String(vbX));
        maskBg.setAttribute("y", String(vbY));
        maskBg.setAttribute("width", String(vbW));
        maskBg.setAttribute("height", String(vbH));
        maskBg.setAttribute("fill", "white");

        const maskHole = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
        maskHole.setAttribute("id", "spot-circle");
        maskHole.setAttribute("cx", String(vbX));
        maskHole.setAttribute("cy", String(vbY));
        maskHole.setAttribute("r", "0");
        maskHole.setAttribute("fill", "black");

        mask.appendChild(maskBg);
        mask.appendChild(maskHole);
        defs.appendChild(mask);

        // Insertar defs al inicio del SVG
        const firstChild = svg.firstChild;
        if (firstChild) svg.insertBefore(defs, firstChild);
        else svg.appendChild(defs);

        // Nota: omitimos añadir la capa de oscurecimiento interna del SVG para evitar superposición con el overlay de canvas

        // Si el SVG contiene múltiples paths, agregamos resaltado directo por path
        const allPaths = Array.from(svg.querySelectorAll("path"));
        const detachFns: Array<() => void> = [];
        if (allPaths.length > 1) {
          // Estilos base sin trazos visibles para evitar líneas negras entre regiones
          const ACTIVE_STROKE_W = "1.1";
          allPaths.forEach((p) => {
            const el = p as SVGPathElement;
            el.style.transition = "filter .15s ease, opacity .15s ease, stroke-width .15s ease";
            el.style.cursor = "pointer";
            el.setAttribute("vector-effect", "non-scaling-stroke");
            // No aplicar stroke por defecto
            el.removeAttribute("stroke");
            el.removeAttribute("stroke-opacity");
            el.removeAttribute("stroke-width");
          });

          const dimOthers = (active: SVGPathElement | null) => {
            allPaths.forEach((p) => {
              const el = p as SVGPathElement;
              if (active && el !== active) {
                el.style.opacity = "0.6";
                el.style.filter = "none";
                // Asegurar que no queden trazos en los no activos
                el.removeAttribute("stroke");
                el.removeAttribute("stroke-opacity");
                el.removeAttribute("stroke-width");
              } else {
                el.style.opacity = "1";
                // Sin trazo por defecto
                el.removeAttribute("stroke");
                el.removeAttribute("stroke-opacity");
                el.removeAttribute("stroke-width");
              }
            });
            if (active) {
              active.style.filter = "drop-shadow(0 0 12px rgba(0,0,0,0.5))";
              active.setAttribute("stroke", "#000");
              active.setAttribute("stroke-opacity", "0.35");
              active.setAttribute("stroke-linejoin", "round");
              active.setAttribute("stroke-linecap", "round");
              active.setAttribute("stroke-width", ACTIVE_STROKE_W);
            }
          };

          const onEnter = (ev: Event) => {
            dimOthers(ev.currentTarget as SVGPathElement);
          };
          const onLeave = () => {
            // Restaurar
            allPaths.forEach((p) => {
              const el = p as SVGPathElement;
              el.style.opacity = "1";
              el.style.filter = "none";
              // Quitar cualquier trazo para evitar líneas visuales entre regiones
              el.removeAttribute("stroke");
              el.removeAttribute("stroke-opacity");
              el.removeAttribute("stroke-width");
            });
          };

          allPaths.forEach((p) => {
            p.addEventListener("pointerenter", onEnter);
            p.addEventListener("pointerleave", onLeave);
            detachFns.push(() => {
              p.removeEventListener("pointerenter", onEnter);
              p.removeEventListener("pointerleave", onLeave);
            });
          });
        }

        // Montar el SVG en el contenedor sin eliminar el canvas overlay
        const host = containerRef.current;
        if (!host) return;
        // Identificar un SVG previo y reemplazarlo
        svg.setAttribute("data-interactive-map", "true");
        const prevSvg = host.querySelector('svg[data-interactive-map="true"]');
        if (prevSvg && prevSvg.parentNode === host) {
          host.replaceChild(svg, prevSvg);
        } else {
          const overlayEl = overlayCanvasRef.current;
          if (overlayEl && overlayEl.parentNode === host) {
            host.insertBefore(svg, overlayEl);
          } else {
            host.appendChild(svg);
          }
        }

        // Preparar raster para segmentación por color: convertir SVG a imagen y dibujar al offscreen
        await rasterizeSvgToOffscreen(svgText, vbW, vbH);

        // Ajustar overlay al tamaño del contenedor
        layoutOverlayCanvas();

        // Seguimiento del puntero para efecto spotlight + highlight de región
        const onPointerMove = (ev: PointerEvent) => {
          const bbox = svg.getBoundingClientRect();
          const px = ev.clientX - bbox.left;
          const py = ev.clientY - bbox.top;

          // Convertir a coords de viewBox
          const scaleX = vbW / bbox.width;
          const scaleY = vbH / bbox.height;
          const cx = vbX + px * scaleX;
          const cy = vbY + py * scaleY;

          // Actualización de la máscara interna (no visible actualmente)
          maskHole.setAttribute("cx", String(cx));
          maskHole.setAttribute("cy", String(cy));
          maskHole.setAttribute("r", String(Math.max(vbW, vbH) * 0.06));

          // Detección de color y pintado de overlay
          drawRegionHighlightAtClient(ev.clientX, ev.clientY, bbox);
        };

        const onPointerLeave = () => {
          maskHole.setAttribute("r", "0");
          clearOverlay();
        };

        // Click en paths (si existen varias regiones como paths)
        const handlePathClick = (ev: Event) => {
          const bbox = svg.getBoundingClientRect();
          const pe = ev as PointerEvent;
          const target = ev.currentTarget as SVGPathElement | null;
          // Si comparte color con Capital (#098DD6), disambiguar por tamaño del path (islas vs. continente)
          if (target) {
            const attrFill = target.getAttribute("fill") || "";
            if (/^#?098dd6$/i.test(attrFill)) {
              try {
                const pb = (target as unknown as SVGGraphicsElement).getBBox();
                const area = pb.width * pb.height;
                const total = vbW * vbH;
                const ratio = area / total;
                const isLikelyInsular = ratio > 0 && ratio < 0.0015; // pequeños polígonos (islas)
                if (isLikelyInsular) {
                  target.dataset.regionId = "insular";
                } else {
                  target.dataset.regionId = "capital";
                }
              } catch {
                // fallback sin dataset
              }
            }
          }
          selectRegionAtClient(pe.clientX, pe.clientY, bbox, target || undefined);
        };
        if (allPaths.length > 1) {
          allPaths.forEach((p) => {
            p.addEventListener("click", handlePathClick);
            detachFns.push(() => p.removeEventListener("click", handlePathClick));
          });
        } else {
          // Click general en el SVG si no hay paths diferenciados
          svg.addEventListener("click", (ev) => {
            const bbox = svg.getBoundingClientRect();
            const pe = ev as PointerEvent;
            selectRegionAtClient(pe.clientX, pe.clientY, bbox);
          });
        }

        svg.style.cursor = "crosshair";
        svg.addEventListener("pointermove", onPointerMove);
        svg.addEventListener("pointerleave", onPointerLeave);

        setReady(true);

        return () => {
          svg.removeEventListener("pointermove", onPointerMove);
          svg.removeEventListener("pointerleave", onPointerLeave);
          // Limpiar listeners por-path si se agregaron
          detachFns.forEach((fn) => fn());
        };
      } catch (e) {
        // noop: en caso de error, dejamos el contenedor vacío
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ajustar tamaño del canvas overlay al tamaño del contenedor (con DPR)
  const layoutOverlayCanvas = () => {
    const host = containerRef.current;
    const overlay = overlayCanvasRef.current;
    if (!host || !overlay) return;
    const rect = host.getBoundingClientRect();
    const logicalW = Math.max(1, Math.floor(rect.width));
    const logicalH = Math.max(1, Math.floor(rect.height));
    overlay.width = Math.floor(logicalW * dpr);
    overlay.height = Math.floor(logicalH * dpr);
    overlay.style.width = `${logicalW}px`;
    overlay.style.height = `${logicalH}px`;
  };

  useEffect(() => {
    const onResize = () => layoutOverlayCanvas();
    window.addEventListener("resize", onResize);
    layoutOverlayCanvas();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const clearOverlay = () => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  };

  const isBackgroundLike = (r: number, g: number, b: number) => r > 235 && g > 235 && b > 235;

  const drawRegionHighlightAtClient = (clientX: number, clientY: number, svgBBox: DOMRect) => {
    const raster = rasterCtxRef.current;
    const overlay = overlayCanvasRef.current;
    if (!raster || !overlay) return;

    const { x: vbX, y: vbY, w: vbW, h: vbH } = viewBoxRef.current;

    // Si cursor fuera del SVG, limpiar
    if (clientX < svgBBox.left || clientX > svgBBox.right || clientY < svgBBox.top || clientY > svgBBox.bottom) {
      clearOverlay();
      return;
    }

    // Convertir a coords del raster (mismo tamaño que viewBox)
    const px = clientX - svgBBox.left;
    const py = clientY - svgBBox.top;
    const sx = Math.floor((px / svgBBox.width) * vbW);
    const sy = Math.floor((py / svgBBox.height) * vbH);
    const data = raster.getImageData(Math.max(0, Math.min(vbW - 1, sx)), Math.max(0, Math.min(vbH - 1, sy)), 1, 1).data;
    const r = data[0], g = data[1], b = data[2], a = data[3];
    if (a === 0 || isBackgroundLike(r, g, b)) {
      clearOverlay();
      return;
    }

    const mask = buildMaskForColor(r, g, b, 48);
    paintOverlayWithMask(mask, svgBBox);

    // Audio feedback al cambiar de región (debounce 150ms)
    const key = `${r},${g},${b}`;
    const now = performance.now();
    if (key !== lastPlayedKeyRef.current && now - lastPlayTsRef.current > 150) {
      playHoverSound();
      lastPlayedKeyRef.current = key;
      lastPlayTsRef.current = now;
    }
  };

  const selectRegionAtClient = (clientX: number, clientY: number, svgBBox: DOMRect, pathEl?: SVGPathElement) => {
    const raster = rasterCtxRef.current;
    if (!raster) return;
    const { w: vbW, h: vbH } = viewBoxRef.current;
    const px = clientX - svgBBox.left;
    const py = clientY - svgBBox.top;
    if (px < 0 || py < 0 || px > svgBBox.width || py > svgBBox.height) return;
    const sx = Math.floor((px / svgBBox.width) * vbW);
    const sy = Math.floor((py / svgBBox.height) * vbH);
    const data = raster.getImageData(Math.max(0, Math.min(vbW - 1, sx)), Math.max(0, Math.min(vbH - 1, sy)), 1, 1).data;
    const r = data[0], g = data[1], b = data[2], a = data[3];
    if (a === 0 || isBackgroundLike(r, g, b)) return;
    // Priorizar mapeo explícito por path si existe
    let region: RegionInfo | null = null;
    if (pathEl?.dataset.regionId) {
      region = REGIONS.find((rg) => rg.id === pathEl.dataset.regionId) || null;
    }
    if (!region) {
      region = resolveRegionByColor({ r, g, b }, 48);
    }

    // Debug log detallado: color exacto y mejor coincidencia
    const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    let nearest: { id: string; label: string; distance: number; refHex: string } | null = null;
    for (const reg of REGIONS) {
      for (const ref of reg.colors) {
        const d = colorDistance({ r, g, b }, ref);
        const refHex = `#${toHex(ref.r)}${toHex(ref.g)}${toHex(ref.b)}`;
        if (!nearest || d < nearest.distance) {
          nearest = { id: reg.id, label: reg.label, distance: d, refHex };
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log("[MapClick]", {
      client: { x: clientX, y: clientY },
      svgBBox: { left: svgBBox.left, top: svgBBox.top, width: svgBBox.width, height: svgBBox.height },
      color: { r, g, b, a, hex },
      matched: region ? { id: region.id, label: region.label } : null,
      nearest,
    });
    if (region) {
      setSelectedRegion(region);
      // Posicionar popup relativo al contenedor
      const containerRect = containerRef.current?.getBoundingClientRect();
      const baseLeft = containerRect ? containerRect.left : 0;
      const baseTop = containerRect ? containerRect.top : 0;
      setPopupPos({ x: Math.floor(clientX - baseLeft), y: Math.floor(clientY - baseTop) });
      setContainerSize({ w: Math.floor(containerRect?.width || 0), h: Math.floor(containerRect?.height || 0) });
      setPopupOpen(true);
      playClickSound();
    }
  };

  const buildMaskForColor = (rT: number, gT: number, bT: number, tolerance = 48) => {
    const raster = rasterCtxRef.current;
    if (!raster) return null;
    const cacheKey = `${rT}|${gT}|${bT}|${tolerance}`;
    const cached = colorMaskCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const iw = raster.canvas.width;
    const ih = raster.canvas.height;
    const src = raster.getImageData(0, 0, iw, ih);
    const srcData = src.data;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = iw;
    maskCanvas.height = ih;
    const mctx = maskCanvas.getContext("2d");
    if (!mctx) return null;
    const out = mctx.createImageData(iw, ih);
    const outData = out.data;
    for (let i = 0; i < srcData.length; i += 4) {
      const r = srcData[i];
      const g = srcData[i + 1];
      const b = srcData[i + 2];
      const a = srcData[i + 3];
      if (a === 0) continue;
      const dr = Math.abs(r - rT);
      const dg = Math.abs(g - gT);
      const db = Math.abs(b - bT);
      if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
        outData[i] = 255;
        outData[i + 1] = 255;
        outData[i + 2] = 255;
        outData[i + 3] = 255; // opaco en la selección
      }
    }
    mctx.putImageData(out, 0, 0);
    colorMaskCacheRef.current.set(cacheKey, maskCanvas);
    return maskCanvas;
  };

  // Inicializa y reproduce el sonido con debouncing
  const playHoverSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioRef.current) {
        const audio = new Audio("/kaizoku-hover.mp3");
        audio.preload = "auto";
        audio.volume = 0.25;
        audioRef.current = audio;
      }
      const a = audioRef.current;
      if (!a) return;
      // Reiniciar al inicio para que el efecto se note en hovers rápidos
      a.currentTime = 0;
      void a.play().catch(() => {
        // Algunos navegadores requieren interacción: lo intentaremos en el próximo hover
      });
    } catch {
      // Ignorar errores de reproducción
    }
  };

  // Sonido de click al seleccionar región
  const playClickSound = () => {
    if (!soundEnabled) return;
    try {
      if (!clickAudioRef.current) {
        const audio = new Audio("/switch-sound.mp3");
        audio.preload = "auto";
        audio.volume = 0.3;
        clickAudioRef.current = audio;
      }
      const a = clickAudioRef.current;
      if (!a) return;
      a.currentTime = 0;
      void a.play().catch(() => {});
    } catch {}
  };

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("interactive-map:soundEnabled", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const paintOverlayWithMask = (mask: HTMLCanvasElement | null, svgBBox: DOMRect) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Oscurecer todo (más claro para que el halo no se vea opaco)
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    if (!mask) return;

    // Convertir de coords viewBox (mask) a coords CSS * DPR
    const { w: vbW, h: vbH } = viewBoxRef.current;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const baseLeft = containerRect ? containerRect.left : 0;
    const baseTop = containerRect ? containerRect.top : 0;
    const destX = Math.floor((svgBBox.left - baseLeft) * dpr);
    const destY = Math.floor((svgBBox.top - baseTop) * dpr);
    const destW = Math.floor(svgBBox.width * dpr);
    const destH = Math.floor(svgBBox.height * dpr);

    // Quitar oscuridad sobre la región
    ctx.globalCompositeOperation = "destination-out";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mask, 0, 0, vbW, vbH, destX, destY, destW, destH);
    ctx.globalCompositeOperation = "source-over";

    // Glow suave alrededor de la región dibujado por detrás del recorte
    ctx.globalCompositeOperation = "destination-over";
    ctx.filter = "drop-shadow(0 0 10px rgba(0,0,0,0.45))";
    ctx.globalAlpha = 0.08;
    ctx.drawImage(mask, 0, 0, vbW, vbH, destX, destY, destW, destH);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";

    // Sin tinte adicional ni mezcla de luminancia
  };

  const rasterizeSvgToOffscreen = async (svgText: string, vbW: number, vbH: number) => {
    const img = new Image();
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.floor(vbW));
    off.height = Math.max(1, Math.floor(vbH));
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        try {
          ctx.clearRect(0, 0, off.width, off.height);
          ctx.drawImage(img, 0, 0, off.width, off.height);
          rasterCanvasRef.current = off;
          rasterCtxRef.current = ctx;
          URL.revokeObjectURL(url);
          resolve();
        } catch (err) {
          reject(err as Error);
        }
      };
      img.onerror = () => reject(new Error("Failed to load SVG image"));
      img.src = url;
    });
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-busy={!ready}
    >
      <canvas ref={overlayCanvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      <RegionPopup
        open={popupOpen}
        x={popupPos.x}
        y={popupPos.y}
        region={selectedRegion}
        onClose={() => setPopupOpen(false)}
        imageSrc={useMemo(() => (selectedRegion?.id === "nor-oriental" ? "/NOR ORIENTAL.jpg" : undefined), [selectedRegion])}
        especiales={useMemo(() => Math.floor(50 + Math.random() * 450), [selectedRegion])}
        ordinarios={useMemo(() => Math.floor(500 + Math.random() * 5500), [selectedRegion])}
        containerWidth={containerSize.w}
        containerHeight={containerSize.h}
      />
      <button
        onClick={toggleSound}
        aria-label={soundEnabled ? "Desactivar sonido" : "Activar sonido"}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 5,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {soundEnabled ? "🔊 Sonido" : "🔇 Silencio"}
      </button>
    </div>
  );
}


