"use client";

import { useState } from "react";

function Row({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-900 text-right break-all">{value}</span>
    </div>
  );
}

/**
 * Build a GeoJSON FeatureCollection in the format the user requested
 * (matches the screenshot of a saved geofence file). Notable quirks:
 *   - properties.mapCenter is [lat, lng]   (non-standard order)
 *   - geometry.coordinates use [lng, lat]  (standard GeoJSON order)
 *   - top-level metadata.savedAt is an ISO timestamp
 *   - properties.shapeType + mapZoom are app-specific extensions
 */
function buildGeoJson(result) {
  const center = result.centerWgs84;
  const ring = result.polygon.map((p) => [p.lng, p.lat]);

  // GeoJSON requires the ring to be closed (first == last)
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          shapeType: "polygon",
          mapCenter: [center.lat, center.lon],
          mapZoom: 18,
          plotNo: result.plotNo,
          gisCode: result.gisCode,
          plotId: result.plotId,
        },
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      },
    ],
    metadata: {
      savedAt: new Date().toISOString(),
      source: "upbhunaksha.gov.in (via UP Land Lookup)",
    },
  };
}

function geofenceFilename(result) {
  const lat4 = result.centerWgs84.lat.toFixed(4);
  const lon4 = result.centerWgs84.lon.toFixed(4);
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `fence_${lat4}N_${lon4}E_polygon_${yyyymmdd}.geojson`;
}

export default function PlotInfoCard({ result }) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;

  const lat = result.centerWgs84.lat.toFixed(6);
  const lon = result.centerWgs84.lon.toFixed(6);
  const hasPolygon = Array.isArray(result.polygon) && result.polygon.length >= 3;

  async function copyLatLon() {
    try {
      await navigator.clipboard.writeText(`${lat}, ${lon}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function downloadGeojson() {
    if (!hasPolygon) return;
    const geojson = buildGeoJson(result);
    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = geofenceFilename(result);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-xs text-slate-500">Plot</div>
          <div className="text-2xl font-semibold text-slate-900">
            {result.plotNo}
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            result.source === "cache"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {result.source === "cache" ? "from cache" : "live"}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        <Row label="Latitude" value={`${lat}° N`} />
        <Row label="Longitude" value={`${lon}° E`} />
        <Row label="GIS code" value={result.gisCode} />
        {result.plotId && <Row label="Plot ID" value={result.plotId} />}
      </div>

      <div className="mt-4 space-y-2">
        <a
          href={result.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full"
        >
          Open in Google Maps
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
          </svg>
        </a>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadGeojson}
            disabled={!hasPolygon}
            title={
              hasPolygon
                ? "Download as .geojson"
                : "No polygon available for this plot"
            }
            className="btn-ghost border border-slate-200 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM7.293 7.707A1 1 0 016 7V3a1 1 0 112 0v4a1 1 0 01-1.293.707l-.707-.707zm5.414 0L13.414 7l-.707.707L13.414 8l-.707-.707zM10 13a1 1 0 01-.707-.293l-3-3a1 1 0 011.414-1.414L9 9.586V3a1 1 0 112 0v6.586l1.293-1.293a1 1 0 011.414 1.414l-3 3A1 1 0 0110 13z"
                clipRule="evenodd"
              />
            </svg>
            Download GeoJSON
          </button>
          <button onClick={copyLatLon} className="btn-ghost border border-slate-200">
            {copied ? "Copied!" : "Copy lat/lon"}
          </button>
        </div>
      </div>
    </div>
  );
}
