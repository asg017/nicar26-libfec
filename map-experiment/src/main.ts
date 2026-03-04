import './style.css'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type ZipRow = {
  zip5: string
  num_contributors: number
  num_contributions: number
  total_amount: number
}

type Metric = 'total_amount' | 'per_contributor'

function parseCSV(text: string): ZipRow[] {
  const lines = text.trim().split('\n')
  return lines.slice(1).map((line) => {
    const [zip5, num_contributors, num_contributions, total_amount] = line.split(',')
    return {
      zip5,
      num_contributors: +num_contributors,
      num_contributions: +num_contributions,
      total_amount: +total_amount,
    }
  })
}

function getValue(row: ZipRow, metric: Metric): number {
  if (metric === 'per_contributor') {
    return row.num_contributors > 0 ? row.total_amount / row.num_contributors : 0
  }
  return row.total_amount
}

function buildColorExpr(
  lookup: Map<string, ZipRow>,
  metric: Metric,
): maplibregl.ExpressionSpecification {
  const values = [...lookup.values()].map((r) => getValue(r, metric)).filter((v) => v > 0)
  values.sort((a, b) => a - b)

  const p = (pct: number) => values[Math.floor(values.length * pct)] ?? 0
  const stops = [p(0.5), p(0.7), p(0.85), p(0.95)]

  const cases: (string | maplibregl.ExpressionSpecification | number)[] = []
  for (const [zip, row] of lookup) {
    const v = getValue(row, metric)
    if (v > 0) {
      cases.push(zip, v)
    }
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

// Cache percentile stops per metric for color lookups
let cachedStops: { metric: Metric; stops: number[] } | null = null

function computeStops(lookup: Map<string, ZipRow>, metric: Metric): number[] {
  if (cachedStops?.metric === metric) return cachedStops.stops
  const values = [...lookup.values()].map((r) => getValue(r, metric)).filter((v) => v > 0)
  values.sort((a, b) => a - b)
  const p = (pct: number) => values[Math.floor(values.length * pct)] ?? 0
  const stops = [p(0.5), p(0.7), p(0.85), p(0.95)]
  cachedStops = { metric, stops }
  return stops
}

function getColor(value: number, stops: number[]): string {
  const colors = ['#ffffb2', '#fecc5c', '#fd8d3c', '#e31a1c']
  if (value <= 0) return 'rgba(255,255,255,0)'
  if (value <= stops[0]) return colors[0]
  if (value <= stops[1]) return colors[1]
  if (value <= stops[2]) return colors[2]
  return colors[3]
}

const METRIC_LABELS: Record<Metric, string> = {
  total_amount: '$ Raised',
  per_contributor: '$/Donor',
}

function updateLegend(lookup: Map<string, ZipRow>, metric: Metric) {
  const stops = computeStops(lookup, metric)
  const colors = ['rgba(255,255,255,0)', '#ffffb2', '#fecc5c', '#fd8d3c', '#e31a1c']
  const fmt = (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const labels = [
    'No data',
    `≤ ${fmt(stops[0])}`,
    `≤ ${fmt(stops[1])}`,
    `≤ ${fmt(stops[2])}`,
    `> ${fmt(stops[2])}`,
  ]

  const el = document.getElementById('legend')!
  el.innerHTML =
    `<div class="legend-title">${METRIC_LABELS[metric]}</div>` +
    colors
      .map(
        (c, i) =>
          `<div class="legend-row"><div class="legend-swatch" style="background:${c};${i === 0 ? 'border:1px solid #ccc' : ''}"></div>${labels[i]}</div>`,
      )
      .join('')
}

async function main() {
  const csvText = await fetch('/zip_aggregated.csv').then((r) => r.text())
  const rows = parseCSV(csvText)
  const lookup = new Map<string, ZipRow>()
  for (const row of rows) lookup.set(row.zip5, row)

  let currentMetric: Metric = 'total_amount'
  updateLegend(lookup, currentMetric)

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
      layers: [
        { id: 'osm-tiles', type: 'raster', source: 'osm-tiles' },
      ],
    },
    center: [-99.5, 31.5],
    zoom: 5.5,
  })

  map.on('load', () => {
    map.addSource('zipcodes', {
      type: 'geojson',
      data: '/zip-code-tabulation-area.json',
    })

    map.addLayer({
      id: 'zipcode-fill',
      type: 'fill',
      source: 'zipcodes',
      paint: {
        'fill-color': buildColorExpr(lookup, currentMetric),
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
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties ?? {}
        const zip = props.ZCTA ?? ''
        const name = props.NAME ?? zip
        const row = lookup.get(zip)
        let html = `<strong>${name}</strong>`
        if (row) {
          const dollars = (v: number) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
          const perDonor = row.total_amount / (row.num_contributors || 1)
          const stops = computeStops(lookup, currentMetric)
          const metricVal = getValue(row, currentMetric)
          const color = getColor(metricVal, stops)
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>`

          const line = (label: string, value: string, active: boolean) =>
            active
              ? `<br><b>${dot}${label}: ${value}</b>`
              : `<br>${label}: ${value}`

          html += line('Donors', row.num_contributors.toLocaleString(), false)
          html += line('Contributions', row.num_contributions.toLocaleString(), false)
          html += line('$ Raised', dollars(row.total_amount), currentMetric === 'total_amount')
          html += line('$/Donor', dollars(perDonor), currentMetric === 'per_contributor')
        } else {
          html += `<br>No data`
        }
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map)
        map.getCanvas().style.cursor = 'pointer'
      }
    })

    map.on('mouseleave', 'zipcode-fill', () => {
      popup.remove()
      map.getCanvas().style.cursor = ''
    })
  })

  // Metric selector
  const select = document.getElementById('metric-select') as HTMLSelectElement
  select.addEventListener('change', () => {
    currentMetric = select.value as Metric
    map.setPaintProperty('zipcode-fill', 'fill-color', buildColorExpr(lookup, currentMetric))
    updateLegend(lookup, currentMetric)
  })
}

main()
