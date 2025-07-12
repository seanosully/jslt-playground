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
  // Shared state
  const [inputJson, setInputJson] = useState(() =>
    localStorage.getItem('inputJson') || '{\n  "data": { "fruit": { "cost": 12 } }\n}'
  );
  const [jslt, setJslt] = useState(() =>
    localStorage.getItem('jslt') || '{\n  "price": .data.fruit.cost\n}'
  );
  const [modules, setModules] = useState(() => {
    const saved = localStorage.getItem('jsltModules');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedModule, setSelectedModule] = useState(0);
  const [modulesCollapsed, setModulesCollapsed] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState(null);
  const lastGoodRef = useRef('');

  // Persist state
  useEffect(() => { localStorage.setItem('inputJson', inputJson); }, [inputJson]);
  useEffect(() => { localStorage.setItem('jslt', jslt); }, [jslt]);
  useEffect(() => { localStorage.setItem('jsltModules', JSON.stringify(modules)); }, [modules]);

  // Input JSON editor
  const { view: inputView, setContainer: setInputContainer } = useCodeMirror({
    value: inputJson,
    extensions: [json(), keymap.of([indentWithTab])],
    onChange: setInputJson,
  });

  // Transform logic
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/transform', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputJson, jslt, modules })
        });
        const text = await res.text();
        const body = JSON.parse(text);
        if (!res.ok) throw new Error(body.error || 'Unknown');
        let pretty = body.output;
        try { pretty = JSON.stringify(JSON.parse(pretty), null, 2); } catch {}
        setOutput(pretty);
        lastGoodRef.current = pretty;
        setError(null);
      } catch (e) {
        setError(e.message);
        setOutput(lastGoodRef.current);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [inputJson, jslt, modules]);

  // Beautify
  const beautifyInput = () => { try { setInputJson(JSON.stringify(JSON.parse(inputJson), null, 2)); } catch {} };
  const beautifyJslt = () => { try { setJslt(JSON.stringify(JSON.parse(jslt), null, 2)); } catch {} };

  // Module operations
  const addModule = () => {
    const name = `module${modules.length + 1}.jslt`;
    setModules([...modules, { name, content: '{}' }]);
    setSelectedModule(modules.length);
    setModulesCollapsed(false);
  };
  const updateModule = (i, name, content) => {
    const arr = [...modules]; arr[i] = { name, content }; setModules(arr);
  };
  const deleteModule = i => {
    const arr = modules.filter((_, idx) => idx !== i);
    setModules(arr);
    setSelectedModule(Math.max(0, selectedModule - 1));
  };
  const handleUpload = e => {
    const f = e.target.files[0]; if (!f?.name.endsWith('.jslt')) return;
    const r = new FileReader();
    r.onload = () => {
      setModules(prev => [...prev, { name: f.name, content: r.result }]);
      setSelectedModule(modules.length);
      setModulesCollapsed(false);
    };
    r.readAsText(f);
    e.target.value = '';
  };

  // Tooltip
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
    setTooltip({ path: segs.length ? '.' + segs.join('.') : '', x: e.clientX, y: e.clientY });
  };
  const onMouseLeave = () => setTooltip(null);

  return (
    <div className="container">
      <div className="mainView">
        {/* Column 1: Input JSON */}
        <div className="column">
          <div className="label">
            Input JSON
            <button className="btn" onClick={beautifyInput}>Beautify</button>
          </div>
          <div className="editor" ref={setInputContainer} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} />
        </div>

        {/* Column 2: Modules + Main JSLT */}
        <div className="column">
          <div className="label">
            JSLT Modules & Template
            <div className="labelButtons">
              <button className="btn" onClick={addModule}>Add Module</button>
              <input type="file" accept=".jslt" onChange={handleUpload} />
              <button className="btn" onClick={()=>setModulesCollapsed(!modulesCollapsed)}>
                {modulesCollapsed? 'Show Modules':'Hide Modules'}
              </button>
            </div>
          </div>
          {!modulesCollapsed && (
            <div className="modulesSection">
              <div className="modulesList">
                {modules.map((m,i)=>(
                  <div key={i} className={i===selectedModule?'moduleItem active':'moduleItem'}>
                    <input value={m.name} onChange={e=>updateModule(i,e.target.value,m.content)}/>
                    <button onClick={()=>deleteModule(i)}>✕</button>
                    <button onClick={()=>beautifyModule(i)}>Beautify</button>
                    <button onClick={()=>setSelectedModule(i)}>Edit</button>
                  </div>
                ))}
              </div>
              {modules[selectedModule] && (
                <div className="editor moduleEditor">
                  <CodeMirror
                    value={modules[selectedModule].content}
                    extensions={[javascript(), keymap.of([indentWithTab])]} 
                    onChange={c=>updateModule(selectedModule,modules[selectedModule].name,c)}
                  />
                </div>
              )}
            </div>
          )}
          <div className="label">
            Main JSLT Template
            <button className="btn" onClick={beautifyJslt}>Beautify</button>
          </div>
          <div className="editor">
            <CodeMirror
              value={jslt}
              extensions={[javascript(), keymap.of([indentWithTab])]}
              onChange={setJslt}
            />
          </div>
        </div>

        {/* Column 3: Output JSON */}
        <div className="column outputPane">
          <div className="label">Output JSON</div>
          <pre className="output">{output}</pre>
          {error && <div className="errorBox">Error: {error}</div>}
        </div>
      </div>

      {tooltip && (
        <div className="pathTooltip" style={{top:tooltip.y-28,left:tooltip.x+8}}>{tooltip.path}</div>
      )}
    </div>
  );
}
