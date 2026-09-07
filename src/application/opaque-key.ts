export function createOpaqueKey(namespace: string, identity: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of identity) {
    const code = character.codePointAt(0)!;
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${namespace}:${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}
