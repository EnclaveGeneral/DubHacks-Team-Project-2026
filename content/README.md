# Source documents

Freeze the wording before the demo. The extraction cache, engine tests, fixtures, and e2e checks quote these files verbatim, so any later edit means deleting `service/app/cache/policy-*.json` (or `benefits-*.json`) and fixing the quotes `service/tests/test_fixtures.py` flags.

| File | Used by |
| --- | --- |
| `ridgeline-policy.md` | Mock store `/policy.html` (clauses 3.1 return, 4.2 price adjustment, 6.1 warranty) |
| `fjord-pine-policy.md` | Fictional second store (seeded demo purchases for the BackPocket website): 45-day returns 3.1, 15-day price adjustment 4.2, 2-year warranty 5.1 |
| `hearthside-policy.md` | Fictional third store with **no** price adjustments (clause 4.1): 30-day returns 3.1, 1-year warranty 5.1 |
| `northwind-rewards-visa-4417.md` | Demo card: 3 pts/$1, proportional reversal, +1 year extended warranty |
| `cascade-cash-visa-9021.md` | Second card: 1.5%, no reversal under $50, 90-day return protection |

Clause labels: store clauses are cited as `4.2`; card clauses as `§1.3` (section sign + number). The extraction prompt must emit the same format so live output matches `/shared/fixtures`.

## Where the Ridgeline policy language comes from

Ridgeline is fictional, but its policy is written in the style and structure of real retailers' published terms, so BackPocket is tested against realistic language: exclusions, receipt requirements, and conditions mixed in with the deadlines. No retailer is named in the policy, and nothing in it is a statement about any real retailer's current terms.

| Ridgeline clause | Modeled on |
| --- | --- |
| 4.2 "a one-time price adjustment may be requested within 14 days after the purchase date" | Target's Price Match Guarantee: "Price matches may be requested at time of purchase or within 14 days after purchase" ([target.com](https://www.target.com/help/articles/policies-guidelines/price-match-guarantee)); Gap's one-time adjustment within 14 days of the order date |
| 4.3 identical item, same size and color | REI's same product, color, and size requirement (as summarized by third parties) |
| 4.4 promo-code and final-sale exclusions | Gap / Banana Republic price adjustment exclusions |
| 4.5 typographical errors, limited-quantity offers | Target's Price Match Guarantee exclusions |
| 4.6 order confirmation, receipt, or packing slip required | Target: "Original receipts, physical or digital, or packing slips are required for price adjustments" |
| 3.3 refunds to the original form of payment in 3-5 business days; shipping not refunded | Nordstrom's return policy |
| 5.1 no direct exchanges | Patagonia's returns page: "We do not do direct exchanges." |
| 6.1-6.2 defects in materials and workmanship; not normal wear and tear | Columbia Sportswear's limited warranties |

The two card benefits guides are fictional and written by the team so the demo never misstates a real card's terms.

Fjord & Pine and Hearthside are fictional too. Their policies are only used to seed demo purchases in `service/app/demo_data.py`, so the website has data beyond Ridgeline; there are no store pages for them.
