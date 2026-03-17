import type {
  ScenarioBattlefieldEntry,
  ScenarioGraphBlackSwanOutlier,
  ScenarioGraphCluster,
  ScenarioGraphConflictZone,
  ScenarioGraphEdge,
  ScenarioGraphOutput,
  ScenarioGraphNode,
  ScenarioWarResult,
} from '@/ai/scenario-graph';
import { escapeHtml } from '@/utils/sanitize';

interface PositionedNode extends ScenarioGraphNode {
  x: number;
  y: number;
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function uniqueIds(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function edgeTypeLabel(type: ScenarioGraphEdge['type']): string {
  switch (type) {
    case 'amplification':
      return 'تقویت';
    case 'suppression':
      return 'سرکوب';
    case 'dependency':
      return 'وابستگی';
    case 'contradiction':
      return 'تعارض';
    default:
      return 'همگرایی';
  }
}

function statusLabel(status: ScenarioBattlefieldEntry['status']): string {
  switch (status) {
    case 'dominant':
      return 'غالب';
    case 'fragile':
      return 'شکننده';
    case 'contested':
      return 'مورد مناقشه';
    case 'emergent':
      return 'در حال ظهور';
    default:
      return 'پایدار';
  }
}

function scenarioMetricLabel(entry: ScenarioBattlefieldEntry): string {
  return `وزن ${Math.round(entry.battlefieldWeight * 100)}% | احتمال ${Math.round(entry.updatedProbabilityScore * 100)}%`;
}

function clusterOrder(graph: ScenarioGraphOutput): ScenarioGraphCluster[] {
  const assigned = new Set(graph.dominantClusters.flatMap((cluster) => cluster.nodeIds));
  const orphanIds = graph.nodes.filter((node) => !assigned.has(node.id)).map((node) => node.id);
  const clusters = [...graph.dominantClusters];
  if (orphanIds.length > 0) {
    clusters.push({
      id: 'scenario-cluster:orphans',
      label: 'گره‌های منفرد',
      nodeIds: orphanIds,
      cohesion: 0.22,
      dominance: orphanIds
        .map((id) => graph.nodes.find((node) => node.id === id)?.dominance ?? 0)
        .reduce((sum, value) => sum + value, 0) / Math.max(1, orphanIds.length),
      instability: orphanIds
        .map((id) => graph.nodes.find((node) => node.id === id)?.contestedness ?? 0)
        .reduce((sum, value) => sum + value, 0) / Math.max(1, orphanIds.length),
    });
  }
  return clusters;
}

function layoutNodes(graph: ScenarioGraphOutput): PositionedNode[] {
  const width = 100;
  const height = 100;
  const clusters = clusterOrder(graph);
  const positions = new Map<string, PositionedNode>();
  const spacing = width / Math.max(1, clusters.length + 1);

  clusters.forEach((cluster, index) => {
    const clusterNodes = graph.nodes.filter((node) => cluster.nodeIds.includes(node.id));
    const centerX = spacing * (index + 1);
    const centerY = 22 + ((index % 2) * 24) + Math.min(14, cluster.instability * 16);
    const radius = Math.min(14, 6 + (clusterNodes.length * 2));
    clusterNodes.forEach((node, nodeIndex) => {
      const angle = ((Math.PI * 2) / Math.max(1, clusterNodes.length)) * nodeIndex - (Math.PI / 2);
      const x = clusterNodes.length === 1 ? centerX : centerX + (Math.cos(angle) * radius);
      const y = clusterNodes.length === 1 ? centerY : centerY + (Math.sin(angle) * radius);
      positions.set(node.id, { ...node, x: clamp(x / width, 0.08, 0.92), y: clamp(y / height, 0.14, 0.82) });
    });
  });

  return graph.nodes.map((node) => positions.get(node.id) ?? { ...node, x: 0.5, y: 0.5 });
}

function renderEdgeSvg(edge: ScenarioGraphEdge, nodes: Map<string, PositionedNode>): string {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from || !to) return '';
  const midX = ((from.x + to.x) / 2) * 100;
  const midY = ((from.y + to.y) / 2) * 100;
  const strokeWidth = 1.2 + (edge.weight * 3.6);
  return `
    <g class="scenario-conflict-edge scenario-conflict-edge--${escapeHtml(edge.type)}">
      <line x1="${from.x * 100}" y1="${from.y * 100}" x2="${to.x * 100}" y2="${to.y * 100}" stroke-width="${strokeWidth.toFixed(2)}" />
      <text x="${midX.toFixed(2)}" y="${(midY - 1.8).toFixed(2)}">${escapeHtml(edgeTypeLabel(edge.type))}</text>
    </g>
  `;
}

function renderNodeButton(node: PositionedNode, selectedNodeId: string | null, battlefield: ScenarioBattlefieldEntry | undefined): string {
  const selected = node.id === selectedNodeId;
  const size = 88 + Math.round(node.dominance * 28);
  const battlefieldText = battlefield ? scenarioMetricLabel(battlefield) : `احتمال ${Math.round(node.probabilityScore * 100)}%`;
  return `
    <button
      type="button"
      class="scenario-conflict-node scenario-conflict-node--${escapeHtml(node.status)} ${selected ? 'is-selected' : ''} ${node.blackSwanScore >= 0.56 ? 'is-black-swan' : ''}"
      style="--node-x:${(node.x * 100).toFixed(2)}%; --node-y:${(node.y * 100).toFixed(2)}%; --node-size:${size}px"
      data-action="select-graph-node"
      data-node-id="${escapeHtml(node.id)}"
      aria-pressed="${selected ? 'true' : 'false'}"
    >
      <span class="scenario-conflict-node__title">${escapeHtml(node.title)}</span>
      <small>${escapeHtml(battlefieldText)}</small>
    </button>
  `;
}

function renderZone(zone: ScenarioGraphConflictZone): string {
  return `
    <article class="scenario-conflict-zone-card">
      <div class="scenario-live-card-head">
        <strong>${escapeHtml(zone.label)}</strong>
        <span class="scenario-live-badge ${zone.intensity >= 0.62 ? 'up' : zone.intensity >= 0.42 ? 'flat' : 'down'}">
          شدت ${Math.round(zone.intensity * 100)}%
        </span>
      </div>
      <p>${escapeHtml(zone.summary)}</p>
      <div class="scenario-live-metrics">
        <span>Black Swan فشار ${Math.round(zone.blackSwanPressure * 100)}%</span>
        <span>${escapeHtml(zone.dominantEdgeTypes.map(edgeTypeLabel).join(' / '))}</span>
      </div>
      <div class="scenario-live-block">
        <span>شاخص‌های قاطع</span>
        <ul>${zone.decisiveIndicators.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
    </article>
  `;
}

function renderBlackSwan(outlier: ScenarioGraphBlackSwanOutlier): string {
  return `
    <article class="scenario-black-swan-card">
      <div class="scenario-live-card-head">
        <strong>${escapeHtml(outlier.title)}</strong>
        <span class="scenario-live-badge up">Black Swan ${Math.round(outlier.score * 100)}%</span>
      </div>
      <p>${escapeHtml(outlier.why)}</p>
      <div class="scenario-live-block">
        <span>Watchpoints</span>
        <ul>${outlier.watchpoints.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
    </article>
  `;
}

function renderDetailPanel(
  node: ScenarioGraphNode | undefined,
  graph: ScenarioGraphOutput,
  war: ScenarioWarResult,
): string {
  if (!node) {
    return '<p class="scenario-live-empty">یک سناریو را از روی گراف یا رتبه‌بندی انتخاب کنید.</p>';
  }
  const edges = graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).slice(0, 5);
  const battlefield = war.battlefieldState.find((entry) => entry.scenarioId === node.id);
  const shifts = war.shifts.find((item) => item.scenarioId === node.id);
  return `
    <article class="scenario-conflict-detail-card">
      <div class="scenario-live-card-head">
        <strong>${escapeHtml(node.title)}</strong>
        <span class="scenario-live-badge ${node.status === 'dominant' ? 'up' : node.status === 'fragile' ? 'down' : 'flat'}">${escapeHtml(statusLabel(node.status))}</span>
      </div>
      <p>${escapeHtml(node.summary)}</p>
      <div class="scenario-live-metrics">
        <span>مرکزیت ${Math.round(node.centrality * 100)}%</span>
        <span>شکنندگی ${Math.round(node.fragility * 100)}%</span>
        <span>مناقشه ${Math.round(node.contestedness * 100)}%</span>
        <span>Black Swan ${Math.round(node.blackSwanScore * 100)}%</span>
      </div>
      ${battlefield ? `
        <div class="scenario-live-block">
          <span>وضعیت در scenario war</span>
          <div class="scenario-live-empty">${escapeHtml(`${scenarioMetricLabel(battlefield)} | ${battlefield.summary}`)}</div>
        </div>
      ` : ''}
      ${shifts ? `
        <div class="scenario-live-block">
          <span>آخرین جابه‌جایی</span>
          <div class="scenario-live-empty">${escapeHtml(`${Math.round(shifts.delta * 100)}% | ${shifts.reason}`)}</div>
        </div>
      ` : ''}
      <div class="scenario-live-block">
        <span>Edgeهای کلیدی</span>
        <ul>${edges.map((edge) => `<li>${escapeHtml(`${edgeTypeLabel(edge.type)}: ${edge.explanation}`)}</li>`).join('')}</ul>
      </div>
      <div class="scenario-live-block">
        <span>محرک‌ها و watchpoints</span>
        <ul>${uniqueIds([...node.drivers, ...node.indicators]).slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
      <button type="button" class="scenario-suggestion-apply" data-action="load-graph-scenario-into-simulation" data-node-id="${escapeHtml(node.id)}">بارگذاری در شبیه‌ساز</button>
    </article>
  `;
}

export function renderScenarioConflictGraph(params: {
  graph: ScenarioGraphOutput;
  war: ScenarioWarResult;
  selectedScenarioId: string | null;
}): string {
  const positionedNodes = layoutNodes(params.graph);
  const nodeMap = new Map(positionedNodes.map((node) => [node.id, node]));
  const selectedNode = params.graph.nodes.find((node) => node.id === params.selectedScenarioId)
    ?? params.graph.nodes.find((node) => node.id === params.war.battlefieldState[0]?.scenarioId)
    ?? params.graph.nodes[0];

  return `
    <section class="scenario-conflict-graph-panel">
      <header class="scenario-output-toolbar">
        <div>
          <strong>Scenario Fusion & Conflict Graph</strong>
          <p class="scenario-live-empty">${escapeHtml(params.graph.narrativeExplanation)}</p>
        </div>
        <div class="scenario-live-stats">
          <span>Nodeها: ${params.graph.nodes.length}</span>
          <span>Edgeها: ${params.graph.edges.length}</span>
          <span>Conflict Zone: ${params.graph.unstableRegions.length}</span>
        </div>
      </header>

      <section class="scenario-conflict-stage-shell">
        <div class="scenario-conflict-stage">
          <svg class="scenario-conflict-stage__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${params.graph.edges.map((edge) => renderEdgeSvg(edge, nodeMap)).join('')}
          </svg>
          <div class="scenario-conflict-node-layer">
            ${positionedNodes.map((node) => renderNodeButton(
              node,
              selectedNode?.id ?? null,
              params.war.battlefieldState.find((entry) => entry.scenarioId === node.id),
            )).join('')}
          </div>
        </div>
        <div class="scenario-conflict-detail">
          ${renderDetailPanel(selectedNode, params.graph, params.war)}
        </div>
      </section>

      <section class="scenario-conflict-grid">
        <article class="scenario-conflict-battlefield-card">
          <div class="scenario-live-card-head">
            <strong>Scenario Battlefield</strong>
            <span class="scenario-live-badge flat">${params.war.battlefieldState.length} سناریو</span>
          </div>
          <p>${escapeHtml(params.war.narrative)}</p>
          <div class="scenario-conflict-ranking">
            ${params.war.battlefieldState.map((entry) => `
              <button type="button" class="scenario-conflict-ranking-row ${entry.scenarioId === selectedNode?.id ? 'is-selected' : ''}" data-action="select-graph-node" data-node-id="${escapeHtml(entry.scenarioId)}">
                <span>#${entry.rank} ${escapeHtml(entry.title)}</span>
                <small>${escapeHtml(`${statusLabel(entry.status)} | ${scenarioMetricLabel(entry)}`)}</small>
              </button>
            `).join('')}
          </div>
        </article>

        <article class="scenario-conflict-battlefield-card">
          <div class="scenario-live-card-head">
            <strong>Conflict Zones</strong>
            <span class="scenario-live-badge down">${params.graph.unstableRegions.length}</span>
          </div>
          <div class="scenario-conflict-zone-grid">
            ${params.graph.unstableRegions.length > 0
              ? params.graph.unstableRegions.map((zone) => renderZone(zone)).join('')
              : '<p class="scenario-live-empty">ناحیه تعارض برجسته‌ای فراتر از تنش‌های عادی دیده نشد.</p>'}
          </div>
        </article>

        <article class="scenario-conflict-battlefield-card">
          <div class="scenario-live-card-head">
            <strong>Black Swan Outliers</strong>
            <span class="scenario-live-badge up">${params.graph.blackSwanOutliers.length}</span>
          </div>
          <div class="scenario-conflict-zone-grid">
            ${params.graph.blackSwanOutliers.length > 0
              ? params.graph.blackSwanOutliers.map((outlier) => renderBlackSwan(outlier)).join('')
              : '<p class="scenario-live-empty">در این لحظه outlier برجسته‌ای شناسایی نشده است.</p>'}
          </div>
        </article>
      </section>
    </section>
  `;
}
