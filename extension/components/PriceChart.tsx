import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react"

import { isoDate } from "~lib/claim"
import type { TrackedPurchase } from "~lib/types"

// Price since purchase as a step line against what the shopper paid.
// The shaded band is the price-match window; the green wash is money the
// shopper can claim (a drop inside the window), gray is a drop outside it.
// Single series: no legend, the title names it (dataviz skill).

const H = 150
const PAD = { top: 24, right: 44, bottom: 20, left: 8 }

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

interface Props {
  tp: TrackedPurchase
  today: number
  baseDate: string
}

export default function PriceChart({ tp, today, baseDate }: Props) {
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
  const pm = tp.timeline.find((w) => w.label === "Price match")
  const ret = tp.timeline.find((w) => w.label === "Return")

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

  const xMax = Math.max(d0 + 30, ret?.closes_day ?? 0, today + 2)
  const lo = Math.min(...points.map((pt) => pt[1]), p.price_paid)
  const ticks = niceTicks(lo * 0.82, p.price_paid * 1.04)
  const yMin = ticks[0]
  const yMax = Math.max(ticks[ticks.length - 1], p.price_paid * 1.08)

  const iw = width - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const x = (d: number) => PAD.left + ((d - d0) / (xMax - d0)) * iw
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ih

  // Step path from purchase to today.
  let line = `M${x(points[0][0])},${y(points[0][1])}`
  points.forEach(([d, v], i) => {
    if (i > 0) line += ` H${x(d)} V${y(v)}`
  })
  line += ` H${x(today)}`

  // Gap between "paid" and the price line, split at the window's end.
  const windowEnd = pm ? pm.closes_day : d0
  const gap = (from: number, to: number) => {
    if (to <= from) return ""
    let d = `M${x(from)},${y(p.price_paid)}`
    let cur = priceOn(from)
    d += ` V${y(cur)}`
    for (const [day, v] of points) {
      if (day > from && day < to) {
        d += ` H${x(day)} V${y(v)}`
        cur = v
      }
    }
    d += ` H${x(to)} V${y(p.price_paid)} Z`
    return d
  }
  const claimable = gap(d0, Math.min(today, windowEnd))
  const missed = gap(Math.max(d0, windowEnd), today)
  const firstDropDay = points.find(([, v]) => v < p.price_paid)?.[0] ?? today

  // Direct label centered in a shaded gap, only if it fits.
  const gapLabel = (from: number, to: number, text: string, cls: string) => {
    const w = x(to) - x(from)
    if (to <= from || w < 58) return null
    const mid = priceOn(from)
    const yMid = (y(p.price_paid) + y(mid)) / 2 + 4
    if (y(mid) - y(p.price_paid) < 14) return null
    return (
      <text x={(x(from) + x(to)) / 2} y={yMid} textAnchor="middle" className={`gap-label ${cls}`}>
        {text}
      </text>
    )
  }

  const nowPrice = priceOn(today)
  const hoverDay = hover === null ? null : Math.min(today, Math.max(d0, hover))
  const tipLeft = hoverDay === null ? 0 : Math.min(width - 110, Math.max(0, x(hoverDay) - 55))

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const day = Math.round(d0 + ((e.clientX - rect.left) / rect.width) * (xMax - d0))
    setHover(day)
  }

  const summary =
    `Price of ${p.item_name} since purchase: paid ${money(p.price_paid)}, ` +
    `now ${money(nowPrice)}, lowest ${money(tp.lowest_seen)}.`

  return (
    <figure className="price-chart" ref={wrapRef}>
      <svg width={width} height={H} role="img" aria-label={summary}>
        {/* price-match window */}
        {pm && (
          <g>
            <rect
              x={x(pm.opens_day)}
              y={PAD.top}
              width={x(pm.closes_day) - x(pm.opens_day)}
              height={ih}
              className={`window ${pm.status === "closed" ? "closed" : ""}`}
            />
            <text x={x(pm.opens_day)} y={PAD.top - 8} className="chart-note">
              Price-match window
            </text>
          </g>
        )}

        {/* gridlines */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={width - PAD.right + 6} y={y(t) + 4} className="tick">
              {money(t)}
            </text>
          </g>
        ))}

        {/* return deadline */}
        {ret && (
          <g>
            <line x1={x(ret.closes_day)} x2={x(ret.closes_day)} y1={PAD.top - 4} y2={H - PAD.bottom} className="deadline" />
            <text x={x(ret.closes_day) - 4} y={PAD.top - 8} className="chart-note" textAnchor="end">
              Return ends
            </text>
          </g>
        )}

        {/* claimable / missed gap, labeled in place when there's room */}
        {claimable && <path d={claimable} className="gap claimable" />}
        {missed && <path d={missed} className="gap missed" />}
        {gapLabel(firstDropDay, Math.min(today, windowEnd), "Claimable", "claimable")}
        {gapLabel(Math.max(firstDropDay, windowEnd), today, "Too late", "missed")}

        {/* what you paid */}
        <line x1={PAD.left} x2={x(xMax)} y1={y(p.price_paid)} y2={y(p.price_paid)} className="paid" />
        <text x={PAD.left + 2} y={y(p.price_paid) - 5} className="chart-label">
          You paid {money(p.price_paid)}
        </text>

        {/* price line + today */}
        <path d={line} className="series" />
        <circle cx={x(today)} cy={y(nowPrice)} r={4.5} className="end-dot" />
        {nowPrice !== p.price_paid && (
          <text
            x={x(today) + (x(today) < PAD.left + 90 ? 8 : -8)}
            y={y(nowPrice) - 8}
            textAnchor={x(today) < PAD.left + 90 ? "start" : "end"}
            className="chart-label strong">
            {money(nowPrice)} now
          </text>
        )}

        {/* x axis: purchase date and the end of the plotted range */}
        <text x={PAD.left} y={H - 4} className="tick">
          {shortDate(isoDate(baseDate, d0))}
        </text>
        <text x={x(xMax)} y={H - 4} className="tick" textAnchor="end">
          {shortDate(isoDate(baseDate, xMax))}
        </text>

        {/* hover */}
        {hoverDay !== null && (
          <line x1={x(hoverDay)} x2={x(hoverDay)} y1={PAD.top} y2={H - PAD.bottom} className="crosshair" />
        )}
        <rect
          x={PAD.left}
          y={0}
          width={iw}
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
        </div>
      )}
    </figure>
  )
}
