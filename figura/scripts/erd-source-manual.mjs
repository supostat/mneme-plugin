import { readFileSync } from 'node:fs';
import { FiguraError } from './figura-error.mjs';

const FORMAT_REMEDY = 'write the schema in the format of figura/reference/erd-manual.json';

export function readManualSchema(schemaPath) {
  let text;
  try {
    text = readFileSync(schemaPath, 'utf8');
  } catch (cause) {
    throw new FiguraError('ERD-INVALID', `cannot read ${schemaPath}: ${cause.message}`, FORMAT_REMEDY);
  }
  try {
    return { schema: JSON.parse(text), warnings: [] };
  } catch (cause) {
    throw new FiguraError('ERD-INVALID', `${schemaPath} is not valid JSON: ${cause.message}`, FORMAT_REMEDY);
  }
}
