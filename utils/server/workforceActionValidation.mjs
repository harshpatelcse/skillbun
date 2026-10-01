import { validateFirestoreId, validateSchema, validateString } from './inputValidator.js';

export function validateWorkforceCredentials(value) {
  return validateSchema(value, {
    work_email: { type: 'email', required: true },
    // Password whitespace is significant and must survive encrypted storage.
    password: { required: true, validator: password => validateString(password, { fieldName: 'Password', minLength: 1, maxLength: 512, trim: false }) },
    access_notes: { type: 'string', maxLength: 1000, allowEmpty: true },
  }, { fieldName: 'credentials_data', allowUnknown: false, maxKeys: 3 });
}

const booleanField = defaultValue => ({
  defaultValue,
  strictBoolean: true,
  validator: value => ({ isValid: typeof value === 'boolean', value, error: 'Action options must be explicit booleans.' }),
});
const employeeId = { required: true, validator: value => validateFirestoreId(value, { fieldName: 'employeeId' }) };
const credentials = { validator: validateWorkforceCredentials };
const schemas = {
  offer: { employeeId, credentials_data: credentials },
  activate: { employeeId, credentials_data: credentials, skipEmail: booleanField(false) },
  extension: {
    employeeId,
    new_contract_end_date: { type: 'string', maxLength: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ },
    original_reference_id: { type: 'string', maxLength: 128 },
  },
  terminate: {
    employeeId,
    reasonCode: { type: 'enum', allowedValues: ['COMPLETED', 'ACADEMIC_LEAVE', 'VOLUNTARY_RESIGNATION', 'MUTUAL_SEPARATION', 'PERFORMANCE_FIT', 'POLICY_DISCONTINUATION', 'CUSTOM'], defaultValue: 'COMPLETED' },
    reason: { type: 'string', maxLength: 2000, defaultValue: '' },
    grantInternshipCert: booleanField(false), grantTrainingCert: booleanField(false), grantLor: booleanField(false),
    revokeAccess: booleanField(true), sendEmail: booleanField(true),
  },
};

export function validateWorkforceAction(payload, action) {
  const schema = schemas[action];
  if (!schema) return { isValid: false, error: 'Unknown workforce action.' };
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    for (const [key, rule] of Object.entries(schema)) {
      if (rule.strictBoolean && Object.hasOwn(payload, key) && typeof payload[key] !== 'boolean') {
        return { isValid: false, error: `${key} must be an explicit boolean.` };
      }
    }
  }
  return validateSchema(payload, schema, { fieldName: 'Workforce action', allowUnknown: false });
}
