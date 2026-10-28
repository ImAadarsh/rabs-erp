# Google Sheet import URLs (ready to paste)

After signing in as an editor of
https://docs.google.com/spreadsheets/d/1fBU4DOQazP_Gi7a8d2DgKc0rM5ATdiDwoq3aoDbHHt0/edit

On each tab, put this in **A1** (then copy → Paste special → Values only if you want static data):

| Tab | Formula |
|-----|---------|
| 1 Enquiry - Customer | `=IMPORTDATA("https://files.catbox.moe/8tycr1.csv")` |
| 2 Appointment | `=IMPORTDATA("https://files.catbox.moe/7zcexc.csv")` |
| 3 Measure | `=IMPORTDATA("https://files.catbox.moe/pcczu4.csv")` |
| 4 Quotation | `=IMPORTDATA("https://files.catbox.moe/wc2ldb.csv")` |
| 5 Accepted Quote | `=IMPORTDATA("https://files.catbox.moe/ryenfq.csv")` |
| 6 Deposit and Advance | `=IMPORTDATA("https://files.catbox.moe/sx2d1r.csv")` |
| 7 Material and Production | `=IMPORTDATA("https://files.catbox.moe/8febma.csv")` |
| 8 Fitting and Delivery | `=IMPORTDATA("https://files.catbox.moe/pmwg5d.csv")` |
| 9 Completion | `=IMPORTDATA("https://files.catbox.moe/93gxxd.csv")` |
| 10 Final Payment and Closed | `=IMPORTDATA("https://files.catbox.moe/a65fon.csv")` |
| 11 Cross-cutting and Admin | `=IMPORTDATA("https://files.catbox.moe/2i6km2.csv")` |

**All features (one sheet):** `=IMPORTDATA("https://files.catbox.moe/zxydl0.csv")`

Or: **File → Import → Upload** the files under `requirement-docs/sheet-tabs/`.
