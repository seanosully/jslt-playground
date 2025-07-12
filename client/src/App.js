import React, { useState, useEffect, useRef } from 'react';
import { useCodeMirror } from '@uiw/react-codemirror';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { parseTree, findNodeAtOffset } from 'jsonc-parser';
import './App.css';

export default function App() {
  // Load initial state from localStorage or use defaults
  const [inputJson, setInputJson] = useState(() => {
    return localStorage.getItem('inputJson') ||
      '{\n  "data": { "fruit": { "cost": 12 } }\n}';
  });
  const [jslt, setJslt] = useState(() => {
    return localStorage.getItem('jslt') ||
      '{\n  "price": .data.fruit.cost\n}';
  });
  const [modules, setModules] = useState(() => {
    const saved = localStorage.getItem('jsltModules');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedModule, setSelectedModule] = useState(0);
  const [output, setOutput] = useState('');
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [modulesCollapsed, setModulesCollapsed] = useState(false);
  const lastGoodRef = useRef('');

  // Persist inputJson, jslt, and modules
  useEffect(() => { localStorage.setItem('inputJson', inputJson); }, [inputJson]);
  useEffect(() => { localStorage.setItem('jslt', jslt); }, [jslt]);
  useEffect(() => { localStorage.setItem('jsltModules', JSON.stringify(modules)); }, [modules]);

  // Initialize Input JSON editor
  const { view: inputView, setContainer: setInputContainer } = useCodeMirror({
    value: inputJson,
    extensions: [json(), keymap.of([indentWithTab])],
    onChange: setInputJson,
  });

  // Debounced transform + format output
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const payload = { inputJson, jslt, modules };
        const res = await fetch('/api/transform', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch {
          throw new Error('Invalid JSON response: ' + text);
        }
        if (!res.ok) throw new Error(body.error || 'Unknown error');
        let pretty = body.output;
        try { pretty = JSON.stringify(JSON.parse(body.output), null, 2); } catch {}
        setOutput(pretty);
        lastGoodRef.current = pretty;
        setError(null);
      } catch (e) {
        setError(e.message);
        setOutput(lastGoodRef.current);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [inputJson, jslt, modules]);

  // Beautify functions
  const beautifyInput = () => { try { setInputJson(JSON.stringify(JSON.parse(inputJson), null, 2)); } catch {} };
  const beautifyJslt = () => { try { setJslt(JSON.stringify(JSON.parse(jslt), null, 2)); } catch {} };
  const beautifyModule = idx => {
    try {
      const m = modules[idx];
      const parsed = JSON.parse(m.content);
      updateModule(idx, m.name, JSON.stringify(parsed, null, 2));
    } catch {};
  };

  // Module operations
  const addModule = () => {
    const newName = `module${modules.length + 1}.jslt`;
    setModules([...modules, { name: newName, content: '{}' }]);
    setSelectedModule(modules.length);
    setModulesCollapsed(false);
  };
  const updateModule = (idx, name, content) => {
    const newMods = modules.slice();
    newMods[idx] = { name, content };
    setModules(newMods);
  };
  const deleteModule = idx => {
    const newMods = modules.filter((_, i) => i !== idx);
    setModules(newMods);
    setSelectedModule(Math.max(0, selectedModule - 1));
  };

  // Upload .jslt file
  const handleModuleUpload = e => {
    const file = e.target.files[0];
    if (!file || !file.name.endsWith('.jslt')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      setModules(prev => [...prev, { name: file.name, content }]);
      setSelectedModule(modules.length);
      setModulesCollapsed(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // JSON hover tooltip logic
  const [tooltip, setTooltip] = useState(null);
  const onMouseMove = e => {
    if (!inputView) return setTooltip(null);
    const pos = inputView.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return setTooltip(null);
    const tree = parseTree(inputJson);
    if (!tree) return setTooltip(null);
    const node = findNodeAtOffset(tree, pos);
    if (!node) return setTooltip(null);
    const segs = [];
    let cur = node;
    while (cur.parent) {
      if (cur.parent.type === 'property') segs.unshift(cur.parent.children[0].value);
      cur = cur.parent;
    }
    const path = segs.length ? '.' + segs.join('.') : '';
    setTooltip({ path, x: e.clientX, y: e.clientY });
  };
  const onMouseLeave = () => setTooltip(null);
  const onContextMenu = e => {
    e.preventDefault();
    onMouseMove(e);
    tooltip && navigator.clipboard.writeText(tooltip.path);
  };
  const onCopyTooltip = () => tooltip && navigator.clipboard.writeText(tooltip.path);

  return (
    <div className="container">
      {!collapsed ? (
        <div className="paneContainer">
          <div className="label">
            Input JSON
            <div className="labelButtons">
              <button className="btn" onClick={beautifyInput}>Beautify</button>
              <button className="collapseBtn" onClick={() => setCollapsed(true)}>⏴</button>
            </div>
          </div>
          <div
            className="editor"
            ref={setInputContainer}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            onContextMenu={onContextMenu}
          />
        </div>
      ) : (
        <div className="collapseHandle" onClick={() => setCollapsed(false)}>▶ Input JSON</div>
      )}

      {!modulesCollapsed ? (
        <div className="paneContainer">
          <div className="label">
            JSLT Modules & Template
            <div className="labelButtons">
              <button className="btn" onClick={addModule}>Add Module</button>
              <input
                type="file"
                accept=".jslt"
                className="fileInput"
                onChange={handleModuleUpload}
              />
              <button className="collapseBtn" onClick={() => setModulesCollapsed(true)}>⏴</button>
            </div>
          </div>
          <div className="modules">
            <div className="moduleList">
              {modules.map((m, i) => (
                <div key={i} className={i === selectedModule ? 'moduleItem active' : 'moduleItem'}>
                  <input
                    value={m.name}
                    onChange={e => updateModule(i, e.target.value, m.content)}
                  />
                  <button onClick={() => deleteModule(i)}>✕</button>
                  <button onClick={() => beautifyModule(i)}>Beautify</button>
                  <button onClick={() => setSelectedModule(i)}>Edit</button>
                </div>
              ))}
            </div>
            {modules[selectedModule] && (
              <div className="editor moduleEditor">
                <CodeMirror
                  value={modules[selectedModule].content}
                  extensions={[javascript(), keymap.of([indentWithTab])]}
                  onChange={content => updateModule(selectedModule, modules[selectedModule].name, content)}
                />
              </div>
            )}
          </div>
          <div className="label">Main JSLT Template</div>
          <div className="editor">
            <CodeMirror
              value={jslt}
              extensions={[javascript(), keymap.of([indentWithTab])]}
              onChange={setJslt}
            />
          </div>
        </div>
      ) : (
        <div className="collapseHandle" onClick={() => setModulesCollapsed(false)}>▶ Modules</div>
      )}

      <div className="paneContainer outputPane">
        <div className="label">Output JSON</div>
        <pre className="output">{output}</pre>
        {error && <div className="errorBox">Error: {error}</div>}
      </div>

      {tooltip && (
        <div
          className="pathTooltip"
          style={{ top: tooltip.y - 28, left: tooltip.x + 8 }}
          onClick={onCopyTooltip}
        >
          {tooltip.path}
        </div>
      )}
    </div>
  );
}
