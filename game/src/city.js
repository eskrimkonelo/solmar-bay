// Solmar Bay itself: a seeded procedural city. Roads on a grid, blocks between them holding
// buildings, parks and landmarks, a beach and a bay along the south edge, and a road graph the
// traffic drives on. Everything is pure data: the renderer draws it, the world collides with it.

import { CITY, PALETTE, WORLD } from './config.js';

// Landmark blocks, in grid coordinates (col, row). Everything else becomes buildings or parks.
const LANDMARKS = {
  garage: { col: 1, row: 5, kind: 'garage' },
  hospital: { col: 8, row: 1, kind: 'hospital' },
  police: { col: 5, row: 3, kind: 'police' },
  marina: { col: 9, row: 6, kind: 'marina' },
};
const PARKS = [{ col: 3, row: 2 }, { col: 6, row: 5 }, { col: 2, row: 1 }];

/** A road centre line, with its two ends. */
function roadRects() {
  const vertical = [];
  const horizontal = [];
  for (let col = 0; col <= CITY.cols; col += 1) {
    const x = CITY.originX + col * CITY.blockPitch;
    vertical.push({ x, y0: CITY.originY, y1: CITY.bayY });
  }
  for (let row = 0; row <= CITY.rows; row += 1) {
    const y = CITY.originY + row * CITY.blockPitch;
    horizontal.push({ y, x0: CITY.originX, x1: CITY.originX + CITY.cols * CITY.blockPitch });
  }
  return { vertical, horizontal };
}

/** Intersections of the grid, with neighbours for routing. */
function buildGraph() {
  const nodes = [];
  const index = new Map();
  for (let row = 0; row <= CITY.rows; row += 1) {
    for (let col = 0; col <= CITY.cols; col += 1) {
      const x = CITY.originX + col * CITY.blockPitch;
      const y = CITY.originY + row * CITY.blockPitch;
      const id = nodes.length;
      nodes.push({ id, x, y, neighbors: [] });
      index.set(`${col},${row}`, id);
    }
  }
  function link(col, row, dcol, drow) {
    const a = index.get(`${col},${row}`);
    const b = index.get(`${col + dcol},${row + drow}`);
    if (a === undefined || b === undefined) return;
    nodes[a].neighbors.push(b);
    nodes[b].neighbors.push(a);
  }
  for (let row = 0; row <= CITY.rows; row += 1) {
    for (let col = 0; col <= CITY.cols; col += 1) {
      link(col, row, 1, 0);
      link(col, row, 0, 1);
    }
  }
  return nodes;
}

export function createCity(random) {
  const roads = roadRects();
  const graph = buildGraph();
  const buildings = [];
  const parks = [];
  const palms = [];
  const parkedSpots = [];
  const blocks = [];
  const landmarks = {};

  function blockRect(col, row) {
    const x = CITY.originX + col * CITY.blockPitch + CITY.roadWidth / 2 + CITY.sidewalk;
    const y = CITY.originY + row * CITY.blockPitch + CITY.roadWidth / 2 + CITY.sidewalk;
    const w = CITY.blockPitch - CITY.roadWidth - CITY.sidewalk * 2;
    const h = CITY.blockPitch - CITY.roadWidth - CITY.sidewalk * 2;
    return { x, y, w, h };
  }

  function landmarkAt(col, row) {
    for (const [name, spot] of Object.entries(LANDMARKS)) {
      if (spot.col === col && spot.row === row) return { name, kind: spot.kind };
    }
    return null;
  }
  function isPark(col, row) {
    return PARKS.some((p) => p.col === col && p.row === row);
  }

  for (let row = 0; row < CITY.rows; row += 1) {
    for (let col = 0; col < CITY.cols; col += 1) {
      const rect = blockRect(col, row);
      const mark = landmarkAt(col, row);
      if (mark) {
        landmarks[mark.name] = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, w: rect.w, h: rect.h, kind: mark.kind };
        blocks.push({ ...rect, kind: mark.kind });
        // One big landmark building, centred, leaving a forecourt.
        buildings.push({
          x: rect.x + rect.w * 0.14, y: rect.y + rect.h * 0.16,
          w: rect.w * 0.72, h: rect.h * 0.68,
          roof: mark.kind === 'hospital' ? '#e8e4da' : mark.kind === 'police' ? '#4f6a8a' : mark.kind === 'garage' ? '#c96f4a' : '#8a6f8a',
          height: mark.kind === 'marina' ? 8 : 16,
          kind: mark.kind,
        });
        continue;
      }
      if (isPark(col, row)) {
        parks.push({ ...rect });
        blocks.push({ ...rect, kind: 'park' });
        for (let i = 0; i < 7; i += 1) {
          palms.push({ x: rect.x + random.range(20, rect.w - 20), y: rect.y + random.range(20, rect.h - 20) });
        }
        continue;
      }
      blocks.push({ ...rect, kind: 'buildings' });
      // Two to four buildings per block, with alleys between them.
      const count = random.int(2, 5);
      const vertical = random.chance(0.5);
      for (let i = 0; i < count; i += 1) {
        if (vertical) {
          const bw = rect.w * random.range(0.36, 0.44);
          const bh = rect.h * random.range(0.7, 0.86);
          const bx = rect.x + (i % 2) * (rect.w - bw) + random.range(-4, 4);
          const by = rect.y + (rect.h - bh) / 2 + random.range(-6, 6);
          buildings.push({ x: bx, y: by, w: bw, h: bh, roof: random.pick(PALETTE.buildingRoof), height: random.int(6, 22), kind: 'house' });
        } else {
          const bw = rect.w * random.range(0.7, 0.86);
          const bh = rect.h * random.range(0.36, 0.44);
          const bx = rect.x + (rect.w - bw) / 2 + random.range(-6, 6);
          const by = rect.y + (i % 2) * (rect.h - bh) + random.range(-4, 4);
          buildings.push({ x: bx, y: by, w: bw, h: bh, roof: random.pick(PALETTE.buildingRoof), height: random.int(6, 22), kind: 'house' });
        }
      }
    }
  }

  // Palm-lined beach and a marina with moored boats along the bay.
  for (let x = CITY.originX + 40; x < CITY.originX + CITY.cols * CITY.blockPitch; x += 130) {
    palms.push({ x: x + random.range(-20, 20), y: CITY.bayY - 46 + random.range(-8, 8) });
  }
  const boats = [];
  for (let i = 0; i < 6; i += 1) {
    boats.push({ x: CITY.originX + 400 + i * 260 + random.range(-30, 30), y: CITY.bayY + 70 + random.range(0, 60), angle: random.range(-0.2, 0.2) });
  }

  // Parked cars along road edges, every so often, on both sides.
  for (let col = 0; col <= CITY.cols; col += 1) {
    const x = CITY.originX + col * CITY.blockPitch;
    for (let y = CITY.originY + 160; y < CITY.bayY - 80; y += 320) {
      if (random.chance(0.55)) parkedSpots.push({ x: x - CITY.roadWidth / 2 - 18, y, angle: -Math.PI / 2 });
      if (random.chance(0.45)) parkedSpots.push({ x: x + CITY.roadWidth / 2 + 18, y: y + 140, angle: Math.PI / 2 });
    }
  }

  function isWater(x, y) {
    return y >= CITY.bayY;
  }
  function isRoad(x, y) {
    if (isWater(x, y)) return false;
    for (const road of roads.vertical) {
      if (Math.abs(x - road.x) <= CITY.roadWidth / 2 && y >= road.y0 && y <= road.y1) return true;
    }
    for (const road of roads.horizontal) {
      if (Math.abs(y - road.y) <= CITY.roadWidth / 2 && x >= road.x0 && x <= road.x1) return true;
    }
    return false;
  }
  function buildingAt(x, y) {
    for (const b of buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  /**
   * Push a circle (x, y, radius) out of every building and the water it overlaps, and report
   * whether anything blocked it. The circle's centre is moved in place.
   */
  function collideCircle(body) {
    let hit = false;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= body.radius * body.radius) continue;
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        body.x = cx + (dx / d) * body.radius;
        body.y = cy + (dy / d) * body.radius;
      } else {
        // Centre inside the building: push out along the smallest overlap.
        const left = body.x - b.x;
        const right = b.x + b.w - body.x;
        const top = body.y - b.y;
        const bottom = b.y + b.h - body.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) body.x = b.x - body.radius;
        else if (min === right) body.x = b.x + b.w + body.radius;
        else if (min === top) body.y = b.y - body.radius;
        else body.y = b.y + b.h + body.radius;
      }
    }
    // The bay is a wall, except the beach strip is walkable.
    if (body.y + body.radius > CITY.bayY + 26) {
      body.y = CITY.bayY + 26 - body.radius;
      hit = true;
    }
    if (body.x - body.radius < 30) { body.x = 30 + body.radius; hit = true; }
    if (body.x + body.radius > WORLD.width - 30) { body.x = WORLD.width - 30 - body.radius; hit = true; }
    if (body.y - body.radius < 30) { body.y = 30 + body.radius; hit = true; }
    if (body.y + body.radius > WORLD.height - 30) { body.y = WORLD.height - 30 - body.radius; hit = true; }
    return hit;
  }

  return {
    roads, graph, buildings, parks, palms, boats, parkedSpots, blocks, landmarks,
    isWater, isRoad, buildingAt, collideCircle,
  };
}
