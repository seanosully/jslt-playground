import path from 'path';

export function validateModuleName(name) {
  const normalized = path.normalize(name);
  return !path.isAbsolute(name) && !normalized.split(path.sep).includes('..');
}
