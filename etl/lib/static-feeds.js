/**
 * Static Feed Defaults — The "Safe Mode" last resort.
 *
 * When both the live API call AND the BigQuery 24h cache fail,
 * these static feeds provide deterministic baseline data so the
 * inference engine never returns an empty response.
 *
 * Data is curated from public benchmarks and industry reports.
 * Updated quarterly by the data team.
 *
 * @module etl/lib/static-feeds
 */

const STATIC_OCEAN_RATES = [
  {
    origin: 'CNSHA',        // Shanghai
    destination: 'USLAX',   // Los Angeles
    container_type: '40HC',
    rate_usd: 2450,
    currency: 'USD',
    transit_days: 14,
    carrier: 'BENCHMARK',
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    data_authority: 'static-benchmark',
    confidence: 0.60,
  },
  {
    origin: 'CNSHA',
    destination: 'NLRTM',   // Rotterdam
    container_type: '40HC',
    rate_usd: 2850,
    currency: 'USD',
    transit_days: 28,
    carrier: 'BENCHMARK',
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    data_authority: 'static-benchmark',
    confidence: 0.60,
  },
  {
    origin: 'CNSHA',
    destination: 'DEHAM',   // Hamburg
    container_type: '40HC',
    rate_usd: 2900,
    currency: 'USD',
    transit_days: 30,
    carrier: 'BENCHMARK',
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    data_authority: 'static-benchmark',
    confidence: 0.60,
  },
  {
    origin: 'KRPUS',        // Busan
    destination: 'USLAX',
    container_type: '40HC',
    rate_usd: 2300,
    currency: 'USD',
    transit_days: 12,
    carrier: 'BENCHMARK',
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    data_authority: 'static-benchmark',
    confidence: 0.60,
  },
  {
    origin: 'SGSIN',        // Singapore
    destination: 'GBFXT',   // Felixstowe
    container_type: '40HC',
    rate_usd: 2100,
    currency: 'USD',
    transit_days: 22,
    carrier: 'BENCHMARK',
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    data_authority: 'static-benchmark',
    confidence: 0.60,
  },
];

const STATIC_VESSEL_POSITIONS = [
  {
    mmsi: '000000001',
    vessel_name: 'BENCHMARK STATIC',
    lat: 31.2304,
    lon: 121.4737,
    speed_knots: 0,
    heading: 0,
    status: 'AT_ANCHOR',
    port: 'CNSHA',
    data_authority: 'static-benchmark',
  },
];

const STATIC_PORT_CONGESTION = [
  {
    port_code: 'USLAX',
    port_name: 'Los Angeles',
    avg_wait_hours: 48,
    vessel_queue: 12,
    congestion_level: 'MODERATE',
    data_authority: 'static-benchmark',
    confidence: 0.55,
  },
  {
    port_code: 'CNSHA',
    port_name: 'Shanghai',
    avg_wait_hours: 36,
    vessel_queue: 8,
    congestion_level: 'LOW',
    data_authority: 'static-benchmark',
    confidence: 0.55,
  },
];

/**
 * Returns a static feed for the specified domain.
 * @param {'ocean_rates' | 'vessel_positions' | 'port_congestion'} domain
 * @returns {{data: Array, source: string}}
 */
function getStaticFeed(domain) {
  const feeds = {
    ocean_rates: STATIC_OCEAN_RATES,
    vessel_positions: STATIC_VESSEL_POSITIONS,
    port_congestion: STATIC_PORT_CONGESTION,
  };

  const data = feeds[domain] || [];
  console.log(JSON.stringify({
    severity: 'INFO',
    component: 'static-feeds',
    domain,
    rowCount: data.length,
    message: `Static feed loaded: ${data.length} rows for domain "${domain}".`,
  }));

  return { data, source: 'fallback-static' };
}

module.exports = {
  getStaticFeed,
  STATIC_OCEAN_RATES,
  STATIC_VESSEL_POSITIONS,
  STATIC_PORT_CONGESTION,
};
