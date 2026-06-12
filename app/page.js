"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export default function Home() {
  const canvasRef = useRef(null);
  const logoRef = useRef(null);


  useEffect(() => {
    const canvas = canvasRef.current;
    const logoImg = logoRef.current;

    if (!canvas || !logoImg) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    // Constants (GSAP Grid)
    let CELL_SIZE = 8;
    let CELL_GAP = 1;
    let CELL_STEP = CELL_SIZE + CELL_GAP;
    let GRID_PIXEL_SIZE = CELL_SIZE;
    const GRID_COLOR = "#171717";
    const CHAR_COLOR = "rgb(231, 217, 58)"; // Neon yellow logo
    const THRESHOLD = 0.35;
    const PUSH_RADIUS = 8; // In cell units
    const PUSH_FORCE = 30;

    // State
    let cols, rows;
    let cells = [];
    let heroCells = [];
    let streams = [];
    let ambientParticles = [];
    let animationFrameId;
    const gridCacheCanvas = document.createElement("canvas");
    const mouse = { x: null, y: null, active: false };

    // Glitch State
    let glitchActive = false;
    let glitchTimer = 0;
    let nextGlitchTime = 120 + Math.random() * 120; // 2-4 secondi (120-240 frame)
    let glitchDuration = 0;

    // 1. Setup dimensions and scale
    function setupCanvas() {
      if (typeof window === "undefined") return;
      CELL_SIZE = window.innerWidth < 768 ? 4 : 8;
      CELL_GAP = 1;
      CELL_STEP = CELL_SIZE + CELL_GAP;
      GRID_PIXEL_SIZE = CELL_SIZE;

      cols = Math.floor(window.innerWidth / CELL_STEP);
      rows = Math.floor(window.innerHeight / CELL_STEP);

      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderGridCache();

      // Setup or resize Matrix rain streams
      const startHeight = window.innerHeight;
      const newStreams = [];
      for (let c = 0; c < cols; c++) {
        if (streams && streams[c]) {
          newStreams.push(streams[c]);
        } else {
          newStreams.push({
            col: c,
            y: startHeight + 500, // default to already passed/revealed
          });
        }
      }
      streams = newStreams;

      initAmbientParticles();
    }

    function initAmbientParticles() {
      if (typeof window === "undefined") return;
      const count = Math.floor(cols * rows * 0.005);
      ambientParticles = [];
      const charPool = ".:+*#%@0369";

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const driftSpeed = 0.1 + Math.random() * 0.25;

        ambientParticles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: Math.cos(angle) * driftSpeed,
          vy: Math.sin(angle) * driftSpeed,
          dx: Math.cos(angle) * driftSpeed,
          dy: Math.sin(angle) * driftSpeed,
          char: charPool[Math.floor(Math.random() * charPool.length)],
          color: Math.random() > 0.4 ? "rgba(180, 180, 180, 0.4)" : "rgba(81, 95, 254, 0.3)",
        });
      }
    }

    // Pre-render the grid background
    function renderGridCache() {
      gridCacheCanvas.width = canvas.width;
      gridCacheCanvas.height = canvas.height;
      const cacheCtx = gridCacheCanvas.getContext("2d");
      cacheCtx.scale(dpr, dpr);

      const cornerSize = window.innerWidth < 768 ? 1.0 : 1.5;
      const centerSize = window.innerWidth < 768 ? 2.0 : 4.0;
      const offsetCenter = (CELL_SIZE - centerSize) / 2;

      // Central tile core is slightly darker, corners are slightly lighter for premium depth
      const CENTER_COLOR = "#131200";
      const CORNER_COLOR = "#1e1c00";

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * CELL_STEP;
          const y = row * CELL_STEP;

          // 1. Draw center tile core
          cacheCtx.fillStyle = CENTER_COLOR;
          cacheCtx.fillRect(
            x + offsetCenter,
            y + offsetCenter,
            centerSize,
            centerSize
          );

          // 2. Draw 4 corner satellite tiles (contour outline)
          cacheCtx.fillStyle = CORNER_COLOR;
          // Top-Left
          cacheCtx.fillRect(x, y, cornerSize, cornerSize);
          // Top-Right
          cacheCtx.fillRect(x + CELL_SIZE - cornerSize, y, cornerSize, cornerSize);
          // Bottom-Left
          cacheCtx.fillRect(x, y + CELL_SIZE - cornerSize, cornerSize, cornerSize);
          // Bottom-Right
          cacheCtx.fillRect(x + CELL_SIZE - cornerSize, y + CELL_SIZE - cornerSize, cornerSize, cornerSize);
        }
      }
    }

    function drawGrid() {
      if (typeof window === "undefined") return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.drawImage(gridCacheCanvas, 0, 0, window.innerWidth, window.innerHeight);
    }

    // 2. Sample logo pixels
    function sampleLogoIntoCells() {
      const rect = logoImg.getBoundingClientRect();
      const logoCols = Math.ceil(rect.width / CELL_STEP);
      const logoRows = Math.ceil(rect.height / CELL_STEP);
      const startCol = Math.floor(rect.left / CELL_STEP);
      const startRow = Math.floor(rect.top / CELL_STEP);

      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = logoCols;
      sampleCanvas.height = logoRows;
      const sampleCtx = sampleCanvas.getContext("2d");

      sampleCtx.fillStyle = "#000";
      sampleCtx.fillRect(0, 0, logoCols, logoRows);
      sampleCtx.drawImage(logoImg, 0, 0, logoCols, logoRows);

      const { data } = sampleCtx.getImageData(0, 0, logoCols, logoRows);

      cells = [];
      const occupied = new Set();

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const inLogo =
            col >= startCol &&
            col < startCol + logoCols &&
            row >= startRow &&
            row < startRow + logoRows;

          if (inLogo) {
            const idx = ((row - startRow) * logoCols + (col - startCol)) * 4;
            if (idx >= 0 && idx < data.length) {
              const brightness = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
              const isLit = brightness > 0.12;
              if (isLit) {
                const isParticle = brightness <= THRESHOLD;

                // Determine a display character based on brightness from the custom ASCII pool (no A-Z alphabet)
                let displayChar = " ";
                if (brightness < 0.4) {
                  const lightPool = ".:+";
                  displayChar = lightPool[Math.floor(Math.random() * lightPool.length)];
                } else if (brightness < 0.75) {
                  const medPool = "*#%";
                  displayChar = medPool[Math.floor(Math.random() * medPool.length)];
                } else {
                  const darkPool = "@0369";
                  displayChar = darkPool[Math.floor(Math.random() * darkPool.length)];
                }

                cells.push({
                  col,
                  row,
                  isLit: true,
                  isParticle: isParticle,
                  brightness: brightness,
                  char: displayChar,
                  tick: Math.floor(Math.random() * 6), // random starting phase to stagger updates
                  interval: 2 + Math.floor(Math.random() * 4), // ultra-fast update interval (2-6 frames)
                  offsetX: 0,
                  offsetY: 0,
                  isReturning: false,
                  history: [],
                });
                occupied.add(`${col},${row}`);
              }
            }
          }
        }
      }

      /*
      // 2. "Inverse circle" vignette: two blobs at bottom-left + top-right.
      // Each blob = smooth union of the two adjacent screen edges (left+bottom, right+top).
      // This creates a CONCAVE inner boundary (hyperbola arc), the inverse of a convex circle.
      //   Formula: union(a, b) = a + b - a*b  → 1 along both edges, 0 at interior, concave boundary
      // 2. Concave corner vignette: bottom-left + top-right
      // Obiettivo:
      // - mantenere la forma concava attuale
      // - creare una sfumatura più leggibile
      // - far degradare davvero il blu verso il nero

      const smoothstep = (edge0, edge1, x) => {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      };

      const lerp = (a, b, t) => a + (b - a) * t;

      const curvePower = 0.55;

      // Parametri forma
      const blFadeX = cols * 0.20;
      const blFadeY = rows * 0.40;

      const trFadeX = cols * 0.20;
      const trFadeY = rows * 0.40;

      // Parametri sfumatura
      // molto più controllati rispetto a fadeEnd = 4
      const fadeStart = 0.62;
      const fadeEnd = 1.75;
      const fadeFeather = 0.22;

      // Colore centro -> bordo
      const innerColor = { r: 81, g: 95, b: 254 }; // blu vivo
      const outerColor = { r: 2, g: 4, b: 8 };     // quasi nero

      const concaveDistance = (x, y) => {
        return Math.pow(
          Math.pow(x, curvePower) + Math.pow(y, curvePower),
          1 / curvePower
        );
      };

      const concaveCornerFactor = (x, y) => {
        const d = concaveDistance(x, y);

        const rawFade =
          1 - smoothstep(fadeStart, fadeEnd + fadeFeather, d);

        // tiene vivi i valori medi e bassi
        return Math.pow(Math.max(0, rawFade), 0.78);
      };

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (occupied.has(`${col},${row}`)) continue;

          // Bottom-left
          const blX = col / blFadeX;
          const blY = (rows - 1 - row) / blFadeY;
          const blFactor = concaveCornerFactor(blX, blY);

          // Top-right
          const trX = (cols - 1 - col) / trFadeX;
          const trY = row / trFadeY;
          const trFactor = concaveCornerFactor(trX, trY);

          const distFactor = Math.max(blFactor, trFactor);
          if (distFactor < 0.01) continue;

          // intensità più lineare, meno brutale
          const intensity = Math.pow(distFactor, 1.15);
          if (intensity < 0.006) continue;

          // opacità progressiva
          const baseOpacity = Math.min(0.72, 0.02 + intensity * 0.62);

          // mix colore: da quasi nero a blu
          const colorT = Math.pow(intensity, 0.9);

          const r = Math.round(lerp(outerColor.r, innerColor.r, colorT));
          const g = Math.round(lerp(outerColor.g, innerColor.g, colorT));
          const b = Math.round(lerp(outerColor.b, innerColor.b, colorT));

          // brightness vera, utile anche per glow o text-shadow
          const brightness = 0.08 + intensity * 0.92;

          let displayChar = " ";

          if (intensity < 0.10) {
            const faintPool = ".";
            displayChar = faintPool[Math.floor(Math.random() * faintPool.length)];
          } else if (intensity < 0.20) {
            const softPool = ".:";
            displayChar = softPool[Math.floor(Math.random() * softPool.length)];
          } else if (intensity < 0.34) {
            const lightPool = ".:+";
            displayChar = lightPool[Math.floor(Math.random() * lightPool.length)];
          } else if (intensity < 0.52) {
            const medPool = "+*:";
            displayChar = medPool[Math.floor(Math.random() * medPool.length)];
          } else if (intensity < 0.72) {
            const strongPool = "*#%";
            displayChar = strongPool[Math.floor(Math.random() * strongPool.length)];
          } else {
            const solidPool = "@0369";
            displayChar = solidPool[Math.floor(Math.random() * solidPool.length)];
          }

          cells.push({
            col,
            row,
            isLit: true,
            isParticle: false,
            isVignette: true,

            // Valori originali
            vignetteOpacity: baseOpacity,
            vignetteColor: `rgb(${r}, ${g}, ${b})`,
            brightness,

            // Valori pronti per il render
            color: `rgb(${r}, ${g}, ${b})`,
            opacity: baseOpacity,
            textShadow: `0 0 ${2 + brightness * 6}px rgb(${r}, ${g}, ${b})`,

            char: displayChar,
            tick: Math.floor(Math.random() * 60),
            interval: 60 + Math.floor(Math.random() * 60),
            offsetX: 0,
            offsetY: 0,
            isReturning: false,
            history: [],
          });
        }
      }
      */

      // 2. Round radial vignette all around the screen with project's blue fading to center
      const centerX = cols / 2;
      const centerY = rows / 2;
      const startDist = 0.25; // Vignette starts appearing at 25% distance from center
      const maxOpacity = 0.72; // Max opacity at extreme edges

      const vr = 81, vg = 95, vb = 254; // Project's blue: rgb(81, 95, 254)

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (occupied.has(`${col},${row}`)) continue;

          // Normalized coordinates relative to center (-1 to 1)
          const dx = (col - centerX) / (cols / 2);
          const dy = (row - centerY) / (rows / 2);
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < startDist) continue;

          // Compute intensity normalized between startDist and maximum distance (~1.414 at corners)
          const intensity = Math.min(1, (dist - startDist) / (1.414 - startDist));
          if (intensity < 0.01) continue;

          // Cubic ramp for organic and soft fade toward the center
          const baseOpacity = Math.pow(intensity, 1.3) * maxOpacity;
          if (baseOpacity < 0.005) continue;

          // Dithered ASCII character selection based on distance/intensity with randomized noise
          const vignetteChars = " .:-=+*#%@";
          const jitter = (Math.random() - 0.5) * 2.2;
          let charIndex = Math.floor(intensity * (vignetteChars.length - 1) + jitter);
          charIndex = Math.max(0, Math.min(vignetteChars.length - 1, charIndex));
          const displayChar = vignetteChars[charIndex];

          if (displayChar === " ") continue;

          cells.push({
            col,
            row,
            isLit: true,
            isParticle: false,
            isVignette: true,

            vignetteOpacity: baseOpacity,
            vignetteColor: `rgb(${vr}, ${vg}, ${vb})`,
            brightness: intensity,

            color: `rgb(${vr}, ${vg}, ${vb})`,
            opacity: baseOpacity,
            textShadow: `0 0 ${2 + intensity * 6}px rgb(${vr}, ${vg}, ${vb})`,

            char: displayChar,
            tick: Math.floor(Math.random() * 60),
            interval: 60 + Math.floor(Math.random() * 60),
            offsetX: 0,
            offsetY: 0,
            isReturning: false,
            history: [],
          });
        }
      }
    }

    // Campionamento testo "Where brands turn gold." in ASCII
    function sampleTextIntoCells() {
      if (typeof window === "undefined") return;

      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = cols;
      sampleCanvas.height = rows;
      const sampleCtx = sampleCanvas.getContext("2d");

      sampleCtx.fillStyle = "#000000";
      sampleCtx.fillRect(0, 0, cols, rows);

      const isMobile = window.innerWidth < 768;

      // Draw all text in white
      sampleCtx.fillStyle = "#ffffff";

      if (isMobile) {
        // Linea 1: "Where brands"
        // Linea 2: "turn gold."
        let fontSize = 10;
        sampleCtx.font = `500 ${fontSize}px "Clash Grotesk", sans-serif`;
        let textWidth = sampleCtx.measureText("Where brands").width;
        fontSize = Math.floor((cols * 0.88) / textWidth * fontSize);
        fontSize = Math.min(fontSize, Math.floor(rows * 0.20));
        fontSize = Math.max(fontSize, 6);

        sampleCtx.font = `500 ${fontSize}px "Clash Grotesk", sans-serif`;
        sampleCtx.textAlign = "center";
        sampleCtx.textBaseline = "middle";

        const centerY = rows / 2;
        const lineSpacing = fontSize * 1.25;

        // Scrivi Linea 1
        sampleCtx.fillText("Where brands", cols / 2, centerY - lineSpacing / 2);

        // Scrivi Linea 2
        sampleCtx.fillText("turn gold.", cols / 2, centerY + lineSpacing / 2);
      } else {
        // Riga singola: "Where brands turn gold."
        let fontSize = 10;
        sampleCtx.font = `500 ${fontSize}px "Clash Grotesk", sans-serif`;
        let textWidth = sampleCtx.measureText("Where brands turn gold.").width;
        fontSize = Math.floor((cols * 0.86) / textWidth * fontSize);
        fontSize = Math.min(fontSize, Math.floor(rows * 0.30));
        fontSize = Math.max(fontSize, 7);

        sampleCtx.font = `500 ${fontSize}px "Clash Grotesk", sans-serif`;
        sampleCtx.textAlign = "center";
        sampleCtx.textBaseline = "middle";

        const centerY = rows / 2;

        // Scrivi la riga intera centrata
        sampleCtx.fillText("Where brands turn gold.", cols / 2, centerY);
      }

      const imgData = sampleCtx.getImageData(0, 0, cols, rows);
      const { data } = imgData;

      heroCells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = (r * cols + c) * 4;
          const red = data[idx];
          const green = data[idx + 1];
          const blue = data[idx + 2];
          
          const brightness = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;

          if (brightness > 0.05) {
            let displayChar = " ";
            if (brightness < 0.3) {
              const charPool = ".:+";
              displayChar = charPool[Math.floor(Math.random() * charPool.length)];
            } else if (brightness < 0.6) {
              const charPool = "I|!1";
              displayChar = charPool[Math.floor(Math.random() * charPool.length)];
            } else {
              const charPool = "[]{}#";
              displayChar = charPool[Math.floor(Math.random() * charPool.length)];
            }

            heroCells.push({
              col: c,
              row: r,
              char: displayChar,
              brightness: brightness,
              color: "rgb(255, 255, 255)"
            });
          }
        }
      }
    }

    // 3. GSAP Animation Loop (Rendering only)
    function animate() {
      if (typeof window === "undefined") return;

      // Gestione timer del glitch
      glitchTimer++;
      if (!glitchActive) {
        if (glitchTimer >= nextGlitchTime) {
          glitchActive = true;
          glitchTimer = 0;
          glitchDuration = 32; // 32 frame in totale (circa 530ms)
          const isYellow = Math.random() < 0.5;
          const targetColor = isYellow ? "rgb(231, 217, 58)" : "rgb(255, 255, 255)";
          heroCells.forEach((cell) => {
            cell.color = targetColor;
          });
          console.log(`Automatic glitch triggered! nextGlitchTime was: ${nextGlitchTime}, Color: ${isYellow ? "yellow" : "white"}`);
        }
      } else {
        if (glitchTimer >= glitchDuration) {
          glitchActive = false;
          glitchTimer = 0;
          nextGlitchTime = 120 + Math.random() * 120; // 2-4 secondi di pausa (120-240 frame)
          console.log("Glitch ended, next automatic glitch in frames:", nextGlitchTime);
        }
      }

      // Generazione degli spostamenti orizzontali casuali (glitch line shift)
      const glitchRowShifts = [];
      if (glitchActive) {
        const isTransition = glitchTimer < 10 || glitchTimer >= glitchDuration - 10;
        const shiftCount = isTransition ? (Math.floor(Math.random() * 4) + 2) : (Math.random() < 0.2 ? 1 : 0);
        const maxShift = isTransition ? 60 : 6;

        for (let s = 0; s < shiftCount; s++) {
          glitchRowShifts.push({
            startRow: Math.floor(Math.random() * rows),
            rowCount: Math.floor(Math.random() * (isTransition ? 10 : 3)) + 2,
            amount: (Math.random() - 0.5) * maxShift
          });
        }
      }

      drawGrid();

      // Mostra la scritta solo durante un glitch/flash attivo
      // Con una transizione iniziale e finale instabile, e un corpo centrale stabile di 200ms (12 frame)
      let showHero = false;
      if (glitchActive) {
        if (glitchTimer < 10 || glitchTimer >= glitchDuration - 10) {
          // Fase iniziale (intro) e finale (outro) di 10 frame (~160ms): forte sfarfallio
          showHero = Math.random() < 0.6;
        } else {
          // Corpo centrale: visualizzazione stabile della scritta (12 frame, ~200ms)
          showHero = true;
        }
      }

      if (showHero) {
        // DISEGNA IL TESTO (heroCells)
        ctx.font = `500 ${CELL_SIZE * 1.35}px "Clash Grotesk", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const heroLen = heroCells.length;
        for (let i = 0; i < heroLen; i++) {
          const cell = heroCells[i];
          let char = cell.char;
          if (char === " ") continue;

          let drawX = cell.col * CELL_STEP + CELL_SIZE / 2;
          const drawY = cell.row * CELL_STEP + CELL_SIZE / 2;

          // Applica lo spostamento orizzontale a linee
          if (glitchActive) {
            const shift = glitchRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
            if (shift) {
              drawX += shift.amount;
            }
          }

          // Jitter casuale su pixel singoli
          if (Math.random() < 0.02) {
            drawX += (Math.random() - 0.5) * 10;
          }

          // Scrambling di caratteri casuali per effetto digitale
          if (Math.random() < 0.08) {
            const scramblePool = ".:+*#%@0369XYZ";
            char = scramblePool[Math.floor(Math.random() * scramblePool.length)];
          }

          // Disegna il carattere in base al colore assegnato (giallo o bianco) con il rispettivo glow
          const isYellow = cell.color === "rgb(231, 217, 58)";
          ctx.fillStyle = cell.color || "#ffffff";
          if (isYellow) {
            ctx.shadowColor = "rgba(231, 217, 58, 0.95)";
            ctx.shadowBlur = 15;
          } else {
            ctx.shadowColor = "rgba(255, 255, 255, 0.95)";
            ctx.shadowBlur = 10;
          }
          ctx.fillText(char, drawX, drawY);
          ctx.shadowBlur = 0;
        }

        // Barre orizzontali di scansione di distorsione cromatiche temporanee
        if (Math.random() < 0.3) {
          ctx.fillStyle = Math.random() < 0.5 ? "rgba(81, 95, 254, 0.25)" : "rgba(255, 215, 0, 0.3)";
          const barY = Math.random() * window.innerHeight;
          const barH = 4 + Math.random() * 20;
          ctx.fillRect(0, barY, window.innerWidth, barH);
        }
      } else {
        // DISEGNA LOGO E PARTICELLE (Comportamento Standard)
        const len = cells.length;

        // Generazione di glitch leggeri/subtle e continui sul logo (anche senza glitchActive)
        const subtleRowShifts = [];
        const hasSubtleGlitch = !glitchActive && Math.random() < 0.02; // 2% di probabilità per ogni frame
        if (hasSubtleGlitch) {
          const shiftCount = Math.floor(Math.random() * 2) + 1;
          for (let s = 0; s < shiftCount; s++) {
            subtleRowShifts.push({
              startRow: Math.floor(Math.random() * rows),
              rowCount: Math.floor(Math.random() * 3) + 1, // 1-3 righe
              amount: (Math.random() - 0.5) * 4 // max 2px di scostamento
            });
          }
        }

        // Update offsets first for all cells
        for (let i = 0; i < len; i++) {
          const cell = cells[i];

          // Hover history
          if (!cell.history) cell.history = [];
          cell.history.push({ x: cell.offsetX, y: cell.offsetY });
          if (cell.history.length > 5) {
            cell.history.shift();
          }
        }

        // Draw and update background ambient particles
        ctx.font = `bold ${CELL_SIZE * 1.0}px "Courier New", Courier, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const pushRadius = PUSH_RADIUS * CELL_STEP;

        for (let i = 0; i < ambientParticles.length; i++) {
          const p = ambientParticles[i];

          // Snapped coordinates for grid rendering
          const col = Math.round(p.x / CELL_STEP);
          const row = Math.round(p.y / CELL_STEP);
          const cellY = row * CELL_STEP + CELL_SIZE / 2;
          let cellX = col * CELL_STEP + CELL_SIZE / 2;

          if (glitchActive) {
            const shift = glitchRowShifts.find((s) => row >= s.startRow && row < s.startRow + s.rowCount);
            if (shift) {
              cellX += shift.amount;
            }
          } else if (hasSubtleGlitch) {
            const shift = subtleRowShifts.find((s) => row >= s.startRow && row < s.startRow + s.rowCount);
            if (shift) {
              cellX += shift.amount;
            }
          }

          // Reveal logic linked to Matrix rain sweep
          const stream = streams[col];
          const isRevealed = stream && (stream.y >= cellY);

          if (isRevealed) {
            // Physics push from mouse
            if (mouse.active && mouse.x !== null && mouse.y !== null) {
              const dx = p.x - mouse.x;
              const dy = p.y - mouse.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < pushRadius && dist > 0.1) {
                const force = (pushRadius - dist) / pushRadius;
                p.vx += (dx / dist) * force * 1.5;
                p.vy += (dy / dist) * force * 1.5;
              }
            }

            // Apply physics updates
            p.x += p.vx;
            p.y += p.vy;

            // Apply friction/drag to slow down mouse repulsion
            p.vx *= 0.94;
            p.vy *= 0.94;

            // Maintain gentle drift speed
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (speed < 0.2) {
              p.vx += p.dx * 0.05;
              p.vy += p.dy * 0.05;
            }

            // Screen wrapping
            if (p.x < 0) p.x = window.innerWidth;
            if (p.x > window.innerWidth) p.x = 0;
            if (p.y < 0) p.y = window.innerHeight;
            if (p.y > window.innerHeight) p.y = 0;

            // Rendering
            ctx.fillStyle = p.color;
            ctx.fillText(p.char, cellX, cellY);
          }
        }

        // PASS 1: Draw Matrix Rain streams across the entire screen (bold, 1.2x size)
        ctx.font = `bold ${CELL_SIZE * 1.2}px "Courier New", Courier, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const rainPool = ".:+*#%@0369";
        for (let c = 0; c < cols; c++) {
          const stream = streams[c];
          if (!stream) continue;

          const headRow = Math.floor(stream.y / CELL_STEP);
          if (headRow < -15) continue; // Not visible yet

          const trailLength = 15;
          for (let r = headRow - trailLength; r <= headRow; r++) {
            if (r < 0 || r >= rows) continue;

            let drawX = c * CELL_STEP + CELL_SIZE / 2;
            const drawY = r * CELL_STEP + CELL_SIZE / 2;

            if (glitchActive) {
              const shift = glitchRowShifts.find((s) => r >= s.startRow && r < s.startRow + s.rowCount);
              if (shift) {
                drawX += shift.amount;
              }
            } else if (hasSubtleGlitch) {
              const shift = subtleRowShifts.find((s) => r >= s.startRow && r < s.startRow + s.rowCount);
              if (shift) {
                drawX += shift.amount;
              }
            }

            // Rapidly flickering character for the matrix code look
            const charIdx = Math.floor((c * 31 + r * 17 + Date.now() / 80) % rainPool.length);
            const displayChar = rainPool[charIdx];

            const age = headRow - r;
            if (age === 0) {
              // Head: glowing bright white
              ctx.fillStyle = "rgba(243, 240, 235, 0.95)";
            } else {
              // Tail: fading neon blue
              const opacity = Math.max(0, 1 - age / trailLength) * 0.8;
              ctx.fillStyle = `rgba(81, 95, 254, ${opacity})`;
            }

            ctx.fillText(displayChar, drawX, drawY);
          }
        }

        // PASS 2: Draw Large Logo Characters (revealed as rain passes, bold, 1.2x size)
        ctx.font = `bold ${CELL_SIZE * 1.2}px "Courier New", Courier, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < len; i++) {
          const cell = cells[i];
          if (cell.isLit && !cell.isParticle) {
            const cellY = cell.row * CELL_STEP + CELL_SIZE / 2;

            // Check if the rain sweep has reached this cell's row
            const stream = streams[cell.col];
            const isRevealed = stream && (stream.y >= cellY);

            if (isRevealed) {
              // Interpolate color from glowing white/blue to target color as the head recedes
              const dist = stream.y - cellY;
              let color;
              if (cell.isVignette) {
                color = `rgba(81, 95, 254, ${cell.vignetteOpacity})`;
                if (dist < 150) {
                  const t = dist / 150; // 0 to 1
                  const r = Math.round(255 + (0 - 255) * t);
                  const g = Math.round(255 + (85 - 255) * t);
                  const b = Math.round(255 + (255 - 255) * t);
                  const a = 1.0 + (cell.vignetteOpacity - 1.0) * t;
                  color = `rgba(${r}, ${g}, ${b}, ${a})`;
                }
              } else {
                color = CHAR_COLOR;
                if (dist < 150) {
                  const t = dist / 150; // 0 to 1
                  const r = Math.round(255 + (218 - 255) * t);
                  const g = Math.round(255 + (255 - 255) * t);
                  const b = Math.round(255 + (0 - 255) * t);
                  color = `rgb(${r}, ${g}, ${b})`;
                }
              }

              // Check mouse proximity for hover glitch effect
              let isHovered = false;
              let hoverForce = 0;
              if (mouse.active && mouse.x !== null && mouse.y !== null && !cell.isVignette) {
                const cellCenterX = cell.col * CELL_STEP + CELL_SIZE / 2;
                const cellCenterY = cellY;
                const dx = cellCenterX - mouse.x;
                const dy = cellCenterY - mouse.y;
                const distMouse = Math.sqrt(dx * dx + dy * dy);
                const mouseRadiusPx = PUSH_RADIUS * CELL_STEP;
                if (distMouse < mouseRadiusPx && distMouse > 0.1) {
                  isHovered = true;
                  hoverForce = (mouseRadiusPx - distMouse) / mouseRadiusPx;
                }
              }

              if (isHovered) {
                // High-frequency jitter
                cell.offsetX = (Math.random() - 0.5) * 12 * hoverForce;
                cell.offsetY = (Math.random() - 0.5) * 12 * hoverForce;
                cell.isHoveredGlitch = true;
              } else if (cell.isHoveredGlitch) {
                // Snappy decay back to 0
                cell.offsetX *= 0.75;
                cell.offsetY *= 0.75;
                if (Math.abs(cell.offsetX) < 0.05 && Math.abs(cell.offsetY) < 0.05) {
                  cell.offsetX = 0;
                  cell.offsetY = 0;
                  cell.isHoveredGlitch = false;
                }
              }

              // Increment frame counter
              cell.tick++;

              const isMoving =
                cell.offsetX !== 0 ||
                cell.offsetY !== 0 ||
                cell.history.some((h) => h.x !== 0 || h.y !== 0);

              // Scramble ultra-fast (every 1 frame) during hover/repulsion or landing, otherwise scramble fast (every 2-6 frames)
              const currentInterval = cell.isVignette ? cell.interval : (isHovered || isMoving || dist < 150) ? 1 : cell.interval;

              if (!cell.isVignette && cell.tick >= currentInterval) {
                cell.tick = 0;
                if (cell.brightness < 0.4) {
                  const lightPool = ".:+";
                  cell.char = lightPool[Math.floor(Math.random() * lightPool.length)];
                } else if (cell.brightness < 0.75) {
                  const medPool = "*#%";
                  cell.char = medPool[Math.floor(Math.random() * medPool.length)];
                } else {
                  const darkPool = "@0369";
                  cell.char = darkPool[Math.floor(Math.random() * darkPool.length)];
                }
              }

              let displayChar = cell.char;
              const isScrambled = !cell.isVignette && (isHovered || (glitchActive && Math.random() < 0.08) || (!glitchActive && Math.random() < 0.0008));
              if (isScrambled) {
                const noiseChars = ".:+*#%@0369XYZ$&!?#";
                displayChar = noiseChars[Math.floor(Math.random() * noiseChars.length)];
              }

              // Draw hover trail
              if (isMoving) {
                const histLen = cell.history.length;
                for (let h = 0; h < histLen - 1; h++) {
                  const pos = cell.history[h];
                  if (pos.x === 0 && pos.y === 0) continue;
                  const opacity = ((h + 1) / histLen) * 0.35 * (cell.isVignette ? cell.vignetteOpacity * 2 : 1.0);
                  ctx.fillStyle = `rgba(81, 95, 254, ${opacity})`;
                  let trailX = cell.col * CELL_STEP + CELL_SIZE / 2 + pos.x;
                  const trailY = cellY + pos.y;
                  if (glitchActive) {
                    const shift = glitchRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
                    if (shift) {
                      trailX += shift.amount;
                    }
                  } else if (hasSubtleGlitch) {
                    const shift = subtleRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
                    if (shift) {
                      trailX += shift.amount;
                    }
                  }
                  ctx.fillText(displayChar, trailX, trailY);
                }
              }

              // Draw current logo character
              let drawX = cell.col * CELL_STEP + CELL_SIZE / 2 + cell.offsetX;
              const drawY = cellY + cell.offsetY;

              if (glitchActive) {
                const shift = glitchRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
                if (shift) {
                  drawX += shift.amount;
                }
              } else if (hasSubtleGlitch) {
                const shift = subtleRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
                if (shift) {
                  drawX += shift.amount;
                }
              }

              const isSubtleChrom = !glitchActive && hasSubtleGlitch && Math.random() < 0.12;
              const isHoveredChrom = isHovered && Math.random() < 0.35;

              if (glitchActive && Math.random() < 0.15) {
                ctx.fillStyle = "rgba(255, 0, 100, 0.85)";
                ctx.fillText(displayChar, drawX - 3, drawY);
                ctx.fillStyle = "rgba(0, 255, 255, 0.85)";
                ctx.fillText(displayChar, drawX + 3, drawY);
              } else if (isHoveredChrom) {
                ctx.fillStyle = "rgba(255, 0, 100, 0.9)";
                ctx.fillText(displayChar, drawX - (2 * hoverForce), drawY);
                ctx.fillStyle = "rgba(0, 255, 255, 0.9)";
                ctx.fillText(displayChar, drawX + (2 * hoverForce), drawY);
                ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
                ctx.fillText(displayChar, drawX, drawY);
              } else if (isSubtleChrom) {
                ctx.fillStyle = "rgba(255, 0, 100, 0.75)";
                ctx.fillText(displayChar, drawX - 1.5, drawY);
                ctx.fillStyle = "rgba(0, 255, 255, 0.75)";
                ctx.fillText(displayChar, drawX + 1.5, drawY);
              } else {
                ctx.fillStyle = color;
                ctx.fillText(displayChar, drawX, drawY);
              }
            }
          }
        }

        // PASS 3: Draw Small Logo Particles (revealed as rain passes, bold, 0.9x size)
        ctx.font = `bold ${CELL_SIZE * 0.9}px "Courier New", Courier, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < len; i++) {
          const cell = cells[i];
          if (cell.isLit && cell.isParticle) {
            const cellY = cell.row * CELL_STEP + CELL_SIZE / 2;

            const stream = streams[cell.col];
            const isRevealed = stream && (stream.y >= cellY);

            if (isRevealed) {
              // Glow interpolation for particle reveal
              const dist = stream.y - cellY;
              let color = "rgba(81, 95, 254, 0.75)";
              if (dist < 150) {
                const t = dist / 150;
                const r = Math.round(255 + (0 - 255) * t);
                const g = Math.round(255 + (85 - 255) * t);
                const b = Math.round(255 + (255 - 255) * t);
                const a = 1.0 + (0.75 - 1.0) * t;
                color = `rgba(${r}, ${g}, ${b}, ${a})`;
              }

              // Check mouse proximity for hover glitch effect on particles
              let isHovered = false;
              let hoverForce = 0;
              if (mouse.active && mouse.x !== null && mouse.y !== null) {
                const cellCenterX = cell.col * CELL_STEP + CELL_SIZE / 2;
                const cellCenterY = cellY;
                const dx = cellCenterX - mouse.x;
                const dy = cellCenterY - mouse.y;
                const distMouse = Math.sqrt(dx * dx + dy * dy);
                const mouseRadiusPx = PUSH_RADIUS * CELL_STEP;
                if (distMouse < mouseRadiusPx && distMouse > 0.1) {
                  isHovered = true;
                  hoverForce = (mouseRadiusPx - distMouse) / mouseRadiusPx;
                }
              }

              if (isHovered) {
                // High-frequency jitter
                cell.offsetX = (Math.random() - 0.5) * 8 * hoverForce;
                cell.offsetY = (Math.random() - 0.5) * 8 * hoverForce;
                cell.isHoveredGlitch = true;
              } else if (cell.isHoveredGlitch) {
                // Snappy decay back to 0
                cell.offsetX *= 0.75;
                cell.offsetY *= 0.75;
                if (Math.abs(cell.offsetX) < 0.05 && Math.abs(cell.offsetY) < 0.05) {
                  cell.offsetX = 0;
                  cell.offsetY = 0;
                  cell.isHoveredGlitch = false;
                }
              }

              // Increment frame counter
              cell.tick++;

              const isMoving =
                cell.offsetX !== 0 ||
                cell.offsetY !== 0 ||
                cell.history.some((h) => h.x !== 0 || h.y !== 0);

              // Scramble ultra-fast (every 1 frame) during hover/repulsion or landing, otherwise scramble fast (every 2-6 frames)
              const currentInterval = (isHovered || isMoving || dist < 150) ? 1 : cell.interval;

              if (cell.tick >= currentInterval) {
                cell.tick = 0;
                if (cell.brightness < 0.4) {
                  const lightPool = ".:+";
                  cell.char = lightPool[Math.floor(Math.random() * lightPool.length)];
                } else if (cell.brightness < 0.75) {
                  const medPool = "*#%";
                  cell.char = medPool[Math.floor(Math.random() * medPool.length)];
                } else {
                  const darkPool = "@0369";
                  cell.char = darkPool[Math.floor(Math.random() * darkPool.length)];
                }
              }

              let displayChar = cell.char;
              const isScrambled = isHovered || (glitchActive && Math.random() < 0.08) || (!glitchActive && Math.random() < 0.003);
              if (isScrambled) {
                const noiseChars = ".:+*#%@0369XYZ";
                displayChar = noiseChars[Math.floor(Math.random() * noiseChars.length)];
              }

              // Draw hover trail
              if (isMoving) {
                const histLen = cell.history.length;
                for (let h = 0; h < histLen - 1; h++) {
                  const pos = cell.history[h];
                  if (pos.x === 0 && pos.y === 0) continue;
                  const opacity = ((h + 1) / histLen) * 0.35;
                  ctx.fillStyle = `rgba(81, 95, 254, ${opacity * 0.7})`;
                  let trailX = cell.col * CELL_STEP + CELL_SIZE / 2 + pos.x;
                  const drawY = cellY + pos.y;
                  if (glitchActive) {
                    const shift = glitchRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
                    if (shift) {
                      trailX += shift.amount;
                    }
                  } else if (hasSubtleGlitch) {
                    const shift = subtleRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
                    if (shift) {
                      trailX += shift.amount;
                    }
                  }
                  ctx.fillText(displayChar, trailX, drawY);
                }
              }

              // Draw current particle character
              let drawX = cell.col * CELL_STEP + CELL_SIZE / 2 + cell.offsetX;
              const drawY = cellY + cell.offsetY;

              if (glitchActive) {
                const shift = glitchRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
                if (shift) {
                  drawX += shift.amount;
                }
              } else if (hasSubtleGlitch) {
                const shift = subtleRowShifts.find((s) => cell.row >= s.startRow && cell.row < s.startRow + s.rowCount);
                if (shift) {
                  drawX += shift.amount;
                }
              }

              const isSubtleChrom = !glitchActive && hasSubtleGlitch && Math.random() < 0.12;
              const isHoveredChrom = isHovered && Math.random() < 0.35;

              if (glitchActive && Math.random() < 0.15) {
                ctx.fillStyle = "rgba(255, 0, 100, 0.85)";
                ctx.fillText(displayChar, drawX - 3, drawY);
                ctx.fillStyle = "rgba(0, 255, 255, 0.85)";
                ctx.fillText(displayChar, drawX + 3, drawY);
              } else if (isHoveredChrom) {
                ctx.fillStyle = "rgba(255, 0, 100, 0.9)";
                ctx.fillText(displayChar, drawX - (2 * hoverForce), drawY);
                ctx.fillStyle = "rgba(0, 255, 255, 0.9)";
                ctx.fillText(displayChar, drawX + (2 * hoverForce), drawY);
                ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
                ctx.fillText(displayChar, drawX, drawY);
              } else if (isSubtleChrom) {
                ctx.fillStyle = "rgba(255, 0, 100, 0.75)";
                ctx.fillText(displayChar, drawX - 1.5, drawY);
                ctx.fillStyle = "rgba(0, 255, 255, 0.75)";
                ctx.fillText(displayChar, drawX + 1.5, drawY);
              } else {
                ctx.fillStyle = color;
                ctx.fillText(displayChar, drawX, drawY);
              }
            }
          }
        }

        // Dynamic ambient glitches in background
        const numGlitches = Math.floor(cols * rows * 0.0003);
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        const noisePool = ".:+*#%@0369";

        for (let g = 0; g < numGlitches; g++) {
          const col = Math.floor(Math.random() * cols);
          const row = Math.floor(Math.random() * rows);
          const displayChar = noisePool[Math.floor(Math.random() * noisePool.length)];

          let drawX = col * CELL_STEP + CELL_SIZE / 2;
          const drawY = row * CELL_STEP + CELL_SIZE / 2;

          if (glitchActive) {
            const shift = glitchRowShifts.find((s) => row >= s.startRow && row < s.startRow + s.rowCount);
            if (shift) {
              drawX += shift.amount;
            }
          }

          ctx.fillText(displayChar, drawX, drawY);
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    }

    // 4. Interaction listeners
    function handleMove(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        mouse.x = localX;
        mouse.y = localY;
        mouse.active = true;
      } else {
        handleLeave();
      }
    }

    function handleLeave() {
      if (!mouse.active) return;
      mouse.active = false;
      mouse.x = null;
      mouse.y = null;
    }

    // Bindings (Global window listeners for mouse/touch)
    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const onMouseLeave = () => handleLeave();
    const onTouchStart = (e) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => handleLeave();

    // Glitch manual trigger on keydown
    const onKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (key === "g" || key === "d") {
        glitchActive = true;
        glitchTimer = 0;
        glitchDuration = 32; // 32 frame in totale (circa 530ms)
        const targetColor = key === "g" ? "rgb(231, 217, 58)" : "rgb(255, 255, 255)";
        heroCells.forEach((cell) => {
          cell.color = targetColor;
        });
        console.log(`'${key}' key glitch triggered manually! Color: ${key === "g" ? "yellow" : "white"}`);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKeyDown);

    // Global resize listener
    let resizeTimeout;
    const onResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        setupCanvas();
        sampleLogoIntoCells();
        sampleTextIntoCells();
      }, 150);
    };
    window.addEventListener("resize", onResize);

    // Matrix intro animation on load
    function triggerMatrixIntro() {
      if (typeof window === "undefined") return;
      const startHeight = window.innerHeight;

      // Reset all streams and animate them
      streams.forEach((stream) => {
        // Start well above the screen
        stream.y = -100 - Math.random() * 800;

        gsap.to(stream, {
          y: startHeight + 500, // Fall completely off the screen
          duration: 0.3 + Math.random() * 0.3, // Fall duration (extremely fast: 0.3s to 0.6s)
          ease: "none", // Constant linear speed
          delay: stream.col * 0.001 + Math.random() * 0.06, // Instant sweep across the screen
          overwrite: "auto",
        });
      });

      // Reset hover offsets for cells
      const len = cells.length;
      for (let i = 0; i < len; i++) {
        const cell = cells[i];
        cell.offsetX = 0;
        cell.offsetY = 0;
        cell.isReturning = false;
      }
    }

    // Initialization
    function initAll() {
      setupCanvas();
      sampleLogoIntoCells();
      sampleTextIntoCells();
      triggerMatrixIntro();
      animate();
    }

    const checkAndInit = () => {
      if (logoImg.complete) {
        initAll();
      }
    };

    if (logoImg.complete) {
      initAll();
    } else {
      logoImg.onload = checkAndInit;
    }

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <>
      {/* Hidden Source Image for ASCII Sampling */}
      <img
        ref={logoRef}
        id="source"
        src="/logo.png"
        alt="MEEDA Logo Source"
        crossOrigin="anonymous"
      />

      {/* Global CRT Screen Overlay Effects */}
      <div className="crt-overlay"></div>
      <div className="crt-scanlines"></div>
      <div className="crt-flicker"></div>

      <div className="screen">


        <main className="canvas-container">
          <canvas ref={canvasRef} id="grid"></canvas>
        </main>


        <div className="scroll-hint">
          <span className="scroll-label">scorri</span>
          <svg className="scroll-arrow" viewBox="0 0 18 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            {/* stem */}
            <rect x="8" y="0" width="2" height="10"/>
            {/* arrowhead — wide row */}
            <rect x="4" y="10" width="10" height="2"/>
            {/* arrowhead — mid row */}
            <rect x="6" y="12" width="6" height="2"/>
            {/* arrowhead — tip */}
            <rect x="8" y="14" width="2" height="2"/>
          </svg>
        </div>

      </div>
    </>
  );
}
