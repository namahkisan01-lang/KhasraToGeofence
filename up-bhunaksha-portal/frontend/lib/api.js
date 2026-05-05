const BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

async function jsonOrThrow(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error || body.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.detail = body.detail;
    throw err;
  }
  return body;
}

export async function fetchDistricts() {
  const res = await fetch(`${BASE}/api/districts`);
  const body = await jsonOrThrow(res);
  return body.data;
}

export async function fetchTehsils(district) {
  const url = new URL(`${BASE}/api/tehsils`);
  url.searchParams.set("district", district);
  const res = await fetch(url);
  const body = await jsonOrThrow(res);
  return body.data;
}

export async function fetchVillages(district, tehsil) {
  const url = new URL(`${BASE}/api/villages`);
  url.searchParams.set("district", district);
  url.searchParams.set("tehsil", tehsil);
  const res = await fetch(url);
  const body = await jsonOrThrow(res);
  return body.data;
}

export async function lookupPlot({ district, tehsil, village, plotNo }) {
  const res = await fetch(`${BASE}/api/plot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ district, tehsil, village, plotNo }),
  });
  return jsonOrThrow(res);
}
