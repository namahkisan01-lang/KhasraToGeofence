/**
 * Trace the actual plot polygon out of the BhuNaksha WMS PNG.
 *
 * The upstream API never returns vector coordinates -- only a bbox (rectangle)
 * via getPlotByPlotNo and a rendered raster via WMS. So to draw the *real*
 * polygon shape on Google Maps, we:
 *
 *   1. Fetch the PLOT_LIST WMS PNG at high resolution. This is a transparent
 *      image with the selected plot filled in red.
 *   2. Parse the PNG and build a binary mask: alpha > threshold -> "inside".
 *   3. Run marching squares to extract the iso-contour at level 0.5.
 *   4. Pick the largest closed contour (the plot itself; ignores stray pixels).
 *   5. Simplify with Douglas-Peucker so we end up with ~30-80 vertices instead
 *      of thousands of pixel-by-pixel points.
 *   6. Convert each pixel coordinate -> UTM (using the WMS BBOX) -> WGS84.
 *
 * Net result: a closed array of {lat, lng} that traces the plot boundary as
 * accurately as the WMS image resolution allows (~15 cm at 2048px).
 */

import axios from "axios";
import { PNG } from "pngjs";
import proj4 from "proj4";

// Same UTM 44N <-> WGS84 transformer used elsewhere
proj4.defs(
  "EPSG:32644",
  "+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs +type=crs"
);
const utmToWgs84 = proj4("EPSG:32644", "EPSG:4326");

// ---------------------------------------------------------------------------
// PNG fetch
// ---------------------------------------------------------------------------

async function fetchPng(url) {
  const { data } = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Referer: "https://upbhunaksha.gov.in/",
    },
  });
  return new Promise((resolve, reject) => {
    new PNG().parse(Buffer.from(data), (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

// ---------------------------------------------------------------------------
// Marching squares
// ---------------------------------------------------------------------------

/**
 * Given a binary mask (Uint8Array, 1 = inside, 0 = outside) of size W x H,
 * extract iso-contour line segments at level 0.5 using marching squares.
 *
 * Each cell looks at 4 corners (top-left, top-right, bottom-left, bottom-right)
 * and produces 0, 1 or 2 line segments based on the 16 possible patterns.
 * Vertices are placed at edge midpoints (0.5 offsets from cell origin).
 */
function marchingSquares(mask, W, H) {
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mask[y * W + x]);
  const segments = [];

  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = get(x, y);
      const tr = get(x + 1, y);
      const br = get(x + 1, y + 1);
      const bl = get(x, y + 1);
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;

      // Edge midpoints. Coords are in pixel space (image origin top-left).
      const top = [x + 0.5, y];
      const right = [x + 1, y + 0.5];
      const bottom = [x + 0.5, y + 1];
      const left = [x, y + 0.5];

      // Each non-trivial pattern produces 1 or 2 line segments.
      // Refs: https://en.wikipedia.org/wiki/Marching_squares
      switch (code) {
        case 0:
        case 15:
          break; // all out / all in
        case 1: segments.push([left, bottom]); break;
        case 2: segments.push([bottom, right]); break;
        case 3: segments.push([left, right]); break;
        case 4: segments.push([top, right]); break;
        case 5: // saddle
          segments.push([left, top]);
          segments.push([bottom, right]);
          break;
        case 6: segments.push([top, bottom]); break;
        case 7: segments.push([left, top]); break;
        case 8: segments.push([top, left]); break;
        case 9: segments.push([top, bottom]); break;
        case 10: // saddle
          segments.push([top, right]);
          segments.push([bottom, left]);
          break;
        case 11: segments.push([top, right]); break;
        case 12: segments.push([left, right]); break;
        case 13: segments.push([bottom, right]); break;
        case 14: segments.push([left, bottom]); break;
      }
    }
  }
  return segments;
}

/**
 * Connect line segments into closed loops by chaining endpoints that match.
 * Returns an array of loops, each a list of [px, py] points.
 */
function segmentsToLoops(segments) {
  // Hash by stringified endpoint to find connecting segments fast
  const key = (p) => `${p[0]},${p[1]}`;
  const remaining = new Map();
  for (let i = 0; i < segments.length; i++) {
    remaining.set(i, segments[i]);
  }

  // Build a lookup: endpoint key -> list of segment indices touching it
  const endpointIndex = new Map();
  function indexEndpoint(k, segIdx) {
    if (!endpointIndex.has(k)) endpointIndex.set(k, []);
    endpointIndex.get(k).push(segIdx);
  }
  for (const [i, seg] of remaining) {
    indexEndpoint(key(seg[0]), i);
    indexEndpoint(key(seg[1]), i);
  }

  function pickNext(currentEnd, excludeIdx) {
    const k = key(currentEnd);
    const candidates = endpointIndex.get(k) || [];
    for (const idx of candidates) {
      if (idx === excludeIdx) continue;
      if (!remaining.has(idx)) continue;
      return idx;
    }
    return -1;
  }

  const loops = [];

  while (remaining.size > 0) {
    const startIdx = remaining.keys().next().value;
    const startSeg = remaining.get(startIdx);
    remaining.delete(startIdx);
    const loop = [startSeg[0], startSeg[1]];
    let lastIdx = startIdx;
    let curEnd = startSeg[1];

    while (true) {
      const nextIdx = pickNext(curEnd, lastIdx);
      if (nextIdx < 0) break;
      const seg = remaining.get(nextIdx);
      remaining.delete(nextIdx);
      // Pick the endpoint that isn't curEnd
      const next = key(seg[0]) === key(curEnd) ? seg[1] : seg[0];
      loop.push(next);
      lastIdx = nextIdx;
      curEnd = next;
      if (key(curEnd) === key(loop[0])) break; // closed
    }
    loops.push(loop);
  }
  return loops;
}

// ---------------------------------------------------------------------------
// Douglas-Peucker simplification
// ---------------------------------------------------------------------------

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points.slice();

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      dmax = d;
      index = i;
    }
  }

  if (dmax > tolerance) {
    const left = douglasPeucker(points.slice(0, index + 1), tolerance);
    const right = douglasPeucker(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the PLOT_LIST WMS PNG and return a closed polygon as [{lat, lng}, ...]
 * tracing the plot's actual boundary.
 *
 * @param {string} wmsUrl     A PLOT_LIST WMS URL with the desired BBOX baked in
 * @param {object} bboxUtm    The same BBOX in UTM 44N: {xmin, ymin, xmax, ymax}
 * @param {object} [opts]
 * @param {number} [opts.alphaThreshold=64]   Pixel alpha above this is "inside"
 * @param {number} [opts.simplifyPx=2]        Douglas-Peucker tolerance in pixels
 * @returns {Promise<Array<{lat:number, lng:number}>|null>}
 */
export async function tracePlotPolygon(wmsUrl, bboxUtm, opts = {}) {
  const alphaThreshold = opts.alphaThreshold ?? 64;
  const simplifyPx = opts.simplifyPx ?? 2;

  const png = await fetchPng(wmsUrl);
  const W = png.width;
  const H = png.height;

  // 1. Build binary mask from alpha channel
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    mask[i] = png.data[i * 4 + 3] > alphaThreshold ? 1 : 0;
  }

  // Quick reject: if no pixels are inside, no polygon
  let total = 0;
  for (let i = 0; i < mask.length; i++) total += mask[i];
  if (total === 0) return null;

  // 2. Marching squares -> line segments
  const segments = marchingSquares(mask, W, H);
  if (segments.length === 0) return null;

  // 3. Connect into loops, pick the largest (the plot)
  const loops = segmentsToLoops(segments);
  loops.sort((a, b) => b.length - a.length);
  let loop = loops[0];
  if (loop.length < 4) return null;

  // 4. Simplify
  const simplified = douglasPeucker(loop, simplifyPx);

  // 5. Convert pixel coords -> UTM -> WGS84
  // Pixel (0,0) is top-left of image; image bbox is bboxUtm.
  // UTM y grows northward, image y grows downward, so flip y.
  const xRange = bboxUtm.xmax - bboxUtm.xmin;
  const yRange = bboxUtm.ymax - bboxUtm.ymin;

  const polygon = [];
  for (const [px, py] of simplified) {
    const utmX = bboxUtm.xmin + (px / W) * xRange;
    const utmY = bboxUtm.ymax - (py / H) * yRange;
    const [lng, lat] = utmToWgs84.forward([utmX, utmY]);
    polygon.push({ lat, lng });
  }
  return polygon;
}
