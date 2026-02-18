import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import "./App.css";

// Helpers
const fmt = (x, digits = 2) =>
  Number.isFinite(x) ? x.toFixed(digits) : "—";
const tickFmt = (x) => (Number.isFinite(x) ? Number(x).toFixed(1) : "—");

function findZeroCrossings(points, yKey) {
  // returns x-values where y crosses 0 (linear interpolation between samples)
  const xs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const y1 = p1[yKey];
    const y2 = p2[yKey];
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;

    if (y1 === 0) xs.push(p1.Q);
    // strict crossing
    if ((y1 < 0 && y2 > 0) || (y1 > 0 && y2 < 0)) {
      const t = (0 - y1) / (y2 - y1);
      const x = p1.Q + t * (p2.Q - p1.Q);
      xs.push(x);
    }
  }
  // Dedup-ish
  return xs.filter((x, idx) => idx === 0 || Math.abs(x - xs[idx - 1]) > 1e-6);
}

export default function App() {
  // Defaults match your slide example (FC=5, a=5, b=1, c=0.1, p=5)
  const [FC, setFC] = useState(5);
  const [a, setA] = useState(5);
  const [b, setB] = useState(1);
  const [c, setC] = useState(0.1);
  const [p, setP] = useState(5);

  // Domain for Q (in '000 units)
  const Qmax = 10;
  const step = 0.1;

  const data = useMemo(() => {
    const pts = [];
    for (let Q = 0; Q <= Qmax + 1e-9; Q += step) {
      const TR = p * Q;
      const AR = Q === 0 ? p : TR / Q; // = p for Q>0 anyway
      const MR = p;

      const TC = FC + a * Q - b * Q * Q + c * Q * Q * Q;

      const AC = Q === 0 ? NaN : TC / Q;
      const MC = a - 2 * b * Q + 3 * c * Q * Q;

      const TP = TR - TC;
      const AP = Q === 0 ? NaN : TP / Q;
      const MP = MR - MC; // same as d(TP)/dQ when TR is linear

      pts.push({
        Q: Number(Q.toFixed(3)),
        TR,
        AR,
        MR,
        TC,
        AC,
        MC,
        TP,
        AP,
        MP,
      });
    }
    return pts;
  }, [FC, a, b, c, p]);

  const markers = useMemo(() => {
    // Max profit at sampled max
    let maxTP = -Infinity;
    let Qstar = 0;
    for (const row of data) {
      if (row.TP > maxTP) {
        maxTP = row.TP;
        Qstar = row.Q;
      }
    }

    // Break-even(s): root-find TP(Q) on a finer grid + bisection
    const tpAt = (Q) => {
      const TR = p * Q;
      const TC = FC + a * Q - b * Q * Q + c * Q * Q * Q;
      return TR - TC;
    };
    const roots = [];
    const scanStep = 0.01;
    let prevQ = 0;
    let prevTP = tpAt(prevQ);
    for (let Q = scanStep; Q <= Qmax + 1e-9; Q += scanStep) {
      const currQ = Number(Q.toFixed(4));
      const currTP = tpAt(currQ);
      if (!Number.isFinite(prevTP) || !Number.isFinite(currTP)) {
        prevQ = currQ;
        prevTP = currTP;
        continue;
      }
      if (prevTP === 0) {
        roots.push(prevQ);
      } else if (currTP === 0) {
        roots.push(currQ);
      } else if (prevTP * currTP < 0) {
        // bisection to refine the root
        let lo = prevQ;
        let hi = currQ;
        for (let k = 0; k < 30; k += 1) {
          const mid = (lo + hi) / 2;
          const midTP = tpAt(mid);
          if (prevTP * midTP <= 0) {
            hi = mid;
          } else {
            lo = mid;
            prevTP = midTP;
          }
        }
        roots.push((lo + hi) / 2);
      }
      prevQ = currQ;
      prevTP = currTP;
    }
    const uniqueRoots = roots
      .sort((x, y) => x - y)
      .filter((x, idx, arr) => idx === 0 || Math.abs(x - arr[idx - 1]) > 1e-3);

    // We want:
    // - break-even = first root after 0 where TP goes from negative to positive
    // - profit limit = later root after Q* where TP goes back to 0 (positive -> negative)
    // If TP never goes positive, these will be null.
    let breakEven = null;
    let profitLimit = null;

    if (uniqueRoots.length > 0) {
      breakEven = uniqueRoots[0];
      if (uniqueRoots.length > 1) {
        const candidate = uniqueRoots[1];
        if (candidate - breakEven >= 1) {
          profitLimit = candidate;
        }
      }
    }

    return {
      Qstar,
      maxTP,
      breakEven,
      profitLimit,
    };
  }, [data]);

  const totalsYDomain = useMemo(() => {
    // auto domain with padding
    const ys = data.flatMap((d) => [d.TR, d.TC, d.TP]).filter(Number.isFinite);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const pad = (max - min) * 0.1 || 1;
    return [min - pad, max + pad];
  }, [data]);

  const unitYDomain = useMemo(() => {
    const ys = data
      .flatMap((d) => [d.AR, d.MR, d.AC, d.MC, d.AP, d.MP])
      .filter(Number.isFinite);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const pad = (max - min) * 0.1 || 1;
    return [min - pad, max + pad];
  }, [data]);

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Walid Aissa | 261039319 | Firm Model — Interactive Tool</h1>
          <p className="sub">
            Interactive model with sliders for <b>FC, a, b, c, p</b> and automatic charts/markers.
          </p>
        </div>
        <div className="pill">
          Q is in <b>'000 units</b> • Money is in <b>'000 $</b>
        </div>
      </header>

      <section className="panel">
        <h2>Parameters</h2>

        <div className="grid">
          <Slider label="FC (fixed cost)" value={FC} setValue={setFC} min={0} max={20} step={0.1} />
          <Slider label="a" value={a} setValue={setA} min={0} max={20} step={0.1} />
          <Slider label="b" value={b} setValue={setB} min={0} max={5} step={0.01} />
          <Slider label="c" value={c} setValue={setC} min={0} max={1} step={0.01} />
          <Slider label="p (price)" value={p} setValue={setP} min={0} max={20} step={0.1} />
        </div>

        <div className="readout">
          <div className="kpi">
            <div className="kpiLabel">Break-even Q</div>
            <div className="kpiVal">{markers.breakEven == null ? "—" : fmt(markers.breakEven, 3)}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Max profit Q*</div>
            <div className="kpiVal">{fmt(markers.Qstar, 3)}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Max profit TP(Q*)</div>
            <div className="kpiVal">{fmt(markers.maxTP, 3)}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Profit limit Q</div>
            <div className="kpiVal">{markers.profitLimit == null ? "—" : fmt(markers.profitLimit, 3)}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Totals</h2>
        <p className="hint">
          TR = p·Q, TC = FC + aQ − bQ² + cQ³, TP = TR − TC. Vertical markers: break-even, max profit, profit limit.
        </p>

        <div className="chartBox">
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={data} margin={{ top: 28, right: 26, left: 6, bottom: 44 }}>
              <CartesianGrid
                strokeDasharray="6 6"
                stroke="rgba(20, 26, 38, 0.12)"
                vertical
                horizontal
              />
              <XAxis
                dataKey="Q"
                type="number"
                domain={[0, Qmax]}
                allowDataOverflow
                tickFormatter={tickFmt}
                interval={4}
                tickMargin={12}
                label={{
                  value: "Production rate Q ('000 units)",
                  position: "insideBottom",
                  offset: -50,
                }}
              />
              <YAxis
                domain={totalsYDomain}
                tickFormatter={tickFmt}
                tickMargin={8}
                label={{ value: "Totals ('000 $)", angle: -90, position: "insideLeft", offset: 4 }}
              />
              <Tooltip formatter={(v) => fmt(v, 3)} />
              <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 18 }} />

              <Line type="monotone" dataKey="TR" dot={false} strokeWidth={2.6} stroke="#1f3b77" />
              <Line type="monotone" dataKey="TC" dot={false} strokeWidth={2.6} stroke="#d55b38" />
              <Line type="monotone" dataKey="TP" dot={false} strokeWidth={3} stroke="#1a8f6b" />

              {markers.breakEven !== null && markers.breakEven !== undefined && (
                <ReferenceLine
                  x={Number(markers.breakEven)}
                  strokeDasharray="6 6"
                  stroke="#d55b38"
                  strokeWidth={2}
                  label={{ value: "Break-even", position: "insideTop", offset: 6 }}
                />
              )}
              <ReferenceLine
                x={markers.Qstar}
                strokeDasharray="6 6"
                stroke="#1a8f6b"
                strokeWidth={2}
                label={{ value: "Max Profit", position: "insideTop", offset: 6 }}
              />
              {markers.profitLimit !== null && markers.profitLimit !== undefined && (
                <ReferenceLine
                  x={Number(markers.profitLimit)}
                  strokeDasharray="6 6"
                  stroke="#d55b38"
                  strokeWidth={2}
                  label={{ value: "Profit limit", position: "insideTop", offset: 6 }}
                />
              )}

              <ReferenceDot x={markers.Qstar} y={markers.maxTP} r={5} fill="#1a8f6b" stroke="#0d3a2a" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <h2>Unit values</h2>
        <p className="hint">
          AR = MR = p (constant). AC = TC/Q, MC = dTC/dQ, AP = TP/Q, MP = dTP/dQ = MR − MC.
        </p>

        <div className="chartBox">
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={data} margin={{ top: 28, right: 26, left: 6, bottom: 44 }}>
              <CartesianGrid
                strokeDasharray="6 6"
                stroke="rgba(20, 26, 38, 0.12)"
                vertical
                horizontal
              />
              <XAxis
                dataKey="Q"
                type="number"
                domain={[0, Qmax]}
                allowDataOverflow
                tickFormatter={tickFmt}
                interval={4}
                tickMargin={12}
                label={{
                  value: "Production rate Q ('000 units)",
                  position: "insideBottom",
                  offset: -50,
                }}
              />
              <YAxis
                domain={unitYDomain}
                tickFormatter={tickFmt}
                tickMargin={8}
                label={{ value: "Unit values ($)", angle: -90, position: "insideLeft", offset: 4 }}
              />
              <Tooltip formatter={(v) => fmt(v, 3)} />
              <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 18 }} />

              <Line type="monotone" dataKey="AR" dot={false} strokeWidth={2.4} stroke="#1f3b77" />
              <Line type="monotone" dataKey="MR" dot={false} strokeWidth={2.4} stroke="#304c8c" strokeDasharray="6 4" />
              <Line type="monotone" dataKey="AC" dot={false} strokeWidth={2.4} stroke="#d55b38" />
              <Line type="monotone" dataKey="MC" dot={false} strokeWidth={2.4} stroke="#f3a23b" />
              <Line type="monotone" dataKey="AP" dot={false} strokeWidth={2.4} stroke="#1a8f6b" />
              <Line type="monotone" dataKey="MP" dot={false} strokeWidth={2.4} stroke="#0f6a4f" strokeDasharray="6 4" />

              {markers.breakEven !== null && markers.breakEven !== undefined && (
                <ReferenceLine
                  x={Number(markers.breakEven)}
                  strokeDasharray="6 6"
                  stroke="#d55b38"
                  strokeWidth={2}
                  label={{ value: "Break-even", position: "insideTop", offset: 6 }}
                />
              )}
              <ReferenceLine
                x={markers.Qstar}
                strokeDasharray="6 6"
                stroke="#1a8f6b"
                strokeWidth={2}
                label={{ value: "Max Profit", position: "insideTop", offset: 6 }}
              />
              {markers.profitLimit !== null && markers.profitLimit !== undefined && (
                <ReferenceLine
                  x={Number(markers.profitLimit)}
                  strokeDasharray="6 6"
                  stroke="#d55b38"
                  strokeWidth={2}
                  label={{ value: "Profit limit", position: "insideTop", offset: 6 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <footer className="footer">
        <div>
          If you want a coarser table (Q = 0, 0.5, 1, ...), change <code>step</code> to <code>0.5</code>.
        </div>
      </footer>
    </div>
  );
}

function Slider({ label, value, setValue, min, max, step }) {
  return (
    <div className="slider">
      <div className="sliderTop">
        <span className="sliderLabel">{label}</span>
        <span className="sliderVal">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      <div className="sliderMinMax">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
