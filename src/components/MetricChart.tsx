import { useState } from 'react';
import { motion } from 'motion/react';
import { Measurement } from '../types';

interface MetricChartProps {
  measurements: Measurement[];
}

export default function MetricChart({ measurements }: MetricChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  if (measurements.length === 0) {
    return (
      <div className="h-44 flex flex-col items-center justify-center border border-dashed border-natural-cream rounded-[32px] bg-white p-4 text-center">
        <span className="text-sm font-serif font-bold text-natural-dark">No growth data logged yet</span>
        <span className="text-xs text-natural-muted mt-1 leading-relaxed">Add trunk width measurements to generate the growth curve.</span>
      </div>
    );
  }

  // Sort chronologically
  const sorted = [...measurements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Dimensions
  const width = 500;
  const height = 200;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Min-max calculating
  const widths = sorted.map(m => m.width);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);
  const widthRange = maxWidth - minWidth || 10; // Avoid divide by zero
  
  // Pad the bounds slightly for nice visual curves
  const yMin = Math.max(0, minWidth - widthRange * 0.15);
  const yMax = maxWidth + widthRange * 0.15;
  const yRange = yMax - yMin;

  const times = sorted.map(m => new Date(m.date).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeRange = maxTime - minTime || 86400000; // default 1 day

  // Generator of coords
  const points = sorted.map((m, i) => {
    const t = new Date(m.date).getTime();
    const x = sorted.length > 1
      ? paddingLeft + ((t - minTime) / timeRange) * chartWidth
      : paddingLeft + chartWidth / 2; // single point in center
    
    const y = paddingTop + chartHeight - ((m.width - yMin) / yRange) * chartHeight;
    return { x, y, value: m.width, date: m.date, notes: m.notes };
  });

  // Create path data for line
  let linePath = '';
  let areaPath = '';
  
  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
  }

  // X axis labels
  const labelIndices = points.length <= 4 
    ? points.map((_, i) => i) 
    : [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div className="relative w-full bg-white border border-natural-cream rounded-[32px] p-6 shadow-xs">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-sm font-serif font-bold text-natural-dark">Trunk Growth Curve</h4>
          <p className="text-xs text-natural-muted">Trunk thickness over time (mm)</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-natural-muted font-bold font-serif">
            <span className="w-2.5 h-2.5 rounded-full bg-natural-forest"></span>
            Current: <strong className="text-natural-forest font-serif font-bold">{sorted[sorted.length - 1].width} mm</strong>
          </span>
        </div>
      </div>

      <div className="relative aspect-[5/2] w-full">
        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id="growthAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#606C38" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#606C38" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingLeft}
            y1={paddingTop}
            x2={width - paddingRight}
            y2={paddingTop}
            className="stroke-natural-cream/50 stroke-1"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingLeft}
            y1={paddingTop + chartHeight / 2}
            x2={width - paddingRight}
            y2={paddingTop + chartHeight / 2}
            className="stroke-natural-cream/50 stroke-1"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingLeft}
            y1={paddingTop + chartHeight}
            x2={width - paddingRight}
            y2={paddingTop + chartHeight}
            className="stroke-natural-cream stroke-1"
          />

          {/* Y Axis Labels */}
          <text x={paddingLeft - 10} y={paddingTop + 4} textAnchor="end" className="fill-natural-muted font-mono text-[9px] font-bold">
            {Math.round(yMax)}
          </text>
          <text x={paddingLeft - 10} y={paddingTop + chartHeight / 2 + 4} textAnchor="end" className="fill-natural-muted font-mono text-[9px] font-bold">
            {Math.round(yMin + yRange / 2)}
          </text>
          <text x={paddingLeft - 10} y={paddingTop + chartHeight + 4} textAnchor="end" className="fill-natural-muted font-mono text-[9px] font-bold">
            {Math.round(yMin)}
          </text>

          {/* Area gradient under curve */}
          {points.length > 0 && (
            <motion.path
              d={areaPath}
              className="fill-url(#growthAreaGradient)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            />
          )}

          {/* Line curve */}
          {points.length > 0 && (
            <motion.path
              d={linePath}
              fill="none"
              className="stroke-natural-forest"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
            />
          )}

          {/* Plot points */}
          {points.map((pt, idx) => (
            <g key={idx}>
              {/* Invisible interactive hover zone */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={12}
                className="fill-transparent cursor-pointer"
                onMouseEnter={() => setHoveredPoint(idx)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              {/* Visual dot */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={hoveredPoint === idx ? 6 : 4}
                className={`transition-all duration-200 border-2 stroke-white cursor-pointer ${
                  hoveredPoint === idx
                    ? 'fill-natural-forest ring-4 ring-natural-sage/20'
                    : 'fill-natural-sage'
                }`}
              />
            </g>
          ))}

          {/* X Axis labels */}
          {labelIndices.map((idx) => {
            const pt = points[idx];
            if (!pt) return null;
            const dt = new Date(pt.date);
            const labelStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return (
              <text
                key={idx}
                x={pt.x}
                y={paddingTop + chartHeight + 18}
                textAnchor="middle"
                className="fill-natural-muted font-mono text-[9px] font-semibold"
              >
                {labelStr}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Interactive values HUD on tooltip */}
      <div className="mt-4 min-h-[40px] bg-natural-bg/50 rounded-xl px-4 py-2 flex items-center justify-between transition-colors border border-natural-cream">
        {hoveredPoint !== null ? (
          <>
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-natural-muted uppercase tracking-wider font-bold">Log Date</span>
              <span className="text-xs font-serif font-bold text-natural-dark">
                {new Date(points[hoveredPoint].date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
            <div className="flex gap-4 items-center">
              {points[hoveredPoint].notes && (
                <span className="text-xs text-natural-muted italic max-w-[180px] truncate">
                  "{points[hoveredPoint].notes}"
                </span>
              )}
              <div className="text-right">
                <span className="text-[9px] font-mono text-natural-muted uppercase tracking-wider block font-bold">Trunk Width</span>
                <span className="text-sm font-serif font-bold text-natural-forest">
                  {points[hoveredPoint].value} mm
                </span>
              </div>
            </div>
          </>
        ) : (
          <span className="text-xs text-natural-muted font-medium flex items-center gap-1.5 select-none leading-relaxed">
            <span className="inline-block w-2 h-2 rounded-full bg-natural-sage/55 animate-pulse"></span>
            Hover over plotting circles to lock precise dates & logged thickness notes.
          </span>
        )}
      </div>
    </div>
  );
}
