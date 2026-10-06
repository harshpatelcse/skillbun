import { validateEmail } from '../shared/emailValidator.js';

/**
 * Validates a plain object (rejecting null, primitives, arrays, and objects with suspicious prototypes).
 */
export function validatePlainObject(value, options = {}) {
  const { fieldName = 'Payload', maxKeys = 50 } = options;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      isValid: false,
      error: `${fieldName} must be a valid JSON object.`,
      value: null,
    };
  }

  // Reject prototype pollution attempts
  if (
    Object.prototype.hasOwnProperty.call(value, '__proto__') ||
    Object.prototype.hasOwnProperty.call(value, 'constructor') ||
    Object.prototype.hasOwnProperty.call(value, 'prototype')
  ) {
    return {
      isValid: false,
      error: `Invalid property names in ${fieldName}.`,
      value: null,
    };
  }

  const keys = Object.keys(value);
  if (keys.length > maxKeys) {
    return {
      isValid: false,
      error: `${fieldName} contains too many properties (max: ${maxKeys}).`,
      value: null,
    };
  }

  return { isValid: true, value, error: null };
}

/**
 * Patterns matching known SQL injection attack vectors.
 */
export const SQL_INJECTION_PATTERNS = [
  // Classic tautologies and boolean manipulation: ' or '1'='1, " or ""="", ' or 1=1--, ' and 'a'='a, admin' and 1=1#
  /(?:'|"|`|\b)\s*(?:or|and|xor)\s+(?:'[^']*'|"[^"]*"|`[^`]*`|'[^']*|"[^"]*|\d+)\s*=\s*(?:'[^']*'|"[^"]*"|`[^`]*`|'[^']*|"[^"]*|\d+)/i,
  /\b(?:or|and|xor)\s+\d+\s*=\s*\d+\s*(?:--|#|\/\*)/i,
  // UNION SELECT attacks
  /\bunion\s+(?:all\s+)?select\b/i,
  // Stacked queries with dangerous DML/DDL operations
  /;\s*(?:select|insert|update|delete|drop|alter|create|truncate|exec|execute|grant|revoke|union)\b/i,
  // Require SQL-breaking context before a line comment. A bare trailing hash
  // is valid technical vocabulary (C#, F#), not an injection signature.
  /(?:['"`]|\b\d+)\s*(?:--|#)(?:\s|$)/,
  /\/\*[\s\S]*?\*\//,
  // Time-based and blind SQL injection functions
  /\b(?:sleep|benchmark|waitfor\s+delay|pg_sleep)\s*\(/i,
  // System metadata tables
  /\b(?:information_schema\.|sys\.objects|sysobjects|sysdatabases|syscolumns)\b/i,
  // Dangerous SQL Server / Oracle stored procedures
  /\b(?:xp_cmdshell|sp_executesql|dbms_pipe|utl_http)\b/i,
  // Hex/char encoding evasions commonly used in SQLi payloads: 0x61646d696e, CHAR(39)
  /\b0x[0-9a-fA-F]{8,}\b/,
  /\b(?:char|nchar|varchar|nvarchar)\s*\(\s*\d+\s*(?:,\s*\d+\s*)*\)/i,
];

/**
 * Checks whether a given string contains SQL injection attack signatures.
 * Returns true if suspicious SQL injection syntax is found.
 */
export function hasSqlInjectionPattern(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Validates a string with strict type, length, format, and injection protection rules.
 */
export function validateString(value, options = {}) {
  const {
    fieldName = 'Field',
    minLength = 0,
    maxLength = 1000,
    pattern = null,
    allowEmpty = false,
    trim = true,
    rejectSqlInjection = false,
  } = options;

  if (typeof value !== 'string') {
    if (value === undefined || value === null) {
      if (allowEmpty && minLength === 0) {
        return { isValid: true, value: '', error: null };
      }
      return { isValid: false, error: `${fieldName} is required.`, value: '' };
    }
    return { isValid: false, error: `${fieldName} must be a string.`, value: '' };
  }

  const processed = trim ? value.trim() : value;

  if (!allowEmpty && processed.length === 0 && minLength > 0) {
    return { isValid: false, error: `${fieldName} cannot be empty.`, value: processed };
  }

  if (processed.length < minLength) {
    return {
      isValid: false,
      error: `${fieldName} must be at least ${minLength} characters long.`,
      value: processed,
    };
  }

  if (processed.length > maxLength) {
    return {
      isValid: false,
      error: `${fieldName} cannot exceed ${maxLength} characters.`,
      value: processed,
    };
  }

  // Reject unsafe control characters (except common whitespace \r, \n, \t)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(processed)) {
    return {
      isValid: false,
      error: `${fieldName} contains invalid control characters.`,
      value: processed,
    };
  }

  // Reject SQL injection attempts if flag is enabled
  if (rejectSqlInjection && hasSqlInjectionPattern(processed)) {
    return {
      isValid: false,
      error: `${fieldName} contains invalid or unsafe characters.`,
      value: processed,
    };
  }

  if (pattern && !pattern.test(processed)) {
    return {
      isValid: false,
      error: `${fieldName} has an invalid format.`,
      value: processed,
    };
  }

  return { isValid: true, value: processed, error: null };
}

/**
 * Validates Firestore document or collection identifiers to prevent path traversal,
 * NoSQL key tampering, or forbidden characters.
 */
export function validateFirestoreId(id, options = {}) {
  const { fieldName = 'Document ID', minLength = 1, maxLength = 128, allowAtSymbol = true } = options;

  if (typeof id !== 'string' || !id.trim()) {
    return { isValid: false, error: `${fieldName} is required and must be a non-empty string.`, value: '' };
  }

  const trimmed = id.trim();

  // Prevent path traversal
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..') || trimmed.includes('\0')) {
    return { isValid: false, error: `${fieldName} contains invalid path characters.`, value: '' };
  }

  if (trimmed.length < minLength || trimmed.length > maxLength) {
    return { isValid: false, error: `${fieldName} length must be between ${minLength} and ${maxLength} characters.`, value: '' };
  }

  const idPattern = allowAtSymbol ? /^[a-zA-Z0-9_\-\.@]+$/ : /^[a-zA-Z0-9_\-]+$/;
  if (!idPattern.test(trimmed)) {
    return { isValid: false, error: `${fieldName} contains invalid characters.`, value: '' };
  }

  return { isValid: true, value: trimmed, error: null };
}

/**
 * Sanitizes a cache key string for Redis or memory caches to prevent key injection,
 * newline poisoning, or unintended key collision.
 */
export function sanitizeCacheKey(key) {
  if (typeof key !== 'string') return '_invalid_key';
  return key.replace(/[\r\n\t\0\x00-\x1F\x7F]/g, '').trim().slice(0, 256);
}

/**
 * Validates an integer within a strict range.
 */
export function validateInteger(value, options = {}) {
  const { fieldName = 'Field', min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, defaultValue = undefined } = options;

  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) {
      return { isValid: true, value: defaultValue, error: null };
    }
    return { isValid: false, error: `${fieldName} is required.`, value: null };
  }

  const num = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(num)) {
    return { isValid: false, error: `${fieldName} must be an integer.`, value: null };
  }

  if (num < min || num > max) {
    return {
      isValid: false,
      error: `${fieldName} must be between ${min} and ${max}.`,
      value: null,
    };
  }

  return { isValid: true, value: num, error: null };
}

/**
 * Validates a boolean value.
 */
export function validateBoolean(value, options = {}) {
  const { fieldName = 'Field', defaultValue = undefined } = options;

  if (typeof value === 'boolean') {
    return { isValid: true, value, error: null };
  }

  if (value === undefined || value === null) {
    if (defaultValue !== undefined) {
      return { isValid: true, value: defaultValue, error: null };
    }
    return { isValid: false, error: `${fieldName} must be a boolean.`, value: null };
  }

  if (value === 'true' || value === '1' || value === 1) {
    return { isValid: true, value: true, error: null };
  }

  if (value === 'false' || value === '0' || value === 0) {
    return { isValid: true, value: false, error: null };
  }

  return { isValid: false, error: `${fieldName} must be a boolean.`, value: null };
}

/**
 * Validates that a value belongs to a specific enum / whitelist.
 */
export function validateEnum(value, allowedValues, options = {}) {
  const { fieldName = 'Field', defaultValue = undefined } = options;

  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) {
      return { isValid: true, value: defaultValue, error: null };
    }
    return { isValid: false, error: `${fieldName} is required.`, value: null };
  }

  if (!allowedValues.includes(value)) {
    return {
      isValid: false,
      error: `${fieldName} must be one of: ${allowedValues.join(', ')}.`,
      value: null,
    };
  }

  return { isValid: true, value, error: null };
}

/**
 * Validates an array with length limits and optional element validator.
 */
export function validateArray(value, options = {}) {
  const {
    fieldName = 'Array',
    minItems = 0,
    maxItems = 100,
    itemValidator = null,
  } = options;

  if (!Array.isArray(value)) {
    return { isValid: false, error: `${fieldName} must be an array.`, value: [] };
  }

  if (value.length < minItems) {
    return {
      isValid: false,
      error: `${fieldName} must contain at least ${minItems} item(s).`,
      value,
    };
  }

  if (value.length > maxItems) {
    return {
      isValid: false,
      error: `${fieldName} cannot exceed ${maxItems} items.`,
      value,
    };
  }

  if (typeof itemValidator === 'function') {
    const validatedItems = [];
    for (let i = 0; i < value.length; i++) {
      const result = itemValidator(value[i], i);
      if (!result.isValid) {
        return {
          isValid: false,
          error: `${fieldName}[${i}]: ${result.error}`,
          value,
        };
      }
      validatedItems.push(result.value !== undefined ? result.value : value[i]);
    }
    return { isValid: true, value: validatedItems, error: null };
  }

  return { isValid: true, value, error: null };
}

/**
 * Validates an entire object against a structured field schema.
 * Rejects unknown fields by default to prevent unwanted or injected payload properties.
 */
export function validateSchema(payload, schema, options = {}) {
  const { allowUnknown = false, fieldName = 'Payload', maxKeys = 50 } = options;

  const objCheck = validatePlainObject(payload, { fieldName, maxKeys });
  if (!objCheck.isValid) {
    return { isValid: false, error: objCheck.error, value: null };
  }

  const payloadKeys = Object.keys(payload);
  const schemaKeys = new Set(Object.keys(schema));

  if (!allowUnknown) {
    for (const key of payloadKeys) {
      if (!schemaKeys.has(key)) {
        return {
          isValid: false,
          error: `Unrecognized field '${key}' in ${fieldName}.`,
          value: null,
        };
      }
    }
  }

  const validated = {};

  for (const [key, rule] of Object.entries(schema)) {
    const rawVal = payload[key];
    const isPresent = rawVal !== undefined && rawVal !== null;

    if (rule.required && (!isPresent || rawVal === '')) {
      return {
        isValid: false,
        error: `${rule.label || key} is required.`,
        value: null,
      };
    }

    if (!isPresent) {
      if (rule.defaultValue !== undefined) {
        validated[key] = rule.defaultValue;
      }
      continue;
    }

    // Type validation
    if (rule.type === 'string') {
      const res = validateString(rawVal, {
        fieldName: rule.label || key,
        minLength: rule.minLength ?? 0,
        maxLength: rule.maxLength ?? 1000,
        pattern: rule.pattern,
        allowEmpty: rule.allowEmpty ?? !rule.required,
        rejectSqlInjection: rule.rejectSqlInjection ?? true,
      });
      if (!res.isValid) return { isValid: false, error: res.error, value: null };
      validated[key] = res.value;
    } else if (rule.type === 'email') {
      const res = validateEmail(rawVal);
      if (!res.isValid) return { isValid: false, error: res.error, value: null };
      validated[key] = res.normalizedEmail;
    } else if (rule.type === 'integer') {
      const res = validateInteger(rawVal, {
        fieldName: rule.label || key,
        min: rule.min,
        max: rule.max,
        defaultValue: rule.defaultValue,
      });
      if (!res.isValid) return { isValid: false, error: res.error, value: null };
      validated[key] = res.value;
    } else if (rule.type === 'boolean') {
      const res = validateBoolean(rawVal, {
        fieldName: rule.label || key,
        defaultValue: rule.defaultValue,
      });
      if (!res.isValid) return { isValid: false, error: res.error, value: null };
      validated[key] = res.value;
    } else if (rule.type === 'enum') {
      const res = validateEnum(rawVal, rule.allowedValues || [], {
        fieldName: rule.label || key,
        defaultValue: rule.defaultValue,
      });
      if (!res.isValid) return { isValid: false, error: res.error, value: null };
      validated[key] = res.value;
    } else if (rule.type === 'array') {
      const res = validateArray(rawVal, {
        fieldName: rule.label || key,
        minItems: rule.minItems ?? 0,
        maxItems: rule.maxItems ?? 100,
        itemValidator: rule.itemValidator,
      });
      if (!res.isValid) return { isValid: false, error: res.error, value: null };
      validated[key] = res.value;
    } else if (typeof rule.validator === 'function') {
      const res = rule.validator(rawVal);
      if (!res.isValid) return { isValid: false, error: res.error, value: null };
      validated[key] = res.value !== undefined ? res.value : rawVal;
    } else {
      validated[key] = rawVal;
    }
  }

  return { isValid: true, error: null, value: validated };
}

export { validateEmail };
