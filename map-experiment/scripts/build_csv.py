#!/usr/bin/env python3
"""Build per-candidate zip code donation data for the map."""

import csv
import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "texas-senate-filings.db"
OUT_DIR = Path(__file__).resolve().parents[1] / "public"

QUERY = """
SELECT
  substr(sa.contributor_zip_code, 1, 5) AS zip5,
  c.name AS candidate_name,
  COUNT(DISTINCT sa.contributor_last_name || sa.contributor_first_name || sa.contributor_zip_code) AS num_contributors,
  COUNT(*) AS num_contributions,
  SUM(sa.contribution_amount) AS total_amount
FROM libfec_schedule_a sa
JOIN libfec_filings f ON sa.filing_id = f.filing_id
LEFT JOIN libfec_committees com ON f.filer_id = com.committee_id
LEFT JOIN libfec_candidates c ON com.committee_id = c.principal_campaign_committee
WHERE sa.form_type = 'SA11AI'
  AND sa.entity_type = 'IND'
  AND f.cover_record_form = 'F3'
  AND f.report_code = '12P'
  AND c.name IS NOT NULL
  AND length(substr(sa.contributor_zip_code, 1, 5)) = 5
  AND substr(sa.contributor_zip_code, 1, 5) != '00000'
GROUP BY zip5, candidate_name
"""


def main():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(QUERY).fetchall()
    conn.close()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Write CSV
    csv_path = OUT_DIR / "candidate_zip_data.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["zip5", "candidate_name", "num_contributors", "num_contributions", "total_amount"])
        for row in rows:
            writer.writerow(row)
    print(f"Wrote {len(rows)} rows to {csv_path}")

    # Write candidates list
    candidates = sorted(set(row[1] for row in rows))
    candidates_path = OUT_DIR / "candidates.json"
    with open(candidates_path, "w") as f:
        json.dump(candidates, f, indent=2)
    print(f"Wrote {len(candidates)} candidates to {candidates_path}")


if __name__ == "__main__":
    main()
