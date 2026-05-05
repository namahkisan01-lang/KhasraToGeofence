import proj4 from "proj4";

// UP cadastre uses UTM Zone 44N (EPSG:32644) — central meridian 81°E.
// (Bihar uses 45N. For other states, swap the source CRS here.)
proj4.defs(
  "EPSG:32644",
  "+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs +type=crs"
);

const utmToWgs84 = proj4("EPSG:32644", "EPSG:4326");

export function utmPointToLatLon(x, y) {
  const [lon, lat] = utmToWgs84.forward([x, y]);
  return { lat, lon };
}

export function utmBboxToWgs84({ xmin, ymin, xmax, ymax }) {
  // Project the four corners separately rather than just opposite corners,
  // because UTM is not perfectly axis-aligned with lat/lon at scale.
  const corners = [
    utmToWgs84.forward([xmin, ymin]),
    utmToWgs84.forward([xmax, ymin]),
    utmToWgs84.forward([xmax, ymax]),
    utmToWgs84.forward([xmin, ymax]),
  ];
  const lons = corners.map(c => c[0]);
  const lats = corners.map(c => c[1]);
  return {
    lonMin: Math.min(...lons),
    lonMax: Math.max(...lons),
    latMin: Math.min(...lats),
    latMax: Math.max(...lats),
  };
}

/**
 * Pad a UTM bbox by `padMeters` on all sides, then return both the padded UTM
 * bbox (for sending to WMS) and its WGS84 equivalent (for anchoring a Google
 * Maps GroundOverlay). The padding is computed in metres so it scales the same
 * regardless of plot size.
 */
export function paddedUtmAndWgs84({ xmin, ymin, xmax, ymax }, padMeters = 200) {
  const w = xmax - xmin;
  const h = ymax - ymin;
  // Pad at least padMeters, or the plot's longer side (whichever is larger),
  // so big plots still get context around them.
  const pad = Math.max(padMeters, Math.max(w, h));
  const padded = {
    xmin: xmin - pad,
    ymin: ymin - pad,
    xmax: xmax + pad,
    ymax: ymax + pad,
  };
  const wgs84 = utmBboxToWgs84(padded);
  return { utm: padded, wgs84 };
}
