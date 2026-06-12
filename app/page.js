"use client";

import { useEffect, useRef } from "react";
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
    let streams = [];
    let ambientParticles = [];
    let animationFrameId;
    const gridCacheCanvas = document.createElement("canvas");
    const mouse = { x: null, y: null, active: false };

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
            tick: Math.floor(Math.random() * 6),
            interval: 2 + Math.floor(Math.random() * 4),
            offsetX: 0,
            offsetY: 0,
            isReturning: false,
            history: [],
          });
        }
      }
    }

    // 3. GSAP Animation Loop (Rendering only)
    function animate() {
      if (typeof window === "undefined") return;
      drawGrid();

      const len = cells.length;

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
        const cellX = col * CELL_STEP + CELL_SIZE / 2;

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

          const drawX = c * CELL_STEP + CELL_SIZE / 2;
          const drawY = r * CELL_STEP + CELL_SIZE / 2;

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

            // Increment frame counter
            cell.tick++;

            const isMoving =
              cell.offsetX !== 0 ||
              cell.offsetY !== 0 ||
              cell.history.some((h) => h.x !== 0 || h.y !== 0);

            // Scramble ultra-fast (every 1 frame) during hover/repulsion or landing, otherwise scramble fast (every 2-6 frames)
            const currentInterval = (isMoving || dist < 150) ? 1 : cell.interval;

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

            const displayChar = cell.char;

            // Draw hover trail
            if (isMoving) {
              const histLen = cell.history.length;
              for (let h = 0; h < histLen - 1; h++) {
                const pos = cell.history[h];
                if (pos.x === 0 && pos.y === 0) continue;
                const opacity = ((h + 1) / histLen) * 0.35 * (cell.isVignette ? cell.vignetteOpacity * 2 : 1.0);
                ctx.fillStyle = `rgba(81, 95, 254, ${opacity})`;
                const drawX = cell.col * CELL_STEP + CELL_SIZE / 2 + pos.x;
                const drawY = cellY + pos.y;
                ctx.fillText(displayChar, drawX, drawY);
              }
            }

            // Draw current logo character
            ctx.fillStyle = color;
            const drawX = cell.col * CELL_STEP + CELL_SIZE / 2 + cell.offsetX;
            const drawY = cellY + cell.offsetY;
            ctx.fillText(displayChar, drawX, drawY);
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

            // Increment frame counter
            cell.tick++;

            const isMoving =
              cell.offsetX !== 0 ||
              cell.offsetY !== 0 ||
              cell.history.some((h) => h.x !== 0 || h.y !== 0);

            // Scramble ultra-fast (every 1 frame) during hover/repulsion or landing, otherwise scramble fast (every 2-6 frames)
            const currentInterval = (isMoving || dist < 150) ? 1 : cell.interval;

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

            const displayChar = cell.char;

            // Draw hover trail
            if (isMoving) {
              const histLen = cell.history.length;
              for (let h = 0; h < histLen - 1; h++) {
                const pos = cell.history[h];
                if (pos.x === 0 && pos.y === 0) continue;
                const opacity = ((h + 1) / histLen) * 0.35;
                ctx.fillStyle = `rgba(81, 95, 254, ${opacity * 0.7})`;
                const drawX = cell.col * CELL_STEP + CELL_SIZE / 2 + pos.x;
                const drawY = cellY + pos.y;
                ctx.fillText(displayChar, drawX, drawY);
              }
            }

            // Draw current particle character
            ctx.fillStyle = color;
            const drawX = cell.col * CELL_STEP + CELL_SIZE / 2 + cell.offsetX;
            const drawY = cellY + cell.offsetY;
            ctx.fillText(displayChar, drawX, drawY);
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

        const drawX = col * CELL_STEP + CELL_SIZE / 2;
        const drawY = row * CELL_STEP + CELL_SIZE / 2;
        ctx.fillText(displayChar, drawX, drawY);
      }

      animationFrameId = requestAnimationFrame(animate);
    }

    // 4. Update GSAP Tweens on Mousemove
    function updateTweens() {
      if (!mouse.active || mouse.x === null || mouse.y === null) return;

      const mouseRadiusPx = PUSH_RADIUS * CELL_STEP;
      const len = cells.length;

      for (let i = 0; i < len; i++) {
        const cell = cells[i];

        // Skip vignette cells - they shouldn't react to hover repulsion
        if (cell.isVignette) continue;

        const cellCenterX = cell.col * CELL_STEP + CELL_SIZE / 2;
        const cellCenterY = cell.row * CELL_STEP + CELL_SIZE / 2;

        // Only allow hovering revealed cells
        const stream = streams[cell.col];
        const isRevealed = stream && (stream.y >= cellCenterY);
        if (!isRevealed) continue;

        const dx = cellCenterX - mouse.x;
        const dy = cellCenterY - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < mouseRadiusPx && dist > 0.1) {
          const force = (mouseRadiusPx - dist) / mouseRadiusPx;
          const pushX = (dx / dist) * force * PUSH_FORCE * 1.5;
          const pushY = (dy / dist) * force * PUSH_FORCE * 1.5;

          cell.isReturning = false;
          gsap.to(cell, {
            offsetX: pushX,
            offsetY: pushY,
            duration: 0.35,
            ease: "power2.out",
            overwrite: "auto",
          });
        } else {
          // Snap back immediately with elastic ease (no linger delay)
          if ((cell.offsetX !== 0 || cell.offsetY !== 0) && !cell.isReturning) {
            cell.isReturning = true;
            gsap.to(cell, {
              offsetX: 0,
              offsetY: 0,
              duration: 1.5,
              ease: "elastic.out(1.2, 0.25)",
              overwrite: "auto",
              onComplete: () => {
                cell.isReturning = false;
              },
            });
          }
        }
      }
    }

    // 5. Interaction listeners
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
        updateTweens();
      } else {
        handleLeave();
      }
    }

    function handleLeave() {
      if (!mouse.active) return;
      mouse.active = false;
      mouse.x = null;
      mouse.y = null;

      // Elastic snap back for ALL cells immediately (no linger) when leaving the screen
      const len = cells.length;
      for (let i = 0; i < len; i++) {
        const cell = cells[i];
        if (cell.isVignette) continue; // skip vignette cells
        if (cell.offsetX !== 0 || cell.offsetY !== 0) {
          gsap.to(cell, {
            offsetX: 0,
            offsetY: 0,
            duration: 1.5,
            ease: "elastic.out(1.2, 0.25)",
            overwrite: "auto",
          });
        }
      }
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

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    // Global resize listener
    let resizeTimeout;
    const onResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        setupCanvas();
        sampleLogoIntoCells();
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
      triggerMatrixIntro();
      animate();
    }

    if (logoImg.complete) {
      initAll();
    } else {
      logoImg.onload = initAll;
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


      </div>
    </>
  );
}
