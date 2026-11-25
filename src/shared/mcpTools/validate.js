/**
 * A tiny JSON-Schema checker for tool arguments (pure, shared with the hub).
 *
 * Supports exactly what the catalogue uses: type (object, string, integer, number, boolean, array), enum, required,
 * properties (unknown keys are refused unless `additionalProperties: true`), minLength / maxLength, minimum / maximum,
 * items, maxItems. It is a first gate with plain sentences; the real rules (text caps, dates, takeover permission) stay in
 * the server modules the tools call, so nothing is validated twice with different answers.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function typeOk(type, v) {
  switch (type) {
    case 'object': return isObj(v);
    case 'array': return Array.isArray(v);
    case 'string': return typeof v === 'string';
    case 'boolean': return typeof v === 'boolean';
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    default: return true;
  }
}

function walk(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') return;
  const here = path || 'the request';
  if (schema.type && !typeOk(schema.type, value)) {
    errors.push(`${here} must be ${schema.type === 'integer' ? 'a whole number' : `a ${schema.type}`}.`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${here} must be one of: ${schema.enum.join(', ')}.`);
    return;
  }
  if (typeof value === 'string') {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${here} is too long (${value.length} characters; the most is ${schema.maxLength}).`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${here} is too short.`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${here} must be at least ${schema.minimum}.`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${here} must be at most ${schema.maximum}.`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${here} can have at most ${schema.maxItems} items.`);
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${here} needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}.`);
    if (schema.items) value.forEach((v, i) => walk(schema.items, v, `${path}[${i}]`, errors));
  }
  if (isObj(value) && schema.type === 'object') {
    const props = schema.properties || {};
    for (const k of schema.required || []) if (value[k] === undefined) errors.push(`${path ? `${path}.` : ''}${k} is required.`);
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (props[k]) walk(props[k], v, path ? `${path}.${k}` : k, errors);
      else if (schema.additionalProperties !== true) errors.push(`${path ? `${path}.` : ''}${k} is not something this tool accepts.`);
    }
  }
}

/** @returns {{ ok: boolean, errors: string[] }} */
export function validateArgs(schema, args) {
  const errors = [];
  walk(schema, args === undefined || args === null ? {} : args, '', errors);
  return { ok: errors.length === 0, errors };
}
