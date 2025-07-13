import assert from 'assert';
import { validateModuleName } from '../validate.js';

assert.strictEqual(validateModuleName('foo/bar.jslt'), true);
assert.strictEqual(validateModuleName('../evil.jslt'), false);
assert.strictEqual(validateModuleName('/abs/path.jslt'), false);

console.log('Test passed');
