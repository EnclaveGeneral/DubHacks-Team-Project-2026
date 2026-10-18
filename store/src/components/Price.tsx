const fmt = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

export default function Price({
  price,
  listPrice,
  large = false,
}: {
  price: number
  listPrice: number
  large?: boolean
}) {
  const onSale = price < listPrice
  return (
    <p className={`price ${large ? 'large' : ''}`}>
      <span className={onSale ? 'sale-price' : undefined}>{fmt(price)}</span>
      {onSale && (
        <>
          <s className="was">{fmt(listPrice)}</s>
          <span className="save">Save {Math.round((1 - price / listPrice) * 100)}%</span>
        </>
      )}
    </p>
  )
}
