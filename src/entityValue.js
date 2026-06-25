export function toFactArg(value) {
  if (value !== null && typeof value === 'object' && 'name' in value) return value.name;
  return value;
}
