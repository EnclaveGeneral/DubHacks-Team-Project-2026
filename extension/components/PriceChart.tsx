import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react"

import { isoDate } from "~lib/claim"
import type { TimelineWindow, TrackedPurchase } from "~lib/types"

// Price since purchase (step line) against what the shopper paid, over the
// windows when they can act on a lower price:
//   green band  = price adjustment window
//   violet band = return & rebuy (price adjustment over, returns still open)
// The legend above the plot names the bands, so no text sits inside the
// plot except "Paid" and the current price, which are placed to avoid
// overlapping each other and the edges.

const H = 150
const PAD = { top: 8, right: 44, bottom: 20, left: 6 }
const CHAR_W = 6.4 // approx width of an 11px character, for label collision checks

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  })

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

function niceTicks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks = []
  for (let v = Math.floor(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v)
  return ticks
}

interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

interface Band {
  key: "adjust" | "rebuy"
  from: number
  to: number
  label: string
  state: string
}

function bandsFor(tp: TrackedPurchase, baseDate: string): Band[] {
  const d0 = tp.purchase.purchase_day
  const pm = tp.timeline.find((w) => w.label === "Price match")
  const ret = tp.timeline.find((w) => w.label === "Return")
  const until = (w: TimelineWindow) => `through ${shortDate(isoDate(baseDate, w.closes_day))}`
  const bands: Band[] = []
  if (pm) {
    bands.push({
      key: "adjust",
      from: pm.opens_day,
      to: pm.closes_day,
      label: "Price adjustment",
      state: pm.status === "claimed" ? "claimed" : until(pm)
    })
  }
  if (ret) {
    const from = pm ? Math.max(pm.closes_day, d0) : d0
    if (ret.closes_day > from) {
      bands.push({
        key: "rebuy",
        from,
        to: ret.closes_day,
        label: "Return & rebuy",
        state: ret.status === "claimed" ? "return requested" : ret.open_ended ? "no time limit" : until(ret)
      })
    }
  }
  return bands
}

interface Props {
  tp: TrackedPurchase
  today: number
  baseDate: string
}

export default function PriceChart({ tp, today: clockDay, baseDate }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const p = tp.purchase
  const d0 = p.purchase_day
  const clipId = `plot-${p.order_id.replace(/[^\w-]/g, "")}`
  // The demo clock can be set before the purchase date; draw from the purchase.
  const today = Math.max(clockDay, d0)
  const bands = bandsFor(tp, baseDate)

  // Observed prices (store day -> price), starting from what was paid.
  const points = useMemo(() => {
    const obs = Object.entries(tp.price_history)
      .map(([d, v]) => [Number(d), v] as [number, number])
      .filter(([d]) => d >= d0 && d <= today)
      .sort((a, b) => a[0] - b[0])
    const pts: [number, number][] = [[d0, p.price_paid]]
    for (const [d, v] of obs) {
      if (d === d0) pts[0] = [d0, v]
      else if (v !== pts[pts.length - 1][1]) pts.push([d, v])
    }
    return pts
  }, [tp.price_history, d0, today, p.price_paid])

  const priceOn = (day: number) => {
    let v = points[0][1]
    for (const [d, price] of points) if (d <= day) v = price
    return v
  }
  const optionOn = (day: number) => {
    const b = bands.find((band) => day >= band.from && day <= band.to)
    return b ? `${b.label} window` : "No return or adjustment"
  }

  const xMax = Math.max(d0 + 30, ...bands.map((b) => b.to), today + 2)
  // Scale to every price shown (it can rise above what was paid, too).
  const lo = Math.min(...points.map((pt) => pt[1]), p.price_paid)
  const hi = Math.max(...points.map((pt) => pt[1]), p.price_paid)
  const ticks = niceTicks(lo * 0.82, hi * 1.04)
  const yMin = ticks[0]
  const yMax = Math.max(ticks[ticks.length - 1], hi * 1.1)

  const right = width - PAD.right
  const bottom = H - PAD.bottom
  const x = (d: number) => PAD.left + ((d - d0) / (xMax - d0)) * (right - PAD.left)
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (bottom - PAD.top)

  let line = `M${x(points[0][0])},${y(points[0][1])}`
  points.forEach(([d, v], i) => {
    if (i > 0) line += ` H${x(d)} V${y(v)}`
  })
  line += ` H${x(today)}`

  // "Paid" label sits just above the paid line at the left.
  const paidText = `Paid ${money(p.price_paid)}`
  const paidBox: Box = {
    x0: PAD.left + 2,
    x1: PAD.left + 2 + paidText.length * CHAR_W,
    y0: y(p.price_paid) - 15,
    y1: y(p.price_paid) - 2
  }

  // Current-price label: first spot that fits inside the plot and misses "Paid".
  const nowPrice = priceOn(today)
  const nowText = `${money(nowPrice)} now`
  const nowW = nowText.length * CHAR_W
  const dx = x(today)
  const dy = y(nowPrice)
  const spots = [
    { tx: dx - 8, ty: dy - 8, anchor: "end" as const },
    { tx: dx + 8, ty: dy - 8, anchor: "start" as const },
    { tx: dx - 8, ty: dy + 16, anchor: "end" as const },
    { tx: dx + 8, ty: dy + 16, anchor: "start" as const }
  ]
  const nowSpot = spots.find((s) => {
    const box: Box = {
      x0: s.anchor === "end" ? s.tx - nowW : s.tx,
      x1: s.anchor === "end" ? s.tx : s.tx + nowW,
      y0: s.ty - 11,
      y1: s.ty + 2
    }
    const inside = box.x0 >= PAD.left && box.x1 <= right && box.y0 >= PAD.top && box.y1 <= bottom
    return inside && !overlaps(box, paidBox)
  })

  const hoverDay = hover === null ? null : Math.min(today, Math.max(d0, hover))
  const tipLeft = hoverDay === null ? 0 : Math.min(width - 150, Math.max(0, x(hoverDay) - 75))

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHover(Math.round(d0 + ((e.clientX - rect.left) / rect.width) * (xMax - d0)))
  }

  const summary =
    `Price of ${p.item_name} since purchase: paid ${money(p.price_paid)}, now ${money(nowPrice)}. ` +
    bands.map((b) => `${b.label} ${b.state}.`).join(" ")

  return (
    <figure className="price-chart" ref={wrapRef}>
      {bands.length > 0 && (
        <figcaption className="chart-legend">
          {bands.map((b) => (
            <span key={b.key} className={`legend-item ${b.key}`}>
              <span className="legend-swatch" aria-hidden="true" />
              {b.label} <span className="muted">· {b.state}</span>
            </span>
          ))}
        </figcaption>
      )}
      <svg width={width} height={H} role="img" aria-label={summary}>
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top - 5} width={right - PAD.left + 5} height={bottom - PAD.top + 10} />
          </clipPath>
        </defs>
        {bands.map((b) => (
          <rect
            key={b.key}
            x={x(b.from)}
            y={PAD.top}
            width={Math.max(0, x(b.to) - x(b.from))}
            height={bottom - PAD.top}
            className={`band ${b.key}`}
          />
        ))}

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={right + 6} y={y(t) + 4} className="tick">
              {money(t)}
            </text>
          </g>
        ))}

        <line x1={PAD.left} x2={right} y1={y(p.price_paid)} y2={y(p.price_paid)} className="paid" />
        <text x={paidBox.x0} y={paidBox.y1 - 2} className="chart-label">
          {paidText}
        </text>

        <g clipPath={`url(#${clipId})`}>
          <path d={line} className="series" />
          <circle cx={dx} cy={dy} r={4.5} className="end-dot" />
        </g>
        {nowPrice !== p.price_paid && nowSpot && (
          <text x={nowSpot.tx} y={nowSpot.ty} textAnchor={nowSpot.anchor} className="chart-label strong">
            {nowText}
          </text>
        )}

        <text x={PAD.left} y={H - 4} className="tick">
          {shortDate(isoDate(baseDate, d0))}
        </text>
        <text x={right} y={H - 4} className="tick" textAnchor="end">
          {shortDate(isoDate(baseDate, xMax))}
        </text>

        {hoverDay !== null && (
          <line x1={x(hoverDay)} x2={x(hoverDay)} y1={PAD.top} y2={bottom} className="crosshair" />
        )}
        <rect
          x={PAD.left}
          y={0}
          width={right - PAD.left}
          height={H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hoverDay !== null && (
        <div className="chart-tip" style={{ left: tipLeft }}>
          <strong>{money(priceOn(hoverDay))}</strong>
          <span>{shortDate(isoDate(baseDate, hoverDay))}</span>
          <span>{optionOn(hoverDay)}</span>
        </div>
      )}
    </figure>
  )
}
