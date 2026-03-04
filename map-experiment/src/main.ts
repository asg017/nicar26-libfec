import './style.css'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { csvParse } from 'd3-dsv'

type ZipRow = {
  zip5: string
  candidate_name: string
  num_contributors: number
  num_contributions: number
  total_amount: number
}

type Metric = 'total_amount' | 'num_contributions' | 'per_contributor'

// candidate_name → zip5 → ZipRow
type CandidateData = Map<string, Map<string, ZipRow>>

function parseCSV(text: string): ZipRow[] {
  return csvParse(text).map((d) => ({
    zip5: d.zip5!,
    candidate_name: d.candidate_name!,
    num_contributors: +d.num_contributors!,
    num_contributions: +d.num_contributions!,
    total_amount: +d.total_amount!,
  }))
}

function buildCandidateData(rows: ZipRow[]): CandidateData {
  const data: CandidateData = new Map()
  for (const row of rows) {
    let zipMap = data.get(row.candidate_name)
    if (!zipMap) {
      zipMap = new Map()
      data.set(row.candidate_name, zipMap)
    }
    zipMap.set(row.zip5, row)
  }
  return data
}

function getValue(row: ZipRow | undefined, metric: Metric): number {
  if (!row) return 0
  if (metric === 'per_contributor') {
    return row.num_contributors > 0 ? row.total_amount / row.num_contributors : 0
  }
  if (metric === 'num_contributions') return row.num_contributions
  return row.total_amount
}

const METRIC_LABELS: Record<Metric, string> = {
  total_amount: '$ Raised',
  num_contributions: '# Contributions',
  per_contributor: '$/Contributor',
}

// Single-candidate color scale (yellow → red quantile choropleth)
function buildSingleColorExpr(
  lookup: Map<string, ZipRow>,
  metric: Metric,
): maplibregl.ExpressionSpecification {
  const values = [...lookup.values()].map((r) => getValue(r, metric)).filter((v) => v > 0)
  values.sort((a, b) => a - b)
  const p = (pct: number) => values[Math.floor(values.length * pct)] ?? 0
  const stops = [p(0.5), p(0.7), p(0.85), p(0.95)]

  const cases: (string | number)[] = []
  for (const [zip, row] of lookup) {
    const v = getValue(row, metric)
    if (v > 0) cases.push(zip, v)
  }

  if (cases.length === 0) {
    return 'rgba(255,255,255,0)' as unknown as maplibregl.ExpressionSpecification
  }

  return [
    'interpolate',
    ['linear'],
    ['match', ['get', 'ZCTA'], ...cases, 0],
    0, 'rgba(255,255,255,0)',
    stops[0], '#ffffb2',
    stops[1], '#fecc5c',
    stops[2], '#fd8d3c',
    stops[3], '#e31a1c',
  ] as unknown as maplibregl.ExpressionSpecification
}

// Comparison mode: diverging blue ← neutral → red
// Value is (c1 - c2) / max(c1, c2), in [-1, 1]
function buildComparisonColorExpr(
  lookup1: Map<string, ZipRow>,
  lookup2: Map<string, ZipRow>,
  metric: Metric,
): maplibregl.ExpressionSpecification {
  const allZips = new Set([...lookup1.keys(), ...lookup2.keys()])
  const cases: (string | number)[] = []

  for (const zip of allZips) {
    const v1 = getValue(lookup1.get(zip), metric)
    const v2 = getValue(lookup2.get(zip), metric)
    const max = Math.max(v1, v2)
    if (max > 0) {
      const ratio = (v1 - v2) / max // [-1, 1]
      cases.push(zip, ratio)
    }
  }

  if (cases.length === 0) {
    return 'rgba(255,255,255,0)' as unknown as maplibregl.ExpressionSpecification
  }

  return [
    'interpolate',
    ['linear'],
    ['match', ['get', 'ZCTA'], ...cases, -999],
    -999, 'rgba(255,255,255,0)',
    -1, '#2166ac',
    -0.5, '#67a9cf',
    0, '#f7f7f7',
    0.5, '#ef8a62',
    1, '#b2182b',
  ] as unknown as maplibregl.ExpressionSpecification
}

function computeStops(lookup: Map<string, ZipRow>, metric: Metric): number[] {
  const values = [...lookup.values()].map((r) => getValue(r, metric)).filter((v) => v > 0)
  values.sort((a, b) => a - b)
  const p = (pct: number) => values[Math.floor(values.length * pct)] ?? 0
  return [p(0.5), p(0.7), p(0.85), p(0.95)]
}

function getColor(value: number, stops: number[]): string {
  const colors = ['#ffffb2', '#fecc5c', '#fd8d3c', '#e31a1c']
  if (value <= 0) return 'rgba(255,255,255,0)'
  if (value <= stops[0]) return colors[0]
  if (value <= stops[1]) return colors[1]
  if (value <= stops[2]) return colors[2]
  return colors[3]
}

function getDivergingColor(ratio: number): string {
  if (ratio <= -0.5) return '#2166ac'
  if (ratio <= 0) return '#67a9cf'
  if (ratio <= 0.5) return '#ef8a62'
  return '#b2182b'
}

function fmtMetric(value: number, metric: Metric): string {
  if (metric === 'num_contributions') return value.toLocaleString('en-US')
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function updateSingleLegend(lookup: Map<string, ZipRow>, metric: Metric, candidateName: string) {
  const stops = computeStops(lookup, metric)
  const colors = ['rgba(255,255,255,0)', '#ffffb2', '#fecc5c', '#fd8d3c', '#e31a1c']
  const labels = [
    'No data',
    `≤ ${fmtMetric(stops[0], metric)}`,
    `≤ ${fmtMetric(stops[1], metric)}`,
    `≤ ${fmtMetric(stops[2], metric)}`,
    `> ${fmtMetric(stops[2], metric)}`,
  ]

  const el = document.getElementById('legend')!
  el.innerHTML =
    `<div class="legend-title">${shortName(candidateName)} — ${METRIC_LABELS[metric]}</div>` +
    colors
      .map(
        (c, i) =>
          `<div class="legend-row"><div class="legend-swatch" style="background:${c};${i === 0 ? 'border:1px solid #ccc' : ''}"></div>${labels[i]}</div>`,
      )
      .join('')
}

function updateComparisonLegend(name1: string, name2: string) {
  const colors = ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b']
  const labels = [
    `Strong ${shortName(name2)}`,
    `Lean ${shortName(name2)}`,
    'Even',
    `Lean ${shortName(name1)}`,
    `Strong ${shortName(name1)}`,
  ]

  const el = document.getElementById('legend')!
  el.innerHTML =
    `<div class="legend-title">← ${shortName(name2)} | ${shortName(name1)} →</div>` +
    colors
      .map(
        (c, i) =>
          `<div class="legend-row"><div class="legend-swatch" style="background:${c};${c === '#f7f7f7' ? 'border:1px solid #ccc' : ''}"></div>${labels[i]}</div>`,
      )
      .join('')
}

function shortName(name: string): string {
  // "CRUZ, TED" → "Cruz"
  const parts = name.split(',')
  return parts[0].charAt(0) + parts[0].slice(1).toLowerCase()
}

async function main() {
  const [csvText, candidates] = await Promise.all([
    fetch('/candidate_zip_data.csv').then((r) => r.text()),
    fetch('/candidates.json').then((r) => r.json()) as Promise<string[]>,
  ])

  const rows = parseCSV(csvText)
  const candidateData = buildCandidateData(rows)

  // Populate dropdowns
  const c1Select = document.getElementById('candidate1-select') as HTMLSelectElement
  const c2Select = document.getElementById('candidate2-select') as HTMLSelectElement
  const metricSelect = document.getElementById('metric-select') as HTMLSelectElement

  for (const name of candidates) {
    c1Select.add(new Option(shortName(name), name))
    c2Select.add(new Option(shortName(name), name))
  }

  let currentCandidate1 = candidates[0]
  let currentCandidate2 = '' // empty = single mode
  let currentMetric: Metric = 'total_amount'

  function getState() {
    return {
      c1: currentCandidate1,
      c2: currentCandidate2,
      metric: currentMetric,
      isComparison: currentCandidate2 !== '',
      lookup1: candidateData.get(currentCandidate1) ?? new Map<string, ZipRow>(),
      lookup2: candidateData.get(currentCandidate2) ?? new Map<string, ZipRow>(),
    }
  }

  function updateMap(map: maplibregl.Map) {
    const state = getState()
    if (state.isComparison) {
      map.setPaintProperty(
        'zipcode-fill',
        'fill-color',
        buildComparisonColorExpr(state.lookup1, state.lookup2, state.metric),
      )
      updateComparisonLegend(state.c1, state.c2)
    } else {
      map.setPaintProperty(
        'zipcode-fill',
        'fill-color',
        buildSingleColorExpr(state.lookup1, state.metric),
      )
      updateSingleLegend(state.lookup1, state.metric, state.c1)
    }
  }

  // Initial legend
  updateSingleLegend(
    candidateData.get(currentCandidate1) ?? new Map(),
    currentMetric,
    currentCandidate1,
  )

  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm-tiles' }],
    },
    center: [-99.5, 31.5],
    zoom: 5.5,
  })

  map.on('load', () => {
    map.addSource('zipcodes', {
      type: 'geojson',
      data: '/zip-code-tabulation-area.json',
    })

    const state = getState()
    map.addLayer({
      id: 'zipcode-fill',
      type: 'fill',
      source: 'zipcodes',
      paint: {
        'fill-color': buildSingleColorExpr(state.lookup1, state.metric),
        'fill-opacity': 0.7,
      },
    })

    map.addLayer({
      id: 'zipcode-outline',
      type: 'line',
      source: 'zipcodes',
      paint: {
        'line-color': '#333',
        'line-width': 0.3,
      },
    })

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

    map.on('mousemove', 'zipcode-fill', (e) => {
      if (!e.features?.length) return
      const props = e.features[0].properties ?? {}
      const zip = props.ZCTA ?? ''
      const name = props.NAME ?? zip
      const state = getState()

      let html = `<strong>${name}</strong>`

      if (state.isComparison) {
        const row1 = state.lookup1.get(zip)
        const row2 = state.lookup2.get(zip)
        const v1 = getValue(row1, state.metric)
        const v2 = getValue(row2, state.metric)
        const max = Math.max(v1, v2)
        const ratio = max > 0 ? (v1 - v2) / max : 0
        const color = getDivergingColor(ratio)
        const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>`

        html += `<br>${dot}<b>${shortName(state.c1)}</b>: ${fmtMetric(v1, state.metric)}`
        html += `<br><b>${shortName(state.c2)}</b>: ${fmtMetric(v2, state.metric)}`
      } else {
        const row = state.lookup1.get(zip)
        if (row) {
          const stops = computeStops(state.lookup1, state.metric)
          const metricVal = getValue(row, state.metric)
          const color = getColor(metricVal, stops)
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>`
          const dollars = (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
          const perDonor = row.total_amount / (row.num_contributors || 1)

          const line = (label: string, value: string, active: boolean) =>
            active
              ? `<br><b>${dot}${label}: ${value}</b>`
              : `<br>${label}: ${value}`

          html += line('Donors', row.num_contributors.toLocaleString(), false)
          html += line('Contributions', row.num_contributions.toLocaleString(), state.metric === 'num_contributions')
          html += line('$ Raised', dollars(row.total_amount), state.metric === 'total_amount')
          html += line('$/Contributor', dollars(perDonor), state.metric === 'per_contributor')
        } else {
          html += `<br>No data`
        }
      }

      popup.setLngLat(e.lngLat).setHTML(html).addTo(map)
      map.getCanvas().style.cursor = 'pointer'
    })

    map.on('mouseleave', 'zipcode-fill', () => {
      popup.remove()
      map.getCanvas().style.cursor = ''
    })

    // Wire up controls
    c1Select.addEventListener('change', () => {
      currentCandidate1 = c1Select.value
      updateMap(map)
    })

    c2Select.addEventListener('change', () => {
      currentCandidate2 = c2Select.value
      updateMap(map)
    })

    metricSelect.addEventListener('change', () => {
      currentMetric = metricSelect.value as Metric
      updateMap(map)
    })
  })
}

main()
