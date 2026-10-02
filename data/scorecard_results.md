### Scorecard (1-5 sub-scores; evidence for each in `data/scorecard.json`)

| Game | Demand | Under-delivery | **Opportunity Index** (D x U, max 25) | Tech-fit | Exec. ease | Monetization | Composite (0-100) |
|---|---:|---:|---:|---:|---:|---:|---:|
| **G1** Kernel Architect | 4.67 | 4.67 | **21.8** | 5 | 3 | 5 | 88 |
| **G3** Heisenbug Hunter | 3.00 | 3.33 | **10.0** | 4 | 3 | 3 | 52 |
| **G4** AST Archeology: Merge Conflict | 3.33 | 2.33 | **7.8** | 3 | 2 | 3 | 41 |
| **G2** Lexer & Scope: Day Zero | 2.00 | 3.67 | **7.3** | 2 | 3 | 2 | 36 |

### Does the pick survive different lenses?

| Lens | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| Opportunity Index (primary) | G1 | G3 | G4 | G2 |
| Demand only | G1 | G4 | G3 | G2 |
| Under-delivery only | G1 | G2 | G3 | G4 |
| Composite (60% opp / 40% build-fit) | G1 | G3 | G4 | G2 |
| Builder-first (30% opp / 70% build-fit) | G1 | G3 | G4 | G2 |

### Monte-Carlo: every sub-score randomly shifted by -1/0/+1, 20,000 runs (seeded)

| Game | Wins on Opportunity Index | Wins on Composite |
|---|---:|---:|
| G1 | 99.9% | 100.0% |
| G2 | 0.0% | 0.0% |
| G3 | 0.1% | 0.0% |
| G4 | 0.0% | 0.0% |

### Adversarial stress tests

* **Worst case for G1:** G1's six demand/under-delivery scores all -1, every rival's all +1 -> G1 13.4, G2 12.0, G3 17.3, G4 14.4  (winner: **G3**).
* **Headroom:** G1's Demand *and* Under-delivery would both have to be over-scored by **1.51 points** (on a 5-point scale) before the best rival (G3, 10.0) overtakes it on the Opportunity Index.
