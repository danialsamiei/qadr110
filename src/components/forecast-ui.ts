import { escapeHtml } from '@/utils/sanitize';
import type { ForecastDistribution, ForecastPoint } from '@/services/forecast';

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A';
}

function pathFrom(points: ForecastPoint[], width: number, height: number, key: 'p10' | 'p50' | 'p90'): string {
  if (!points.length) return '';
  const values = points.map(p => p[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  return points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * width;
    const y = height - ((p[key] - min) / span) * height;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function renderFanChart(distribution: ForecastDistribution): string {
  const width = 260;
  const height = 90;
  const p10 = pathFrom(distribution.points, width, height, 'p10');
  const p50 = pathFrom(distribution.points, width, height, 'p50');
  const p90 = pathFrom(distribution.points, width, height, 'p90');
  const latest = distribution.latest;

  return `
    <div class="forecast-card">
      <div class="forecast-fan-chart">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Forecast fan chart for ${escapeHtml(distribution.variable)}">
          <path d="${escapeHtml(p90)}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.4" />
          <path d="${escapeHtml(p50)}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" />
          <path d="${escapeHtml(p10)}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.4" />
        </svg>
      </div>
      <div class="forecast-metrics">
        <span>P10: ${escapeHtml(fmt(latest.p10))}</span>
        <span>P50: ${escapeHtml(fmt(latest.p50))}</span>
        <span>P90: ${escapeHtml(fmt(latest.p90))}</span>
        <span>CI95: [${escapeHtml(fmt(latest.confidenceInterval[0]))}, ${escapeHtml(fmt(latest.confidenceInterval[1]))}]</span>
      </div>
      <div class="forecast-drivers"><strong>Main drivers:</strong> ${escapeHtml(distribution.mainDrivers.join(' • '))}</div>
      <div class="forecast-confidence"><strong>Model confidence:</strong> ${Math.round(distribution.modelConfidence * 100)}%</div>
    </div>
  `;
}
