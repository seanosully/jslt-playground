import React, { useState, useEffect, useRef } from 'react';
import { useCodeMirror } from '@uiw/react-codemirror';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { parseTree, findNodeAtOffset } from 'jsonc-parser';
import './App.css';
import ModulesPage from './ModulesPage';

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
    if (saved) {
      try {
        return JSON.parse(saved).map(m => m.type ? m : { ...m, type: 'file' });
      } catch {
        return [];
      }
    }
    return [];
  });
  const [output, setOutput] = useState('');
  const [error, setError] = useState(null);
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [templateCollapsed, setTemplateCollapsed] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [fullScreen, setFullScreen] = useState(null);
  const [view, setView] = useState('main');
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
        const payload = { inputJson, jslt, modules: modules.filter(m => (m.type || 'file') !== 'folder') };
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

  if (view === 'modules') {
    return <ModulesPage modules={modules} setModules={setModules} onBack={() => setView('main')} />;
  }

  return (
    <div className="root">
      <div className="topBar">
        <button className="btn" onClick={() => setView('modules')}>Modules</button>
      </div>
      <div className="container">
        {!inputCollapsed && (!fullScreen || fullScreen === 'input') && (
          <div className="paneContainer">
            <div className="label">
              Input JSON
              <div className="labelButtons">
                <button className="btn" onClick={beautifyInput}>Beautify</button>
                <button className="btn" onClick={() => setFullScreen(fullScreen === 'input' ? null : 'input')}>{fullScreen === 'input' ? 'Exit' : 'Expand'}</button>
                <button className="collapseBtn" onClick={() => setInputCollapsed(true)}>⏴</button>
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
        )}
        {inputCollapsed && !fullScreen && (
          <div className="collapseHandle" onClick={() => setInputCollapsed(false)}>▶ Input JSON</div>
        )}

        {!templateCollapsed && (!fullScreen || fullScreen === 'template') && (
          <div className="paneContainer">
            <div className="label">
              JSLT Template
              <div className="labelButtons">
                <button className="btn" onClick={beautifyJslt}>Beautify</button>
                <button className="btn" onClick={() => setFullScreen(fullScreen === 'template' ? null : 'template')}>{fullScreen === 'template' ? 'Exit' : 'Expand'}</button>
                <button className="collapseBtn" onClick={() => setTemplateCollapsed(true)}>⏴</button>
              </div>
            </div>
            <div className="editor">
              <CodeMirror
                value={jslt}
                extensions={[javascript(), keymap.of([indentWithTab])]}
                onChange={setJslt}
              />
            </div>
          </div>
        )}
        {templateCollapsed && !fullScreen && (
          <div className="collapseHandle" onClick={() => setTemplateCollapsed(false)}>▶ Template</div>
        )}

        {!outputCollapsed && (!fullScreen || fullScreen === 'output') && (
          <div className="paneContainer outputPane">
            <div className="label">
              Output JSON
              <div className="labelButtons">
                <button className="btn" onClick={() => setFullScreen(fullScreen === 'output' ? null : 'output')}>{fullScreen === 'output' ? 'Exit' : 'Expand'}</button>
                <button className="collapseBtn" onClick={() => setOutputCollapsed(true)}>⏴</button>
              </div>
            </div>
            <pre className="output">{output}</pre>
            {error && <div className="errorBox">Error: {error}</div>}
          </div>
        )}
        {outputCollapsed && !fullScreen && (
          <div className="collapseHandle" onClick={() => setOutputCollapsed(false)}>▶ Output</div>
        )}

        {tooltip && !fullScreen && (
          <div
            className="pathTooltip"
            style={{ top: tooltip.y - 28, left: tooltip.x + 8 }}
            onClick={onCopyTooltip}
          >
            {tooltip.path}
          </div>
        )}
      </div>
    </div>
  );
}
