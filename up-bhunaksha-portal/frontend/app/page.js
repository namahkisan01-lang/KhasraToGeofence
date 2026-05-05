"use client";

import { useEffect, useState } from "react";
import SearchableSelect from "./components/SearchableSelect";
import PlotMap from "./components/PlotMap";
import PlotInfoCard from "./components/PlotInfoCard";
import {
  fetchDistricts,
  fetchTehsils,
  fetchVillages,
  lookupPlot,
} from "@/lib/api";

export default function HomePage() {
  const [districts, setDistricts] = useState([]);
  const [tehsils, setTehsils] = useState([]);
  const [villages, setVillages] = useState([]);

  const [loadingDistricts, setLoadingDistricts] = useState(true);
  const [loadingTehsils, setLoadingTehsils] = useState(false);
  const [loadingVillages, setLoadingVillages] = useState(false);

  const [district, setDistrict] = useState("");
  const [tehsil, setTehsil] = useState("");
  const [village, setVillage] = useState("");
  const [plotNo, setPlotNo] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDistricts()
      .then(setDistricts)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingDistricts(false));
  }, []);

  useEffect(() => {
    if (!district) {
      setTehsils([]);
      setTehsil("");
      return;
    }
    setLoadingTehsils(true);
    setTehsil("");
    setVillage("");
    setVillages([]);
    fetchTehsils(district)
      .then(setTehsils)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingTehsils(false));
  }, [district]);

  useEffect(() => {
    if (!district || !tehsil) {
      setVillages([]);
      setVillage("");
      return;
    }
    setLoadingVillages(true);
    setVillage("");
    fetchVillages(district, tehsil)
      .then(setVillages)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingVillages(false));
  }, [district, tehsil]);

  async function onSubmit(e) {
    e?.preventDefault();
    setError(null);
    setResult(null);
    if (!district || !tehsil || !village || !plotNo.trim()) {
      setError("Please pick district, tehsil, village and enter plot number.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await lookupPlot({
        district,
        tehsil,
        village,
        plotNo: plotNo.trim(),
      });
      setResult(r);
    } catch (e) {
      setError(
        e.status === 404
          ? "Plot not found in this village. Double-check the khasra number, or this village may not be digitised yet."
          : e.message
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !!district && !!tehsil && !!village && !!plotNo.trim() && !submitting;

  return (
    <main className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              UP Land Lookup{" "}
              <span className="text-slate-400 font-normal">— खसरा खोजें</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Find any UP plot on Google Maps using its khasra number.
            </p>
          </div>
          <a
            href="https://upbhunaksha.gov.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            Source: upbhunaksha.gov.in ↗
          </a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: form */}
        <section className="lg:col-span-4 space-y-4">
          <form onSubmit={onSubmit} className="card p-5 space-y-4">
            <div>
              <label className="label">जिला / District</label>
              <SearchableSelect
                items={districts}
                value={district}
                onChange={setDistrict}
                loading={loadingDistricts}
                placeholder="— चुनें —"
              />
            </div>

            <div>
              <label className="label">तहसील / Tehsil</label>
              <SearchableSelect
                items={tehsils}
                value={tehsil}
                onChange={setTehsil}
                loading={loadingTehsils}
                disabled={!district}
                placeholder={!district ? "Pick a district first" : "— चुनें —"}
              />
            </div>

            <div>
              <label className="label">गाँव / Village</label>
              <SearchableSelect
                items={villages}
                value={village}
                onChange={setVillage}
                loading={loadingVillages}
                disabled={!tehsil}
                placeholder={!tehsil ? "Pick a tehsil first" : "— चुनें —"}
              />
              {villages.length > 0 && (
                <p className="text-xs text-slate-400 mt-1.5">
                  {villages.length} villages in this tehsil. Type to search.
                </p>
              )}
            </div>

            <div>
              <label className="label">खसरा संख्या / Khasra No.</label>
              <input
                type="text"
                inputMode="text"
                value={plotNo}
                onChange={(e) => setPlotNo(e.target.value)}
                placeholder="e.g. 176, 176/1, 176क"
                className="input"
                disabled={!village}
              />
            </div>

            <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
              {submitting ? "Searching..." : "Show on Map"}
            </button>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
          </form>

          {result && <PlotInfoCard result={result} />}
        </section>

        {/* Right: map */}
        <section className="lg:col-span-8">
          <div className="card overflow-hidden h-[70vh] lg:h-[calc(100vh-7rem)] min-h-[400px]">
            <PlotMap result={result} />
          </div>
        </section>
      </div>

      <footer className="max-w-7xl mx-auto px-4 py-6 text-xs text-slate-400">
        Coordinates are derived live from upbhunaksha.gov.in and converted from
        UTM Zone 44N to WGS-84. Owner / area data, when present in the upstream
        response, is shown unmodified.
      </footer>
    </main>
  );
}
