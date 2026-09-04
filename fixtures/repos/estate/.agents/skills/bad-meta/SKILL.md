---
name: bad-meta
description: Converts fixture spreadsheets into tidy CSV. Use when the user asks to tidy a spreadsheet.
trigger: spreadsheet
metadata:
  version: 1.0
  tags:
    - csv
---

# bad-meta

Read the sheet, drop blank rows, write RFC 4180 CSV.
