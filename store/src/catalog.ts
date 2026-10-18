export type Garment = 'shell' | 'fleece' | 'pant' | 'vest' | 'tee' | 'beanie' | 'down' | 'pack'

export interface Colorway {
  name: string
  hex: string
}

export interface Product {
  sku: string
  slug: string
  name: string
  category: 'Outerwear' | 'Layers' | 'Bottoms' | 'Accessories'
  gender: 'Men' | 'Women' | 'Unisex'
  listPrice: number // regular price; the live price comes from the store server
  garment: Garment
  colors: Colorway[]
  blurb: string
  details: string[]
  materials: string
  rating: number
  reviews: number
  badge?: string
}

export const PRODUCTS: Product[] = [
  {
    sku: 'RJ-140',
    slug: 'rj-140',
    name: 'Ridgeline Rain Jacket',
    category: 'Outerwear',
    gender: 'Men',
    listPrice: 140,
    garment: 'shell',
    colors: [
      { name: 'Spruce', hex: '#2f5d4a' },
      { name: 'Ember', hex: '#b5482b' },
      { name: 'Graphite', hex: '#3b3f45' },
    ],
    blurb:
      'A fully seamed 2.5-layer shell for wet trail days and wetter commutes. Packs into its own chest pocket.',
    details: [
      'Waterproof, breathable 2.5-layer shell (20K/15K)',
      'Fully taped seams and water-resistant zippers',
      'Helmet-compatible hood with one-pull adjuster',
      'Pit zips for venting on the climb',
      'Packs into chest pocket; 11.5 oz (size M)',
    ],
    materials: '100% recycled nylon face, PFC-free DWR finish.',
    rating: 4.7,
    reviews: 212,
    badge: 'Bestseller',
  },
  {
    sku: 'DS-095',
    slug: 'ds-095',
    name: 'Cirrus Down Sweater',
    category: 'Outerwear',
    gender: 'Women',
    listPrice: 95,
    garment: 'down',
    colors: [
      { name: 'Fjord', hex: '#365f86' },
      { name: 'Clay', hex: '#a8644a' },
    ],
    blurb: 'Lightweight 700-fill down that layers under a shell or stands alone on cold, dry days.',
    details: ['700-fill responsibly sourced down', 'Packs into its own pocket', 'Zippered hand pockets'],
    materials: 'Recycled polyester ripstop shell, RDS-certified down.',
    rating: 4.8,
    reviews: 98,
    badge: 'New',
  },
  {
    sku: 'BF-078',
    slug: 'bf-078',
    name: 'Basin Fleece Pullover',
    category: 'Layers',
    gender: 'Unisex',
    listPrice: 78,
    garment: 'fleece',
    colors: [
      { name: 'Oat', hex: '#c9b99a' },
      { name: 'Moss', hex: '#5b6b3a' },
    ],
    blurb: 'A heavyweight grid fleece with a quarter zip and a kangaroo pocket for chilly camp mornings.',
    details: ['Quarter-zip collar', 'Snap-close chest pocket', 'Relaxed fit'],
    materials: '100% recycled polyester grid fleece.',
    rating: 4.6,
    reviews: 341,
  },
  {
    sku: 'CV-120',
    slug: 'cv-120',
    name: 'Cascade Insulated Vest',
    category: 'Outerwear',
    gender: 'Men',
    listPrice: 120,
    garment: 'vest',
    colors: [
      { name: 'Ochre', hex: '#c08a2e' },
      { name: 'Graphite', hex: '#3b3f45' },
    ],
    blurb: 'Synthetic insulation that stays warm when damp, with a cut that moves.',
    details: ['Water-resistant synthetic fill', 'Two zippered hand pockets', 'Stretch side panels'],
    materials: 'Recycled nylon shell, recycled polyester insulation.',
    rating: 4.5,
    reviews: 77,
  },
  {
    sku: 'SP-085',
    slug: 'sp-085',
    name: 'Switchback Trail Pant',
    category: 'Bottoms',
    gender: 'Women',
    listPrice: 85,
    garment: 'pant',
    colors: [
      { name: 'Driftwood', hex: '#8a7a63' },
      { name: 'Ink', hex: '#2d3446' },
    ],
    blurb: 'Four-way stretch with a gusseted crotch and roll-up cuffs for creek crossings.',
    details: ['Four-way stretch woven fabric', 'Zippered thigh pocket', 'Roll-up snap cuffs'],
    materials: '88% nylon, 12% elastane.',
    rating: 4.6,
    reviews: 156,
  },
  {
    sku: 'TM-065',
    slug: 'tm-065',
    name: 'Talus Merino Crew',
    category: 'Layers',
    gender: 'Men',
    listPrice: 65,
    garment: 'tee',
    colors: [
      { name: 'Heather Gray', hex: '#8d9197' },
      { name: 'Rust', hex: '#9c4a2f' },
    ],
    blurb: 'A 150-weight merino tee that resists odor for days on the trail.',
    details: ['150 g/m² merino jersey', 'Flatlock seams', 'Tagless neck'],
    materials: '100% merino wool.',
    rating: 4.7,
    reviews: 203,
  },
  {
    sku: 'AB-032',
    slug: 'ab-032',
    name: 'Alpine Rib Beanie',
    category: 'Accessories',
    gender: 'Unisex',
    listPrice: 32,
    garment: 'beanie',
    colors: [
      { name: 'Signal Orange', hex: '#d0632f' },
      { name: 'Spruce', hex: '#2f5d4a' },
    ],
    blurb: 'A deep-cuff rib knit in soft wool blend.',
    details: ['Fold-over cuff', 'Wool-blend rib knit'],
    materials: '60% wool, 40% recycled nylon.',
    rating: 4.9,
    reviews: 412,
  },
  {
    sku: 'LP-058',
    slug: 'lp-058',
    name: 'Lookout 18L Daypack',
    category: 'Accessories',
    gender: 'Unisex',
    listPrice: 58,
    garment: 'pack',
    colors: [
      { name: 'Slate', hex: '#4b5a66' },
      { name: 'Ember', hex: '#b5482b' },
    ],
    blurb: 'A simple, tough daypack with a padded sleeve and a stretch front pocket.',
    details: ['18 L capacity', 'Padded laptop sleeve (fits 15")', 'Side bottle pockets'],
    materials: 'Recycled 420D nylon.',
    rating: 4.6,
    reviews: 128,
  },
]

export const findProduct = (slug: string) => PRODUCTS.find((p) => p.slug === slug)
export const findSku = (sku: string) => PRODUCTS.find((p) => p.sku === sku)

export const SIZES: Record<Product['category'], string[]> = {
  Outerwear: ['XS', 'S', 'M', 'L', 'XL'],
  Layers: ['XS', 'S', 'M', 'L', 'XL'],
  Bottoms: ['26', '28', '30', '32', '34'],
  Accessories: ['One size'],
}

// Day 0 of the demo calendar (matches service/app/clock.py BASE_DATE).
export const BASE_DATE = '2026-10-18'

export function dateForDay(day: number): Date {
  const d = new Date(`${BASE_DATE}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + day)
  return d
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export const usd = (n: number) => `$${n.toFixed(2)}`
