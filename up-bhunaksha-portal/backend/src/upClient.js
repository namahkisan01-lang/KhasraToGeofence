import axios from "axios";

const BASE = "https://upbhunaksha.gov.in/bhunakshaserver";

const http = axios.create({
  baseURL: BASE,
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Referer: "https://upbhunaksha.gov.in/",
  },
});

function form(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) usp.set(k, String(v));
  }
  return usp;
}

/**
 * masterdata/levelvalue: hierarchical lists.
 *   level=1, codes=""                 -> all districts
 *   level=2, codes="<dCode>"          -> tehsils in district
 *   level=3, codes="<dCode>,<tCode>"  -> villages in tehsil
 *
 * Returns: [{ code, value, hasData }, ...]
 *   Note: `value` is the Hindi (Devanagari) name; UP doesn't expose English.
 */
export async function fetchLevelValues(level, codes) {
  const { data } = await http.post(
    "/masterdata/levelvalue",
    form({ level, codes }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({
    code: item.code,
    name: item.value,
    hasData: !!(item.extraParams && item.extraParams.hasData),
  }));
}

/**
 * Levels/getGisCodeFromLevels: turns a "<d>,<t>,<v>," string into a gisCode.
 *   Returns the gisCode as plain text (e.g. "19300978199245").
 */
export async function fetchGisCode(levelsCsv) {
  const { data } = await http.post(
    `/Levels/getGisCodeFromLevels?gisLevels=${encodeURIComponent(levelsCsv)}`,
    null,
    { responseType: "text" }
  );
  return String(data).trim();
}

/**
 * MapInfo/getPlotByPlotNo: the direct khasra -> coordinates lookup.
 *   Body (form-encoded): giscode=<>&plotno=<>
 *   Returns: {} if plot not found, otherwise an object with bbox/centroid/owner.
 *
 * The exact field names depend on the upstream — common keys:
 *   xmin, ymin, xmax, ymax (UTM 44N)
 *   center_x, center_y     (UTM 44N centroid; sometimes absent)
 *   has_data, plotNo, ID, PNIU, gisCode, info, area, plotInfoLinks
 */
export async function fetchPlotByPlotNo(giscode, plotno) {
  const { data } = await http.post(
    "/MapInfo/getPlotByPlotNo",
    form({ giscode, plotno }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data;
}

/**
 * MapInfo/getVVVVExtentGeoref: village extent + canonical gisCode + Hindi attribution.
 *   Body (form-encoded): gisLevels=<d>,<t>,<v>,&srs=0&state=09
 */
export async function fetchVillageExtent(levelsCsv) {
  const { data } = await http.post(
    "/MapInfo/getVVVVExtentGeoref",
    form({ gisLevels: levelsCsv, srs: "0", state: "09" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data;
}
