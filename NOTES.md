
```
libfec-dev api \
  --form-type F3 \
  --election 2026 \
  --cycle 2026 \
  --filing-ids-only \
   CA41 > ca41-f3-26.txt

libfec-dev cache add ca41-f3-26.txt
libfec-dev export --include-all-bulk --cycle 2026 ca41-f3-26.txt -o ca41-f3-26.db
```

```
libfec-dev api --form-type F3 --cycle 2022 --filing-ids-only C00721365 > santos.txt
libfec-dev api --filing-ids-only C00879510 > musk.txt
libfec-dev cache add ca41-f3-26.txt
```

```
libfec-dev api \
  --form-type F3 \
  --election 2026 \
  --cycle 2026 \
  --office H \
  --state IN \
  --report-type YE \
  --filing-ids-only > in-house-f3-26.txt

libfec-dev cache add in-house-f3-26.txt
libfec-dev export --include-all-bulk --cycle 2026 in-house-f3-26.txt -o in-house-f3-26.db
```