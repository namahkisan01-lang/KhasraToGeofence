import { Router } from "express";
import {
  fetchGisCode,
  fetchPlotByPlotNo,
  fetchVillageExtent,
} from "../upClient.js";
import * as cache from "../cache.js";
import { utmPointToLatLon, utmBboxToWgs84, paddedUtmAndWgs84 } from "../proj.js";
import { tracePlotPolygon } from "../polygon.js";

const STATE_CODE = "09";
const UPSTREAM_WMS = "https://upbhunaksha.gov.in/bhunakshaserver/WMS";

function buildWmsUrl({ layers, styles, bboxWgs84, gisCode, plotId, width = 1024, height = 1024 }) {
  const params = new URLSearchParams({
    REQUEST: "GetMap",
    SERVICE: "WMS",
    VERSION: "1.1.1",
    LAYERS: layers,
    STYLES: styles,
    FORMAT: "image/png",
    TRANSPARENT: "true",
    SRS: "EPSG:4326",
    WIDTH: String(width),
    HEIGHT: String(height),
    // WMS 1.1.1 uses lon,lat order for BBOX
    BBOX: `${bboxWgs84.lonMin},${bboxWgs84.latMin},${bboxWgs84.lonMax},${bboxWgs84.latMax}`,
    state: STATE_CODE,
    gis_code: gisCode,
  });
  if (plotId) params.set("plot_id", plotId);
  return `${UPSTREAM_WMS}?${params.toString()}`;
}

const router = Router();

function pickNumber(...values) {
  for (const v of values) {
    if (v === undefined || v === null || v === "") continue;
    const n = typeof v === "number" ? v : parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalisePlot(raw, { gisCode, plotNo, attribution }) {
  // UP returns plain objects like {minx, miny, maxx, maxy, id, kide, bhucode}.
  // Bihar's variant (xmin, ymin, ...) is also tolerated.
  // "Not found" responses are usually {} or have all-zero bbox.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { found: false, reason: "empty response" };
  }
  if (raw.has_data === "N") {
    return { found: false, reason: "has_data=N" };
  }
  const xmin = pickNumber(raw.minx, raw.xmin);
  const ymin = pickNumber(raw.miny, raw.ymin);
  const xmax = pickNumber(raw.maxx, raw.xmax);
  const ymax = pickNumber(raw.maxy, raw.ymax);
  if (xmin === null || ymin === null || xmax === null || ymax === null) {
    return { found: false, reason: "no bbox in response", raw };
  }
  if (xmin === 0 && ymin === 0 && xmax === 0 && ymax === 0) {
    return { found: false, reason: "zero bbox (village not imported)", raw };
  }

  const cx = pickNumber(raw.center_x, (xmin + xmax) / 2);
  const cy = pickNumber(raw.center_y, (ymin + ymax) / 2);

  const center = utmPointToLatLon(cx, cy);
  const bboxWgs84 = utmBboxToWgs84({ xmin, ymin, xmax, ymax });
  const resolvedKhasra = raw.kide || raw.plotNo || plotNo;
  const resolvedPlotId = raw.id || raw.ID || null;
  const resolvedGisCode = raw.bhucode || raw.gisCode || gisCode;

  return {
    found: true,
    gisCode: resolvedGisCode,
    plotNo: String(resolvedKhasra),
    plotId: resolvedPlotId,
    pniu: raw.PNIU || null,
    attribution: attribution || raw.attribution || null,
    info: raw.info || null,
    area: raw.area || null,
    plotInfoLinks: raw.plotInfoLinks || null,
    centerUtm: { x: cx, y: cy },
    centerWgs84: center,
    bboxUtm: { xmin, ymin, xmax, ymax },
    bboxWgs84,
    googleMapsUrl: `https://www.google.com/maps?q=${center.lat.toFixed(6)},${center.lon.toFixed(6)}`,
  };
}

/**
 * Build a tight WMS request just for the plot polygon (with small padding so the
 * polygon doesn't touch the image edge). Used internally to extract vector
 * coordinates -- not sent to the frontend.
 */
function buildTracingWmsUrl({ bboxUtm, bboxWgs84, gisCode, plotId }) {
  return buildWmsUrl({
    layers: "PLOT_LIST",
    styles: "PLOT_SELECTION",
    bboxWgs84,
    gisCode,
    plotId,
    width: 1024,
    height: 1024,
  });
}

router.post("/", async (req, res, next) => {
  try {
    const { district, tehsil, village, plotNo } = req.body || {};
    if (!district || !tehsil || !village || !plotNo) {
      return res.status(400).json({
        error: "Missing required body fields: district, tehsil, village, plotNo",
      });
    }

    const levelsCsv = `${district},${tehsil},${village},`;
    const plotKey = String(plotNo).trim();

    // 1. Resolve gisCode (cached forever -- it's deterministic)
    let gisCode = cache.getGisCode(levelsCsv);
    if (!gisCode) {
      gisCode = await fetchGisCode(levelsCsv);
      if (!gisCode || gisCode === "null") {
        return res.status(404).json({ error: "Could not resolve gisCode for this village" });
      }
      cache.setGisCode(levelsCsv, gisCode);
    }

    // 2. Plot cache hit?
    const cached = cache.getPlot(gisCode, plotKey);
    if (cached) return res.json({ ...cached, source: "cache" });

    // 3. Live fetch
    let extent = null;
    try {
      extent = await fetchVillageExtent(levelsCsv);
    } catch {
      // attribution is nice-to-have, not required.
    }

    const raw = await fetchPlotByPlotNo(gisCode, plotKey);
    const normalised = normalisePlot(raw, {
      gisCode,
      plotNo: plotKey,
      attribution: extent ? extent.attribution : null,
    });

    if (!normalised.found) {
      return res.status(404).json({
        error: "Plot not found in this village",
        detail: normalised.reason,
        gisCode,
        plotNo: plotKey,
      });
    }

    // Trace the actual polygon shape from the WMS PNG (vector coords).
    // Uses a tight bbox padded just enough so the polygon doesn't touch image edges.
    try {
      const tracingPad = paddedUtmAndWgs84(normalised.bboxUtm, 30);
      const tracingUrl = buildTracingWmsUrl({
        bboxUtm: tracingPad.utm,
        bboxWgs84: tracingPad.wgs84,
        gisCode: normalised.gisCode,
        plotId: normalised.plotId,
      });
      const polygon = await tracePlotPolygon(tracingUrl, tracingPad.utm, {
        simplifyPx: 1.5,
      });
      if (polygon && polygon.length >= 3) {
        normalised.polygon = polygon;
      }
    } catch (e) {
      console.warn("[polygon] trace failed:", e.message);
      // Non-fatal -- we still have center + bbox.
    }

    cache.setPlot(gisCode, plotKey, normalised);
    res.json({ ...normalised, source: "live" });
  } catch (err) {
    next(err);
  }
});

export default router;
