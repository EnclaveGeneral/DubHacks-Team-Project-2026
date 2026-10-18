# Source documents

DRAFT. Freeze the wording at hour 2. The extraction cache, engine tests, and demo script quote these files verbatim, so any later edit means regenerating the cache.

| File | Used by |
| --- | --- |
| `ridgeline-policy.md` | Mock store `/policy` page (clauses 3.1 return, 4.2 price match, 6.1 warranty) |
| `northwind-rewards-visa-4417.md` | Demo card: 3 pts/$1, proportional reversal, +1 year extended warranty |
| `cascade-cash-visa-9021.md` | Second card: 1.5%, no reversal under $50, 90-day return protection |

Clause labels: store clauses are cited as `4.2`; card clauses as `§1.3` (section sign + number). The extraction prompt must emit the same format so live output matches `/shared/fixtures`.

Still to write: a second store policy with **no** price-match clause (stretch goal).
