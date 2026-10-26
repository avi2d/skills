# Ledger

Ledger imports the CSV file your bank exports into ledger.csv.
It skips every line that ledger.csv already holds, so importing the same export twice adds nothing.

## Before you begin

- Bun, tested on 1.4.2

## Import a bank export

To import a bank export:

1. Run `bun run import <file>`.

The command prints each transaction it added to ledger.csv, one per line.

## Preview an import

To see what an import would add without changing ledger.csv:

1. Run `bun run import --dry-run <file>`.

The command prints each transaction the import would add, one per line, and leaves ledger.csv as it was.

## Run the tests

To run the tests:

1. Run `bun test`.
