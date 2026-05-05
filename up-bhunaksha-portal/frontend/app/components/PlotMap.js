"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from "@react-google-maps/api";

const containerStyle = { width: "100%", height: "100%" };

const POLYGON_OPTIONS = {
  fillColor: "#ef4444",
  fillOpacity: 0.35,
  strokeColor: "#dc2626",
  strokeOpacity: 1,
  strokeWeight: 2.5,
  clickable: false,
  draggable: false,
  editable: false,
  geodesic: false,
  zIndex: 2,
};

export default function PlotMap({ result }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-maps-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  const mapRef = useRef(null);

  function onLoad(map) {
    mapRef.current = map;
  }

  // Each polygon vertex from backend is {lat, lng} -- the same shape Google
  // Maps Polygon expects. We keep the array stable across re-renders.
  const polygonPath = useMemo(() => {
    if (!result?.polygon || result.polygon.length < 3) return null;
    return result.polygon;
  }, [result]);

  // Auto-fit the map to the polygon bounds whenever a new result arrives.
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    if (!polygonPath) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const p of polygonPath) bounds.extend(p);
    mapRef.current.fitBounds(bounds, 64); // 64px inner padding so polygon isn't flush to edge
  }, [polygonPath]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-red-600 p-4">
        Could not load Google Maps. Check your API key restrictions.
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-slate-400">
        Loading map...
      </div>
    );
  }

  const center = result
    ? { lat: result.centerWgs84.lat, lng: result.centerWgs84.lon }
    : { lat: 26.85, lng: 80.95 }; // Lucknow, central UP fallback

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={result ? 18 : 7}
      mapTypeId="hybrid"
      onLoad={onLoad}
      options={{
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: true,
        rotateControl: false,
      }}
    >
      {result && polygonPath && (
        <Polygon
          paths={polygonPath}
          options={POLYGON_OPTIONS}
        />
      )}
      {result && (
        <Marker
          position={center}
          title={`Plot ${result.plotNo}`}
        />
      )}
    </GoogleMap>
  );
}
