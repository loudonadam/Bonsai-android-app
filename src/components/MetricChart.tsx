import { useState } from 'react';
import { motion } from 'motion/react';
import { Measurement } from '../types';
import { formatLocalDate } from '../utils';

interface MetricChartProps {
  measurements: Measurement[];
}

export default function MetricChart({ measurements }: MetricChartProps) {
  const filteredMeasurements = measurements.filter(m => m.width !== 0);

  if (filteredMeasurements.length === 0) {
    return (
      <div className="h-44 flex flex-col items-center justify-center border border-dashed border-natural-cream rounded-[32px] bg-white p-4 text-center">
        <span className="text-sm font-serif font-bold text-natural-dark">No growth data logged yet</span>
        <span className="text-xs text-natural-muted mt-1 leading-relaxed">Add trunk width measurements to generate the growth curve.</span>
      </div>
    );
  }

  // Sort chronologically
  const sorted = [...filteredMeasurements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
  const maxWidth = Math.max(...widths);
  
  // Set the Y axis to start at 0 as requested
  const yMin = 0;
  const yMax = Math.max(1, maxWidth * 1.25);
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
  
  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
  }

  // X axis labels
  const labelIndices = points.length <= 4 
    ? points.map((_, i) => i) 
    : [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div className="relative w-full max-w-2xl mx-auto bg-white border border-natural-cream rounded-[32px] p-6 shadow-xs">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-sm font-serif font-bold text-natural-dark">Trunk Growth History</h4>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-natural-muted font-bold font-serif">
            <span className="w-2.5 h-2.5 rounded-full bg-natural-forest"></span>
            Current: <strong className="text-natural-forest font-serif font-bold">{(Math.round(sorted[sorted.length - 1].width * 10) / 10).toFixed(1)} cm</strong>
          </span>
        </div>
      </div>

      <div className="relative aspect-[5/2] w-full">
        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
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
          <text x={paddingLeft - 10} y={paddingTop + 3} textAnchor="end" className="fill-natural-muted font-mono" fontSize={7.5} fontWeight={600}>
            {yMax.toFixed(1)}
          </text>
          <text x={paddingLeft - 10} y={paddingTop + chartHeight / 2 + 3} textAnchor="end" className="fill-natural-muted font-mono" fontSize={7.5} fontWeight={600}>
            {(yMin + yRange / 2).toFixed(1)}
          </text>
          <text x={paddingLeft - 10} y={paddingTop + chartHeight + 3} textAnchor="end" className="fill-natural-muted font-mono" fontSize={7.5} fontWeight={600}>
            {yMin.toFixed(1)}
          </text>

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
              {/* Visual dot */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4}
                className="fill-natural-sage stroke-white stroke-2"
              />
            </g>
          ))}

          {/* X Axis labels */}
          {labelIndices.map((idx) => {
            const pt = points[idx];
            if (!pt) return null;
            const labelStr = formatLocalDate(pt.date, { month: 'short', day: 'numeric' });
            return (
              <text
                key={idx}
                x={pt.x}
                y={paddingTop + chartHeight + 14}
                textAnchor="middle"
                className="fill-natural-muted font-mono"
                fontSize={7.5}
                fontWeight={600}
              >
                {labelStr}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
