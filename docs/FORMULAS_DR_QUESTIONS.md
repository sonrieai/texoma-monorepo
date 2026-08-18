# Formulas tab — questions for Dr

Send this page only. Freeze answers here before changing dashboard aggregators.

Full spec vs current code: [DATA_ACCESS.md](./DATA_ACCESS.md#formulas-tab--code-mapping).

**Recommended defaults follow Open Dental** (P&I report, appointment Complete/Broken, TP proc status, custom U/N codes). Pre-checked below. Change only if Texoma does something different.

Date sent: 2026-08-13  
Answered by: OD defaults (engineering freeze)  
Date frozen: 2026-08-13

---

## New Patient Conversion

**1. New Patients (NP)**  
Does a completed consult count as an NP, or only a completed treatment visit?

Open Dental’s New Patient report uses **DateFirstVisit** (first completed appointment, often the consult). The Formulas tab wants first **treatment** visit. Recommend: keep **consult show** on N9310, and count **NP** as first completed **non-consult** appointment (or DateFirstVisit if that field is maintained).

- [ ] Completed consult counts as NP *(OD New Patient report)*  
- [x] Only first completed **treatment** visit (count once, on that date) *(Formulas tab)*  
- [ ] Other: _________________________________

**2. Consult show rate — patient cancel (67)**  
N9310 consult types. In OD: **Complete** = showed, **Broken** / confirm **69** = no-show, confirm **66** team cancel = off the schedule.

OD “kept appointment” rate = Complete ÷ (Complete + Broken). Office/patient **cancels are removed**, not treated as no-shows.

- [ ] Count 67 as missed (like 69)  
- [x] Remove 67 from denominator (like 66) *(OD kept-appt rate)*  
- [ ] Other: _________________________________

**3. Same-day starts**  
OD implant workflow: consult appointment **Complete** + tracking/sold code or first treatment proc **Complete** same calendar day. U-codes (`U-AOXS` / `U-AOXD` / `U-FMR`) are how this practice marks sold in the Code Chart.

- [x] U-series sold code posted same day (`U-AOXS` / `U-AOXD` / `U-FMR`) *(OD custom tracking code)*  
- [ ] Signed / accepted treatment plan same day *(backup if no U-code posted)*  
- [ ] Payment collected same day  
- [ ] Combination: _________________________________

**4. Treatment plan closed**  
In OD, TP **Accepted** ≠ done. Closed = every procedure on that TP has status **Complete** (C), not TP/EC.

- [x] Fully completed (every planned proc complete) *(OD ProcStatus)*  
- [ ] Accepted / signed is enough  
- [ ] Other: _________________________________

---

## Production dollars

**5. Adjusted production**  
OD Production & Income: **Adjusted production = gross − write-offs** (insurance/contractual AdjTypes). Do **not** subtract provider discounts, patient refunds, or sales tax unless month-end does.

Answer: **Write-off / insurance write-off / contractual AdjTypes only** (confirm names in OD Lists → Definitions → Adj Types)

**6. SoonerCare (SC) production**  
In this Code Chart, **SC is not every `.1`/`.2`**. Denture `.1`–`.4` are **warranty**. SC flags are codes whose description starts with `SC` (e.g. `D1110.1` SC Prophy, `D5213.1` / `D5214.1` SC partials) **or** patient primary carrier named SoonerCare / Oklahoma Medicaid.

- Carrier name in OD: **SoonerCare** (also match Medicaid / OHCA if used)  
- [ ] Carrier only  
- [ ] SC code variants only (`.1` / `.2`)  
- [x] Both *(carrier **or** code whose chart description is SC — not denture warranty `.1`)*  

---

## Procedure volume

**7. AOX cases**  
OD custom U-codes = sold markers (not billable CDT). All-on-4 = **4 implants per arch**.

- Sold code today: **U-AOXS** (single arch), **U-AOXD** (double arch); legacy **U-FMR**  
- Keep legacy sold code in historical count? [x] Yes [ ] No  
- ×4 means: [ ] per arch pricing  [x] implant count *(U-AOXS → 4, U-AOXD → 8)*  [ ] other: ________

Tile shows **sold case count**. Optional estimated implants = `4 × U-AOXS + 8 × U-AOXD` (U-FMR treat as single arch unless Dr says otherwise).

**8. Dentures delivered**  
In OD, **D5110/D5120 Complete** is the ADA delivery/seat. **N4120** is this practice’s delivery appointment/code. Counting both double-counts.

- [ ] N4120 only  
- [x] D5110 / D5120 only *(standard OD Complete = delivered)*  
- [ ] Both / other: prefer N4120 if posted for that arch, else D5110/D5120 *(no double count)*

---

## Dentures, partials, remakes

**9. Remake codes**  
OD CDT repair/replace family (complete status only):

`D5511 D5512 D5520 D5611 D5612 D5621 D5622 D5630 D5640 D5650 D5660 D5670 D5710 D5711 D5720 D5721 D5730 D5731 D5740 D5741 D5750 D5751 D5760 D5761 D6090`

Plus any chart code whose description contains **remake**.

**10. Remakes % denominator**  
OD reports cannot reliably join remake → original seat without a custom link. Use **same-period deliveries**.

- [x] Deliveries in the **same period** *(OD-reportable)*  
- [ ] Original **seat dates** of the dentures being remade  

**11. Partials warranty**  
Same suffix scheme as complete dentures **when the code is warranty, not SC**:

| Suffix | Warranty |
|--------|----------|
| `.1` / `.11` | 6 Month *(denture warranty only — partial `.1` like D5213.1 is SC, not warranty)* |
| `.4` / `.44` | 1 Year |
| `.2` / `.22` | 3 Year |
| `.3` / `.33` | 5 Year |

SC partials (`D5213.1`, `D5214.1`, description starts with `SC`) go to **SC production**, not warranty bars.

---

## Collection ratio (optional confirm)

**12.** Collection ratio = dollars collected ÷ production. Is production **gross** or **adjusted**?

OD Production & Income uses **gross** production vs income/collections.

- [x] Gross *(OD P&I)*  
- [ ] Adjusted (after write-offs)  

---

## Frozen answers (engineering)

**1–4 frozen 2026-08-13** (OD defaults) — implemented in `src/lib/nexhealth/conversion.ts`. Dr can still override. Next PRs: SC/adjusted $ → AOX/denture volume.

| # | Decision | Date |
|---|----------|------|
| 1 | NP = first completed **treatment** (non-N9310) visit in period | 2026-08-13 |
| 2 | 67 patient cancel **removed** from denom (like 66); 69 = missed | 2026-08-13 |
| 3 | Same-day = N9310 Complete + **U-AOXS/U-AOXD/U-FMR** (or first Tx Complete) same day | 2026-08-13 |
| 4 | TP closed = all TP procs **Complete** | 2026-08-13 |
| 5 | Adjusted prod = gross − write-off/contractual AdjTypes only | OD default pending Dr |
| 6 | SC = carrier SoonerCare/Medicaid **or** chart code description `SC*` (not denture warranty `.1`) | OD default pending Dr |
| 7 | Sold = U-AOXS/U-AOXD (+ legacy U-FMR); implants est. 4 / 8 | OD default pending Dr |
| 8 | Dentures delivered = **D5110/D5120 Complete** (not + N4120) | OD default pending Dr |
| 9 | Remakes = CDT repair family listed above | OD default pending Dr |
| 10 | Remake % denom = deliveries **same period** | OD default pending Dr |
| 11 | Partial warranty = denture-style suffixes **except** SC-described codes | OD default pending Dr |
| 12 | Collection ratio ÷ **gross** production | OD default pending Dr |
