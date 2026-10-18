import type { Garment } from '../catalog'

// Flat garment illustrations so the store needs no image assets (the demo
// runs offline). `view` crops the same drawing for gallery detail shots.

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (shift: number) => {
    const v = (n >> shift) & 255
    const t = amount < 0 ? 0 : 255
    return Math.round(v + (t - v) * Math.abs(amount))
  }
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

interface Props {
  garment: Garment
  color: string
  view?: 'front' | 'detail' | 'hem'
  label?: string
}

const VIEWS = {
  front: '0 0 400 500',
  detail: '110 70 180 225',
  hem: '90 260 220 275',
}

export default function ProductArt({ garment, color, view = 'front', label }: Props) {
  const dark = shade(color, -0.28)
  const darker = shade(color, -0.45)
  const light = shade(color, 0.18)
  const seam = shade(color, -0.2)

  return (
    <svg
      className="product-art"
      viewBox={VIEWS[view]}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <ellipse cx="200" cy="462" rx="120" ry="12" fill="rgba(0,0,0,0.06)" />
      {garment === 'shell' && (
        <g>
          <path d="M150 98 C146 30 254 30 250 98 C232 116 168 116 150 98 Z" fill={dark} />
          <path d="M166 92 C166 52 234 52 234 92 C222 104 178 104 166 92 Z" fill={darker} />
          <path
            d="M150 95 L128 106 L96 130 L72 200 L56 330 L58 368 L94 372 L101 340 L114 232 L118 218 L114 432 Q200 448 286 432 L282 218 L286 232 L299 340 L306 372 L342 368 L344 330 L328 200 L304 130 L272 106 L250 95 Z"
            fill={color}
          />
          <path d="M118 218 L114 432 Q200 448 286 432 L282 218" fill="none" stroke={seam} strokeWidth="2" />
          <path d="M58 352 L95 357 L94 372 L58 368 Z M342 352 L305 357 L306 372 L342 368 Z" fill={dark} />
          <line x1="200" y1="104" x2="200" y2="440" stroke={darker} strokeWidth="3" />
          <path d="M226 150 L242 222" stroke={darker} strokeWidth="3" strokeLinecap="round" />
          <path d="M140 300 L150 362 M260 300 L250 362" stroke={dark} strokeWidth="3" strokeLinecap="round" />
          <path d="M112 200 L118 218 M288 200 L282 218" stroke={seam} strokeWidth="2" />
          <circle cx="132" cy="428" r="4" fill={darker} />
          <circle cx="268" cy="428" r="4" fill={darker} />
          <path d="M130 110 Q200 125 270 110" fill="none" stroke={light} strokeWidth="2" opacity="0.5" />
        </g>
      )}
      {garment === 'down' && (
        <g>
          <path
            d="M160 92 L130 104 L98 130 L74 200 L60 330 L62 366 L96 370 L103 338 L116 232 L120 216 L116 430 Q200 444 284 430 L280 216 L284 232 L297 338 L304 370 L338 366 L340 330 L326 200 L302 130 L270 104 L240 92 Q200 108 160 92 Z"
            fill={color}
          />
          {[160, 210, 260, 310, 360, 405].map((y) => (
            <path key={y} d={`M118 ${y} Q200 ${y + 10} 282 ${y}`} fill="none" stroke={dark} strokeWidth="2.5" />
          ))}
          {[170, 230, 290].map((y) => (
            <path key={y} d={`M80 ${y + 20} L112 ${y + 26} M320 ${y + 20} L288 ${y + 26}`} stroke={dark} strokeWidth="2.5" />
          ))}
          <path d="M160 92 Q200 108 240 92 L236 80 Q200 94 164 80 Z" fill={dark} />
          <line x1="200" y1="100" x2="200" y2="438" stroke={darker} strokeWidth="3" />
        </g>
      )}
      {garment === 'fleece' && (
        <g>
          <path
            d="M160 92 L130 104 L98 130 L74 200 L58 330 L60 366 L96 370 L103 338 L116 232 L120 216 L116 430 Q200 444 284 430 L280 216 L284 232 L297 338 L304 370 L340 366 L342 330 L326 200 L302 130 L270 104 L240 92 Q200 108 160 92 Z"
            fill={color}
          />
          <path d="M162 70 L238 70 L244 98 Q200 114 156 98 Z" fill={dark} />
          <line x1="200" y1="74" x2="200" y2="180" stroke={darker} strokeWidth="3" />
          <rect x="150" y="300" width="100" height="70" rx="10" fill={seam} opacity="0.55" />
          <rect x="222" y="150" width="34" height="38" rx="4" fill={dark} />
          <path d="M116 420 Q200 436 284 420 L286 432 Q200 448 114 432 Z" fill={dark} />
          <path d="M60 352 L96 356 L96 370 L60 366 Z M340 352 L304 356 L304 370 L340 366 Z" fill={dark} />
        </g>
      )}
      {garment === 'vest' && (
        <g>
          <path
            d="M160 92 L132 104 L124 150 Q150 190 130 230 L118 432 Q200 448 282 432 L270 230 Q250 190 276 150 L268 104 L240 92 Q200 108 160 92 Z"
            fill={color}
          />
          {[170, 225, 280, 335, 390].map((y) => (
            <path key={y} d={`M126 ${y} Q200 ${y + 10} 274 ${y}`} fill="none" stroke={dark} strokeWidth="2.5" />
          ))}
          <path d="M160 92 Q200 108 240 92 L236 76 Q200 92 164 76 Z" fill={dark} />
          <line x1="200" y1="100" x2="200" y2="440" stroke={darker} strokeWidth="3" />
        </g>
      )}
      {garment === 'tee' && (
        <g>
          <path
            d="M166 92 L132 104 L82 136 L64 196 L110 214 L122 186 L120 430 Q200 442 280 430 L278 186 L290 214 L336 196 L318 136 L268 104 L234 92 Q200 118 166 92 Z"
            fill={color}
          />
          <path d="M166 92 Q200 118 234 92 L228 86 Q200 108 172 86 Z" fill={dark} />
          <path d="M64 196 L110 214 L114 202 L68 184 Z M336 196 L290 214 L286 202 L332 184 Z" fill={seam} />
        </g>
      )}
      {garment === 'pant' && (
        <g>
          <path d="M128 70 L272 70 L274 98 L126 98 Z" fill={dark} />
          <path d="M126 98 L274 98 L290 448 L216 448 L200 196 L184 448 L110 448 Z" fill={color} />
          <path d="M200 98 L200 196" stroke={seam} strokeWidth="2" />
          <path d="M140 110 Q160 150 196 150 M260 110 Q240 150 204 150" fill="none" stroke={seam} strokeWidth="2" />
          <rect x="226" y="230" width="44" height="58" rx="6" fill={seam} opacity="0.6" />
          <path d="M110 430 L184 430 M216 430 L290 430" stroke={dark} strokeWidth="6" />
        </g>
      )}
      {garment === 'beanie' && (
        <g>
          <circle cx="200" cy="120" r="34" fill={light} />
          <path d="M100 330 C100 170 300 170 300 330 Z" fill={color} />
          {[130, 160, 190, 220, 250, 280].map((x) => (
            <line key={x} x1={x} y1="210" x2={x} y2="330" stroke={dark} strokeWidth="2" opacity="0.5" />
          ))}
          <rect x="92" y="320" width="216" height="80" rx="14" fill={dark} />
          {[110, 135, 160, 185, 210, 235, 260, 285].map((x) => (
            <line key={x} x1={x} y1="328" x2={x} y2="392" stroke={darker} strokeWidth="3" opacity="0.5" />
          ))}
        </g>
      )}
      {garment === 'pack' && (
        <g>
          <path d="M170 80 Q200 50 230 80" fill="none" stroke={darker} strokeWidth="10" strokeLinecap="round" />
          <rect x="112" y="84" width="176" height="350" rx="48" fill={color} />
          <path d="M112 170 Q200 130 288 170" fill="none" stroke={darker} strokeWidth="3" />
          <rect x="140" y="250" width="120" height="150" rx="24" fill={dark} />
          <path d="M150 250 Q200 270 250 250" fill="none" stroke={light} strokeWidth="2" opacity="0.5" />
          <rect x="190" y="160" width="20" height="10" rx="3" fill={darker} />
        </g>
      )}
    </svg>
  )
}
