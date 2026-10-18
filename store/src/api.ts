export const STORE_SERVER = 'http://localhost:8001'

export async function getPrice(sku: string): Promise<number> {
  const res = await fetch(`${STORE_SERVER}/price/${sku}`)
  const body = await res.json()
  return body.price
}
