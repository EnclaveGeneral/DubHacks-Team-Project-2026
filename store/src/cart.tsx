import { createContext, useContext, useState, type ReactNode } from 'react'

export interface LineItem {
  sku: string
  color: string
  size: string
  qty: number
}

export interface Order {
  id: string
  day: number
  items: (LineItem & { price: number })[]
  email: string
  name: string
  card: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable: state lives for this page only
  }
}

interface CartApi {
  items: LineItem[]
  count: number
  add: (item: LineItem) => void
  remove: (index: number) => void
  clear: () => void
}

const CartContext = createContext<CartApi | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<LineItem[]>(() => read('ridgeline.bag', []))

  const save = (next: LineItem[]) => {
    setItems(next)
    write('ridgeline.bag', next)
  }

  const api: CartApi = {
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    add: (item) => {
      const i = items.findIndex((x) => x.sku === item.sku && x.color === item.color && x.size === item.size)
      if (i >= 0) save(items.map((x, j) => (j === i ? { ...x, qty: x.qty + item.qty } : x)))
      else save([...items, item])
    },
    remove: (index) => save(items.filter((_, j) => j !== index)),
    clear: () => save([]),
  }
  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart outside CartProvider')
  return ctx
}

// Orders. Numbers start at RO-10482 (the demo order) and count up.
export function placeOrder(order: Omit<Order, 'id'>): Order {
  const next = read<number>('ridgeline.nextOrder', 10482)
  const placed = { ...order, id: `RO-${next}` }
  write('ridgeline.nextOrder', next + 1)
  write(`ridgeline.order.${placed.id}`, placed)
  return placed
}

export const loadOrder = (id: string) => read<Order | null>(`ridgeline.order.${id}`, null)
