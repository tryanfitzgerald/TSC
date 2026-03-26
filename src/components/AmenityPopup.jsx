import React, { useState, useEffect } from 'react';

// 0.1 miles ≈ 161 meters
const RADIUS_METERS = 161;

// Overpass amenity categories to query
const AMENITY_CATEGORIES = [
  { key: 'food', label: '🍔 Food & Drink', tags: ['amenity=restaurant', 'amenity=fast_food', 'amenity=cafe', 'amenity=coffee_shop', 'amenity=ice_cream', 'amenity=bar', 'amenity=pub', 'amenity=food_court'] },
  { key: 'shop', label: '🛒 Shopping', tags: ['shop=supermarket', 'shop=convenience', 'shop=mall', 'shop=department_store', 'shop=clothes', 'shop=electronics', 'shop=doityourself', 'shop=general'] },
  { key: 'service', label: '🏦 Services', tags: ['amenity=bank', 'amenity=atm', 'amenity=pharmacy', 'amenity=post_office', 'amenity=car_wash'] },
  { key: 'restroom', label: '🚻 Restrooms', tags: ['amenity=toilets'] },
  { key: 'fuel', label: '⛽ Fuel / EV', tags: ['amenity=fuel', 'amenity=charging_station'] },
  { key: 'lodging', label: '🏨 Lodging', tags: ['tourism=hotel', 'tourism=motel'] },
];

function buildOverpassQuery(lat, lng) {
  // Build a union of all tag queries within the radius
  const parts = [];
  AMENITY_CATEGORIES.forEach(cat => {
    cat.tags.forEach(tag => {
      const [k, v] = tag.split('=');
      parts.push(`node["${k}"="${v}"](around:${RADIUS_METERS},${lat},${lng});`);
      parts.push(`way["${k}"="${v}"](around:${RADIUS_METERS},${lat},${lng});`);
    });
  });

  return `[out:json][timeout:10];(${parts.join('')});out center tags 50;`;
}

function classifyPOI(tags) {
  for (const cat of AMENITY_CATEGORIES) {
    for (const tagStr of cat.tags) {
      const [k, v] = tagStr.split('=');
      if (tags[k] === v) return cat;
    }
  }
  return null;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToMiles(m) { return m / 1609.344; }

// Simple in-memory cache to avoid re-fetching for same location
const amenityCache = {};

export default function AmenityPopup({ lat, lng }) {
  const [amenities, setAmenities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

  useEffect(() => {
    // Check cache
    if (amenityCache[cacheKey]) {
      setAmenities(amenityCache[cacheKey]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const query = buildOverpassQuery(lat, lng);
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`Overpass ${r.status}`);
        return r.json();
      })
      .then(data => {
        const grouped = {};
        AMENITY_CATEGORIES.forEach(c => { grouped[c.key] = []; });

        (data.elements || []).forEach(el => {
          const tags = el.tags || {};
          const cat = classifyPOI(tags);
          if (!cat) return;

          const elLat = el.lat || el.center?.lat;
          const elLng = el.lon || el.center?.lon;
          if (!elLat || !elLng) return;

          const dist = haversineMeters(lat, lng, elLat, elLng);
          const name = tags.name || tags.brand || tags.operator || tags.amenity || tags.shop || tags.tourism || 'Unknown';

          // Dedupe by name within category
          if (!grouped[cat.key].find(a => a.name === name)) {
            grouped[cat.key].push({
              name,
              dist,
              distMi: metersToMiles(dist),
              cuisine: tags.cuisine,
              brand: tags.brand,
              opening_hours: tags.opening_hours,
            });
          }
        });

        // Sort each category by distance
        Object.keys(grouped).forEach(k => {
          grouped[k].sort((a, b) => a.dist - b.dist);
        });

        amenityCache[cacheKey] = grouped;
        setAmenities(grouped);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [lat, lng, cacheKey]);

  if (loading) {
    return (
      <div style={{ marginTop: 8, borderTop: '1px solid #2E4A60', paddingTop: 6 }}>
        <div style={{ fontSize: 10, color: '#8BAFC0' }}>Loading nearby amenities...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ marginTop: 8, borderTop: '1px solid #2E4A60', paddingTop: 6 }}>
        <div style={{ fontSize: 10, color: '#E76F51' }}>Amenities unavailable ({error})</div>
      </div>
    );
  }

  if (!amenities) return null;

  const totalCount = Object.values(amenities).reduce((s, arr) => s + arr.length, 0);

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #2E4A60', paddingTop: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8BAFC0', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        Nearby Amenities ({totalCount}) · 0.1 mi
      </div>

      {totalCount === 0 && (
        <div style={{ fontSize: 10, color: '#8BAFC0' }}>No POIs found within 0.1 miles.</div>
      )}

      {AMENITY_CATEGORIES.map(cat => {
        const items = amenities[cat.key];
        if (!items || items.length === 0) return null;
        return (
          <div key={cat.key} style={{ marginBottom: 5 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{cat.label}</div>
            {items.slice(0, 5).map((a, i) => (
              <div key={i} style={{ fontSize: 10, color: '#8BAFC0', display: 'flex', justifyContent: 'space-between', paddingLeft: 4, lineHeight: '1.5' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>
                  {a.name}
                  {a.cuisine && <span style={{ color: '#6B8A9E' }}> · {a.cuisine}</span>}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#6B8A9E', flexShrink: 0, marginLeft: 4 }}>
                  {a.distMi < 0.01 ? '<0.01' : a.distMi.toFixed(2)} mi
                </span>
              </div>
            ))}
            {items.length > 5 && (
              <div style={{ fontSize: 9, color: '#6B8A9E', paddingLeft: 4 }}>+{items.length - 5} more</div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 8, color: '#4A6A7E', marginTop: 4 }}>Source: OpenStreetMap via Overpass API</div>
    </div>
  );
}
