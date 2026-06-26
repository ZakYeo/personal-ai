#!/usr/bin/env node

export function main(): void {
  throw new Error("CLI runtime is not implemented yet.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
