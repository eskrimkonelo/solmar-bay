// Drawing only: the world's state and the current screen in, pixels out. The camera follows
// the player across the city; the view is a 1280x720 logical slice scaled to the window. Flat
// shapes with soft shadows, warm sun-soaked colours, canvas text for the HUD and the panels.

import { CITY, FONT, PALETTE, PLAYER, STORY, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

const VIEW = { width: 1280, height: 720 };
const TAU = Math.PI * 2;

export function createRenderer(canvas, city) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', bold = false) {
    const key = `${size}:${bold ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  /** World rectangle visible on screen right now (for culling). */
  function visibleRect(camera) {
    const w = VIEW.width / view.scale;
    const h = VIEW.height / view.scale;
    return {
      x: camera.x - w / 2, y: camera.y - h / 2, w, h,
    };
  }

  function inView(rect, x, y, margin) {
    return x + margin > rect.x && x - margin < rect.x + rect.w && y + margin > rect.y && y - margin < rect.y + rect.h;
  }

  // ---- the city ------------------------------------------------------------------
  function drawGround(state, rect, time) {
    // Base: dry grass and sand lots.
    context.fillStyle = '#b8a06a';
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    // Parks.
    context.fillStyle = PALETTE.parkGrass;
    for (const park of city.parks) {
      if (!inView(rect, park.x + park.w / 2, park.y + park.h / 2, 0)) continue;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Beach, then the bay with slow waves.
    context.fillStyle = PALETTE.sand;
    context.fillRect(Math.max(rect.x, 0), CITY.bayY - CITY.beachHeight, Math.min(rect.w, WORLD.width), CITY.beachHeight);
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(Math.max(rect.x, 0), CITY.bayY, Math.min(rect.w, WORLD.width), WORLD.height - CITY.bayY);
    context.fillStyle = PALETTE.water;
    for (let i = 0; i < 24; i += 1) {
      const wx = ((i * 317 + time * 12) % (WORLD.width + 200)) - 100;
      const wy = CITY.bayY + 24 + ((i * 173) % 200);
      context.globalAlpha = 0.35;
      context.fillRect(wx, wy, 90, 5);
    }
    context.globalAlpha = 1;
    // Sidewalks: pale strips around every block.
    context.fillStyle = PALETTE.sidewalk;
    for (const block of city.blocks) {
      if (!inView(rect, block.x + block.w / 2, block.y + block.h / 2, 0)) continue;
      context.fillRect(block.x - CITY.sidewalk, block.y - CITY.sidewalk, block.w + CITY.sidewalk * 2, block.h + CITY.sidewalk * 2);
    }
    // Roads.
    context.fillStyle = PALETTE.road;
    for (const road of city.roads.vertical) {
      context.fillRect(road.x - CITY.roadWidth / 2, road.y0, CITY.roadWidth, road.y1 - road.y0);
    }
    for (const road of city.roads.horizontal) {
      context.fillRect(road.x0, road.y - CITY.roadWidth / 2, road.x1 - road.x0, CITY.roadWidth);
    }
    // Lane dashes and crosswalks.
    context.fillStyle = PALETTE.roadLine;
    for (const road of city.roads.vertical) {
      for (let y = road.y0 + 20; y < road.y1 - 10; y += 56) {
        context.fillRect(road.x - 2, y, 4, 26);
      }
    }
    for (const road of city.roads.horizontal) {
      for (let x = road.x0 + 20; x < road.x1 - 10; x += 56) {
        context.fillRect(x, road.y - 2, 26, 4);
      }
    }
    context.fillStyle = PALETTE.crosswalk;
    for (const node of city.graph) {
      context.fillRect(node.x - 30, node.y - CITY.roadWidth / 2 + 6, 60, 8);
      context.fillRect(node.x - 30, node.y + CITY.roadWidth / 2 - 14, 60, 8);
      context.fillRect(node.x - CITY.roadWidth / 2 + 6, node.y - 30, 8, 60);
      context.fillRect(node.x + CITY.roadWidth / 2 - 14, node.y - 30, 8, 60);
    }
    // Buildings: soft shadow, pale walls, coloured roof, a few windows.
    for (const b of city.buildings) {
      if (!inView(rect, b.x + b.w / 2, b.y + b.h / 2, 40)) continue;
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(b.x + b.height * 0.5, b.y + b.height * 0.5, b.w, b.h);
      context.fillStyle = PALETTE.buildingWall;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      context.fillStyle = PALETTE.buildingGlass;
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if ((c + r) % 2 === 0) context.fillRect(b.x + 10 + c * 34, b.y + 10 + r * 34, 14, 10);
        }
      }
      if (b.kind === 'garage' || b.kind === 'hospital' || b.kind === 'police') {
        context.fillStyle = 'rgba(255,255,255,0.9)';
        context.font = `700 22px ${FONT}`;
        context.textAlign = 'center';
        const label = b.kind === 'garage' ? 'GARAGE' : b.kind === 'hospital' ? 'HOSPITAL' : 'POLICE';
        context.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 8);
      }
    }
    // Palms and boats.
    for (const palm of city.palms) {
      if (!inView(rect, palm.x, palm.y, 20)) continue;
      context.strokeStyle = '#8a6a42';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(palm.x, palm.y);
      context.lineTo(palm.x + 4, palm.y - 14);
      context.stroke();
      context.fillStyle = '#4a8a3c';
      context.beginPath();
      context.arc(palm.x + 4, palm.y - 18, 10, 0, TAU);
      context.fill();
    }
    for (const boat of city.boats) {
      if (!inView(rect, boat.x, boat.y, 30)) continue;
      context.save();
      context.translate(boat.x, boat.y);
      context.rotate(boat.angle);
      context.fillStyle = '#e8e4da';
      rr(-26, -9, 52, 18, 8);
      context.fill();
      context.fillStyle = '#c94f43';
      context.fillRect(-6, -14, 12, 12);
      context.restore();
    }
  }

  // ---- cars, people, effects --------------------------------------------------------
  function drawCar(car, time) {
    const def = car.def;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = PALETTE.carShadow;
    rr(-def.length / 2 + 4, -def.width / 2 + 5, def.length, def.width, 10);
    context.fill();
    // Body.
    context.fillStyle = car.wreck ? '#3a3a3a' : car.color;
    rr(-def.length / 2, -def.width / 2, def.length, def.width, 9);
    context.fill();
    if (!car.wreck) {
      // Windshield, roof, headlights.
      context.fillStyle = '#20262e';
      context.fillRect(-def.length / 2 + 10, -def.width / 2 + 4, 12, def.width - 8);
      context.fillStyle = 'rgba(255,255,255,0.16)';
      context.fillRect(-4, -def.width / 2 + 5, def.length / 2 - 8, def.width - 10);
      context.fillStyle = '#ffe9a8';
      context.fillRect(def.length / 2 - 4, -def.width / 2 + 3, 3, 6);
      context.fillRect(def.length / 2 - 4, def.width / 2 - 9, 3, 6);
      context.fillStyle = '#e84f4f';
      context.fillRect(-def.length / 2 + 1, -def.width / 2 + 3, 3, 6);
      context.fillRect(-def.length / 2 + 1, def.width / 2 - 9, 3, 6);
      if (car.type === 'taxi') {
        context.fillStyle = '#20242e';
        context.font = `700 11px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('TAXI', 0, 4);
      }
      if (car.type === 'police') {
        context.fillStyle = '#e8e8e8';
        context.fillRect(-def.length / 2 + 6, -def.width / 2, def.length - 12, 7);
        context.fillRect(-def.length / 2 + 6, def.width / 2 - 7, def.length - 12, 7);
        const flash = Math.floor(time * 3) % 2 === 0;
        context.fillStyle = flash ? '#ff3b30' : '#3b82ff';
        context.beginPath();
        context.arc(-2, -def.width / 2 + 1, 5, 0, TAU);
        context.fill();
        context.fillStyle = flash ? '#3b82ff' : '#ff3b30';
        context.beginPath();
        context.arc(-2, def.width / 2 - 1, 5, 0, TAU);
        context.fill();
      }
      if (car.health < 40) {
        context.fillStyle = 'rgba(60,60,60,0.5)';
        context.beginPath();
        context.arc(-def.length / 4 + Math.sin(time * 7) * 3, -def.width / 4, 8 + Math.sin(time * 5) * 2, 0, TAU);
        context.fill();
      }
    }
    context.restore();
    if (car.mission && !car.wreck) {
      // A bouncing marker over the mission car.
      const bob = Math.sin(time * 4) * 4;
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.moveTo(car.x, car.y - 46 + bob);
      context.lineTo(car.x - 9, car.y - 62 + bob);
      context.lineTo(car.x + 9, car.y - 62 + bob);
      context.closePath();
      context.fill();
    }
  }

  function drawPed(ped, time) {
    if (!ped.alive && ped.fade > 2) return;
    context.save();
    context.translate(ped.x, ped.y);
    if (!ped.alive) {
      context.rotate(1.2);
      context.globalAlpha = Math.max(0, 1 - ped.fade / 8);
    }
    context.fillStyle = PALETTE.carShadow;
    context.beginPath();
    context.ellipse(2, 3, 11, 8, 0, 0, TAU);
    context.fill();
    const shirt = ped.role === 'cop' ? '#20242e' : ped.role === 'target' ? '#c94f43' : ped.role === 'shooter' ? '#5c2a2a' : ped.role === 'friend' ? '#e8b93c' : ped.color;
    context.fillStyle = shirt;
    context.beginPath();
    context.arc(0, 0, 10, 0, TAU);
    context.fill();
    context.fillStyle = '#e8b88a';
    context.beginPath();
    context.arc(Math.cos(ped.angle) * 4, Math.sin(ped.angle) * 4, 5.5, 0, TAU);
    context.fill();
    if (ped.role === 'friend') {
      context.fillStyle = '#f2c94c';
      context.font = `700 13px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('LENA', 0, -18);
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (!p.onFoot) return;
    context.save();
    context.translate(p.x, p.y);
    // Shadow and body, facing the aim.
    context.fillStyle = PALETTE.carShadow;
    context.beginPath();
    context.ellipse(3, 4, 13, 10, 0, 0, TAU);
    context.fill();
    if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) context.globalAlpha = 0.4;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(0, 0, PLAYER.radius, 0, TAU);
    context.fill();
    context.fillStyle = '#e8b88a';
    context.beginPath();
    context.arc(Math.cos(p.angle) * 5, Math.sin(p.angle) * 5, 6.5, 0, TAU);
    context.fill();
    // The pistol points where the mouse points.
    context.strokeStyle = '#20242e';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(Math.cos(p.angle) * 10, Math.sin(p.angle) * 10);
    context.lineTo(Math.cos(p.angle) * 20, Math.sin(p.angle) * 20);
    context.stroke();
    context.restore();
    context.globalAlpha = 1;
  }

  // ---- effects, pickups, markers ---------------------------------------------------
  function drawEffects(state, rect) {
    for (const s of state.skids) {
      if (!inView(rect, s.x, s.y, 20)) continue;
      context.strokeStyle = `rgba(20,20,20,${Math.min(0.5, s.life / 12)})`;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(s.x - Math.cos(s.angle) * 12, s.y - Math.sin(s.angle) * 12);
      context.lineTo(s.x + Math.cos(s.angle) * 12, s.y + Math.sin(s.angle) * 12);
      context.stroke();
    }
    for (const pt of state.particles) {
      if (!inView(rect, pt.x, pt.y, 10)) continue;
      context.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;
    context.strokeStyle = PALETTE.bullet;
    context.lineWidth = 2;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const pk of state.pickups) {
      if (!inView(rect, pk.x, pk.y, 20)) continue;
      const bob = Math.sin(pk.bob) * 3;
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.beginPath();
      context.ellipse(pk.x + 2, pk.y + 10, 10, 5, 0, 0, TAU);
      context.fill();
      if (pk.kind === 'health') {
        context.fillStyle = '#e8e8e8';
        context.fillRect(pk.x - 10, pk.y - 10 + bob, 20, 20);
        context.fillStyle = '#e84f6a';
        context.fillRect(pk.x - 3, pk.y - 7 + bob, 6, 14);
        context.fillRect(pk.x - 7, pk.y - 3 + bob, 14, 6);
      } else if (pk.kind === 'ammo') {
        context.fillStyle = '#c9a13c';
        context.fillRect(pk.x - 10, pk.y - 7 + bob, 20, 14);
        context.fillStyle = '#20242e';
        context.fillRect(pk.x - 6, pk.y - 4 + bob, 4, 8);
        context.fillRect(pk.x - 1, pk.y - 4 + bob, 4, 8);
        context.fillRect(pk.x + 4, pk.y - 4 + bob, 4, 8);
      } else {
        context.fillStyle = '#2fae5a';
        context.beginPath();
        context.arc(pk.x, pk.y + bob, 11, 0, TAU);
        context.fill();
        context.fillStyle = '#f4f1e8';
        context.font = `700 13px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('$', pk.x, pk.y + 4 + bob);
      }
    }
  }

  function drawMarker(marker, time) {
    if (!marker) return;
    const bob = Math.sin(time * 3) * 6;
    // A pillar of light, then a bouncing diamond.
    context.fillStyle = 'rgba(242,201,76,0.16)';
    context.fillRect(marker.x - 12, marker.y - 320, 24, 320);
    context.fillStyle = marker.color;
    context.beginPath();
    context.moveTo(marker.x, marker.y - 52 + bob);
    context.lineTo(marker.x - 13, marker.y - 74 + bob);
    context.lineTo(marker.x + 13, marker.y - 74 + bob);
    context.closePath();
    context.fill();
    context.strokeStyle = marker.color;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(marker.x, marker.y, 26 + Math.sin(time * 3) * 4, 0, TAU);
    context.stroke();
  }

  // ---- HUD and minimap -------------------------------------------------------------
  function drawStars(stars) {
    for (let i = 0; i < 5; i += 1) {
      const x = VIEW.width - 30 - i * 30;
      context.fillStyle = i < stars ? PALETTE.wantedStar : PALETTE.wantedEmpty;
      context.font = '26px sans-serif';
      context.textAlign = 'center';
      context.fillText('★', x, 42);
    }
  }

  function drawMinimap(state, marker) {
    const size = 208;
    const scale = size / WORLD.width;
    const x0 = VIEW.width - size - 16;
    const y0 = VIEW.height - size - 16;
    const h = (size * WORLD.height) / WORLD.width;
    context.fillStyle = PALETTE.hudPanel;
    rr(x0 - 6, y0 - 6, size + 12, h + 12, 10);
    context.fill();
    context.save();
    context.beginPath();
    rr(x0, y0, size, h, 6);
    context.clip();
    // Water and land.
    context.fillStyle = PALETTE.minimapWater;
    context.fillRect(x0, y0 + CITY.bayY * scale, size, h - CITY.bayY * scale);
    context.fillStyle = PALETTE.minimapBlock;
    context.fillRect(x0, y0, size, CITY.bayY * scale);
    // Roads, bright enough to read at a glance.
    context.strokeStyle = '#b8b29a';
    context.lineWidth = 2.5;
    for (const road of city.roads.vertical) {
      context.beginPath();
      context.moveTo(x0 + road.x * scale, y0 + road.y0 * scale);
      context.lineTo(x0 + road.x * scale, y0 + road.y1 * scale);
      context.stroke();
    }
    for (const road of city.roads.horizontal) {
      context.beginPath();
      context.moveTo(x0 + road.x0 * scale, y0 + road.y * scale);
      context.lineTo(x0 + road.x1 * scale, y0 + road.y * scale);
      context.stroke();
    }
    function blip(x, y, color, r = 4) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x0 + x * scale, y0 + y * scale, r, 0, TAU);
      context.fill();
    }
    const g = city.landmarks.garage;
    blip(g.x, g.y, '#4fc3f7', 5);
    const hosp = city.landmarks.hospital;
    blip(hosp.x, hosp.y, '#e84f6a', 5);
    if (marker) blip(marker.x, marker.y, '#f2c94c', 6);
    for (const cop of state.cops) {
      if (cop.alive) blip(cop.x, cop.y, '#4f8ae8', 4);
    }
    // The player: a white arrow, turned to face where it faces.
    const p = state.player;
    context.save();
    context.translate(x0 + p.x * scale, y0 + p.y * scale);
    context.rotate(p.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-6, -5);
    context.lineTo(-6, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    text('SOLMAR BAY', x0 + 8, y0 + 16, 12, PALETTE.hudText, 'left', true);
  }

  function drawHud(state, marker) {
    const p = state.player;
    // Top-left panel: money, health, objective.
    context.fillStyle = PALETTE.hudPanel;
    rr(14, 12, 300, 92, 10);
    context.fill();
    text(`$${state.money.toLocaleString('en-US')}`, 28, 44, 28, PALETTE.hudGold, 'left', true);
    context.fillStyle = 'rgba(255,255,255,0.2)';
    rr(28, 56, 180, 12, 6);
    context.fill();
    context.fillStyle = state.health > 30 ? '#5ac94f' : '#e84f4f';
    rr(28, 56, 180 * (state.health / PLAYER.health), 12, 6);
    context.fill();
    text(`${Math.ceil(state.health)}`, 216, 68, 14, PALETTE.hudText, 'left', true);
    // The mission objective, top centre.
    const objective = state.missions ? state.missions.objectiveText() : '';
    const lines = wrapText(objective, 46);
    context.fillStyle = PALETTE.hudPanel;
    rr(VIEW.width / 2 - 250, 12, 500, 30 + lines.length * 20, 10);
    context.fill();
    lines.forEach((line, i) => text(line, VIEW.width / 2, 34 + i * 20, 16, PALETTE.hudText, 'center'));
    drawStars(state.wanted.stars);
    // Bottom-left: weapon and speed.
    context.fillStyle = PALETTE.hudPanel;
    rr(14, VIEW.height - 58, 250, 44, 10);
    context.fill();
    if (p.onFoot) {
      text(`Pistol  ${p.reload > 0 ? 'RELOADING' : `${p.ammo} / ${PLAYER.magazine}`}`, 28, VIEW.height - 30, 18, PALETTE.hudText, 'left', true);
    } else if (p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.12);
      text(`${p.car.def.name}  ${mph} mph`, 28, VIEW.height - 30, 18, PALETTE.hudText, 'left', true);
      context.fillStyle = 'rgba(255,255,255,0.2)';
      rr(180, VIEW.height - 46, 70, 10, 5);
      context.fill();
      context.fillStyle = p.car.health > 30 ? '#5ac94f' : '#e84f4f';
      rr(180, VIEW.height - 46, 70 * (p.car.health / 100), 10, 5);
      context.fill();
    }
    // The world message, centre-low, and the mission banner.
    if (state.message) {
      text(state.message, VIEW.width / 2, VIEW.height - 96, 20, PALETTE.hudText, 'center', true);
    }
    if (state.banner) {
      context.fillStyle = 'rgba(12,16,24,0.8)';
      rr(VIEW.width / 2 - 320, 130, 640, 110, 12);
      context.fill();
      text(state.banner.title, VIEW.width / 2, 172, 30, PALETTE.hudGold, 'center', true);
      const blines = wrapText(state.banner.text, 60);
      blines.forEach((line, i) => text(line, VIEW.width / 2, 200 + i * 22, 17, PALETTE.hudText, 'center'));
    }
    drawMinimap(state, marker);
    // Controls hint, faint.
    text('WASD move · E enter car · Mouse aim, Click shoot · R reload · M mute · P pause', VIEW.width / 2, VIEW.height - 8, 13, 'rgba(244,241,232,0.55)', 'center');
  }

  function wrapText(value, maxChars) {
    if (!value) return [''];
    const words = String(value).split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---- screens ----------------------------------------------------------------------
  function drawTitle(state, save) {
    const cx = VIEW.width / 2;
    context.fillStyle = '#1b2a44';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    // A warm sun over the bay.
    const grad = context.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, '#ffcf7a');
    grad.addColorStop(0.55, '#ff9a5c');
    grad.addColorStop(1, '#2fa8b8');
    context.fillStyle = grad;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.fillStyle = 'rgba(255,240,200,0.9)';
    context.beginPath();
    context.arc(VIEW.width - 220, 130, 64, 0, TAU);
    context.fill();
    context.fillStyle = '#2fa8b8';
    context.fillRect(0, VIEW.height - 180, VIEW.width, 180);
    context.fillStyle = '#e8cf9a';
    context.fillRect(0, VIEW.height - 210, VIEW.width, 30);
    // Skyline.
    context.fillStyle = 'rgba(32,36,46,0.85)';
    const skyline = [90, 150, 110, 190, 130, 170, 100, 210, 140, 120, 180, 150];
    let sx = 60;
    for (const h of skyline) {
      context.fillRect(sx, VIEW.height - 210 - h, 78, h);
      sx += 96;
    }
    context.fillStyle = 'rgba(12,16,24,0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    text('SOLMAR BAY', cx, 190, 84, '#f4f1e8', 'center', true);
    text('An open-world crime story', cx, 232, 26, '#f2c94c', 'center');
    const story = [
      'Dario Cruz came home to the bay with a debt to pay and a garage to save.',
      'Drive it, steal it, lose the cops — and do the jobs Lena lines up.',
    ];
    story.forEach((line, i) => text(line, cx, 300 + i * 28, 19, '#e8e4da', 'center'));
    const lines = [
      'WASD / Arrows — move and drive      E — enter a car, start a job',
      'Mouse — aim      Click — shoot      R — reload      Shift — run',
      'M — mute      P — pause',
    ];
    lines.forEach((line, i) => text(line, cx, 400 + i * 26, 17, '#c9c4b8', 'center'));
    if (save) {
      text(`Continue: $${save.money.toLocaleString('en-US')} · ${save.completed} job${save.completed === 1 ? '' : 's'} done — press C`, cx, 510, 20, '#f2c94c', 'center', true);
    }
    text('Press Enter or click to start', cx, 570, 24, '#f4f1e8', 'center', true);
    text('A game of your own streets. No Rockstar, no GTA — just Solmar Bay.', cx, 640, 14, 'rgba(244,241,232,0.6)', 'center');
  }

  function drawPaused() {
    context.fillStyle = 'rgba(12,16,24,0.6)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    text('Paused', VIEW.width / 2, VIEW.height / 2 - 10, 52, '#f4f1e8', 'center', true);
    text('Press P to keep driving', VIEW.width / 2, VIEW.height / 2 + 34, 20, '#c9c4b8', 'center');
  }

  /** Paint one frame: the world through the camera, then the HUD or a screen panel. */
  function draw(state, screen, save) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#11141b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const camera = state.camera;
    const scale = view.scale;
    const camX = camera.x - VIEW.width / 2 / scale;
    const camY = camera.y - VIEW.height / 2 / scale;
    const rect = {
      x: camera.x - (VIEW.width / scale) / 2 - 60,
      y: camera.y - (VIEW.height / scale) / 2 - 60,
      w: VIEW.width / scale + 120,
      h: VIEW.height / scale + 120,
    };
    context.setTransform(scale, 0, 0, scale, view.x - camX * scale, view.y - camY * scale);
    if (screen === SCREEN_TITLE) {
      context.setTransform(scale, 0, 0, scale, view.x, view.y);
      drawTitle(state, save);
      return;
    }
    drawGround(state, rect, state.time);
    drawEffects(state, rect);
    for (const car of state.cars) {
      if (car.wreck && car.driver !== 'player') {
        if (!inView(rect, car.x, car.y, 80)) continue;
      }
      if (!inView(rect, car.x, car.y, 80)) continue;
      drawCar(car, state.time);
    }
    for (const ped of state.peds) {
      if (!inView(rect, ped.x, ped.y, 30)) continue;
      drawPed(ped, state.time);
    }
    for (const cop of state.cops) {
      if (!cop.alive) continue;
      if (!cop.onFoot) continue;
      if (!inView(rect, cop.x, cop.y, 30)) continue;
      drawPed({ ...cop, color: '#20242e', role: 'cop', alive: true, fade: 0 }, state.time);
    }
    drawPlayer(state, state.time);
    const marker = state.missions ? state.missions.marker() : null;
    drawMarker(marker, state.time);
    context.setTransform(scale, 0, 0, scale, view.x, view.y);
    drawHud(state, marker);
    if (screen === SCREEN_PAUSED) drawPaused();
  }

  /** Turn a screen-space mouse position into world coordinates. */
  function screenToWorld(clientX, clientY, camera) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    const wx = (px - view.x) / view.scale + camera.x - VIEW.width / view.scale / 2;
    const wy = (py - view.y) / view.scale + camera.y - VIEW.height / view.scale / 2;
    return { x: wx, y: wy };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, VIEW };
}
