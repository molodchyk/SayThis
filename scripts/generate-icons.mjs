import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

const ICONS = [16, 32, 48, 128];
const SCALE = 4;
const CRC_TABLE = createCrcTable();

for (const size of ICONS) {
  const png = renderIcon(size);
  const path = `assets/icons/icon${size}.png`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, png);
  console.log(`wrote ${path}`);
}

function renderIcon(size) {
  const canvas = createCanvas(size * SCALE, size * SCALE);
  const s = canvas.width;

  fillRoundedRect(canvas, 0.055 * s, 0.055 * s, 0.89 * s, 0.89 * s, 0.22 * s, [15, 107, 88, 255]);
  fillCircle(canvas, 0.27 * s, 0.27 * s, 0.055 * s, [207, 246, 234, 255]);
  fillPolygon(canvas, [
    [0.25 * s, 0.43 * s],
    [0.38 * s, 0.43 * s],
    [0.54 * s, 0.29 * s],
    [0.54 * s, 0.71 * s],
    [0.38 * s, 0.57 * s],
    [0.25 * s, 0.57 * s]
  ], [255, 255, 255, 255]);
  strokeArc(canvas, 0.52 * s, 0.5 * s, 0.18 * s, -0.85, 0.85, 0.052 * s, [255, 255, 255, 245]);
  strokeArc(canvas, 0.52 * s, 0.5 * s, 0.3 * s, -0.78, 0.78, 0.048 * s, [255, 255, 255, 220]);

  return encodePng(downsample(canvas, SCALE));
}

function createCanvas(width, height) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  };
}

function fillRoundedRect(canvas, x, y, width, height, radius, color) {
  const x2 = x + width;
  const y2 = y + height;
  for (let py = Math.floor(y); py <= Math.ceil(y2); py += 1) {
    for (let px = Math.floor(x); px <= Math.ceil(x2); px += 1) {
      const nearestX = clamp(px, x + radius, x2 - radius);
      const nearestY = clamp(py, y + radius, y2 - radius);
      const dx = px - nearestX;
      const dy = py - nearestY;
      if (dx * dx + dy * dy <= radius * radius) {
        blendPixel(canvas, px, py, color);
      }
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py += 1) {
    for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r2) {
        blendPixel(canvas, px, py, color);
      }
    }
  }
}

function fillPolygon(canvas, points, color) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  for (let py = Math.floor(Math.min(...ys)); py <= Math.ceil(Math.max(...ys)); py += 1) {
    for (let px = Math.floor(Math.min(...xs)); px <= Math.ceil(Math.max(...xs)); px += 1) {
      if (pointInPolygon(px, py, points)) {
        blendPixel(canvas, px, py, color);
      }
    }
  }
}

function strokeArc(canvas, cx, cy, radius, startAngle, endAngle, width, color) {
  const outer = radius + width / 2;
  const inner = radius - width / 2;
  for (let py = Math.floor(cy - outer); py <= Math.ceil(cy + outer); py += 1) {
    for (let px = Math.floor(cx - outer); px <= Math.ceil(cx + outer); px += 1) {
      const dx = px - cx;
      const dy = py - cy;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      if (distance >= inner && distance <= outer && angle >= startAngle && angle <= endAngle) {
        blendPixel(canvas, px, py, color);
      }
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = ((yi > y) !== (yj > y)) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function blendPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }

  const offset = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
  const sourceAlpha = color[3] / 255;
  const targetAlpha = canvas.data[offset + 3] / 255;
  const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) {
    return;
  }

  for (let channel = 0; channel < 3; channel += 1) {
    canvas.data[offset + channel] = Math.round(
      (color[channel] * sourceAlpha + canvas.data[offset + channel] * targetAlpha * (1 - sourceAlpha)) / outAlpha
    );
  }
  canvas.data[offset + 3] = Math.round(outAlpha * 255);
}

function downsample(canvas, factor) {
  const width = canvas.width / factor;
  const height = canvas.height / factor;
  const next = createCanvas(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let fy = 0; fy < factor; fy += 1) {
        for (let fx = 0; fx < factor; fx += 1) {
          const source = ((y * factor + fy) * canvas.width + (x * factor + fx)) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += canvas.data[source + channel];
          }
        }
      }

      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        next.data[target + channel] = Math.round(totals[channel] / (factor * factor));
      }
    }
  }

  return next;
}

function encodePng(canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rowStart = y * (canvas.width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < canvas.width * 4; x += 1) {
      raw[rowStart + 1 + x] = canvas.data[y * canvas.width * 4 + x];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr(canvas.width, canvas.height)),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function ihdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
