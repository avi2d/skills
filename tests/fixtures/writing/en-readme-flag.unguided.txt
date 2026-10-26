# Ledger

Ledger imports the CSV file your bank exports into `ledger.csv`.
Run `bun run import <file>` to import one, and `bun test` to run the tests.
Run `bun run import --dry-run <file>` to list the transactions the import would add without changing `ledger.csv`.
