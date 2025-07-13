// server/index.js
import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateModuleName } from './validate.js';

// ─── Shim __dirname in ESM ─────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());

app.post('/api/transform', async (req, res) => {
  const { inputJson, jslt, modules = [] } = req.body;

  // 1) Create a temp workspace
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jslt-'));

  // 2) Write main template and input
  fs.writeFileSync(path.join(tmpDir, 'script.jslt'), jslt);
  fs.writeFileSync(path.join(tmpDir, 'input.json'), inputJson);

  // 3) Write each user module under tmpDir
  for (let mod of modules) {
    if (!validateModuleName(mod.name)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res.status(400).json({ error: 'Invalid module path' });
    }

    const target = path.join(tmpDir, path.normalize(mod.name));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, mod.content);
  }

  // 4) Spawn JSLT CLI with tmpDir on the classpath
  const jarPath = path.join(__dirname, 'jslt-cli.jar');
  const java = spawn('java', [
    '-cp',
    `${jarPath}${path.delimiter}${tmpDir}`,
    'com.schibsted.spt.data.jslt.cli.JSLT',
    'script.jslt',
    'input.json'
  ], { cwd: tmpDir });

  let stdout = '', stderr = '';
  java.stdout.on('data', d => stdout += d.toString());
  java.stderr.on('data', d => stderr += d.toString());

  java.on('close', code => {
    // cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (code !== 0) {
      return res.status(500).json({ error: stderr || 'Transformation failed' });
    }
    res.json({ output: stdout });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`JSLT server listening on port ${PORT}`);
});
