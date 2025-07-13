import React, { useState, useEffect, useRef } from 'react';
import { useCodeMirror } from '@uiw/react-codemirror';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { parseTree, findNodeAtOffset } from 'jsonc-parser';
import { createZip } from './zip';
import './App.css';
import ModulesPage from './ModulesPage';

export default function App() {
  // Projects handling -----------------------------------------------------
  const loadProjects = () => {
    const saved = localStorage.getItem('projects');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    const id = 'proj-' + Date.now();
    return [{
      id,
      name: 'Default',
      inputJson: '{\n  "data": { "fruit": { "cost": 12 } }\n}',
      modules: [{ type: 'file', name: 'main.jslt', content: '{\n  "price": .data.fruit.cost\n}' }],
      selectedTemplate: 'main.jslt'
    }];
  };

  const [projects, setProjects] = useState(loadProjects);
  const [activeId, setActiveId] = useState(() => {
    return localStorage.getItem('activeProjectId') || projects[0].id;
  });

  const [inputJson, setInputJson] = useState('');
  const [modules, setModules] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [jslt, setJslt] = useState('');

  const [output, setOutput] = useState('');
  const [error, setError] = useState(null);
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [templateCollapsed, setTemplateCollapsed] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [fullScreen, setFullScreen] = useState(null);
  const [view, setView] = useState('main');
  const lastGoodRef = useRef('');

  // Load project data when active project changes
  useEffect(() => {
    const proj = projects.find(p => p.id === activeId);
    if (!proj) return;
    setInputJson(proj.inputJson || '');
    setModules(proj.modules || []);
    const main =
      proj.selectedTemplate ||
      (proj.modules.find(m => (m.type || 'file') !== 'folder') || {}).name || '';
    setSelectedTemplate(main);
    const mod = proj.modules.find(
      m => m.name === main && (m.type || 'file') !== 'folder'
    );
    setJslt(mod ? mod.content : '');
  }, [activeId]);

  // keep jslt editor in sync with selected template
  useEffect(() => {
    const mod = modules.find(m => m.name === selectedTemplate && (m.type || 'file') !== 'folder');
    if (mod && mod.content !== jslt) setJslt(mod.content);
    if (!mod) {
      const first = modules.find(m => (m.type || 'file') !== 'folder');
      setSelectedTemplate(first ? first.name : '');
    }
  }, [modules, selectedTemplate]);

  // Update active project when state changes
  useEffect(() => {
    setProjects(prev => prev.map(p => {
      if (p.id !== activeId) return p;
      if (p.inputJson === inputJson && p.selectedTemplate === selectedTemplate && JSON.stringify(p.modules) === JSON.stringify(modules)) {
        return p;
      }
      return { ...p, inputJson, modules, selectedTemplate };
    }));
  }, [inputJson, modules, selectedTemplate, activeId]);

  // Persist projects and active project id
  useEffect(() => { localStorage.setItem('projects', JSON.stringify(projects)); }, [projects]);
  useEffect(() => { localStorage.setItem('activeProjectId', activeId); }, [activeId]);

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

  const exportProject = () => {
    const proj = projects.find(p => p.id === activeId);
    if (!proj) return;
    const files = [{ name: `${proj.name}/`, data: '' }];
    proj.modules.forEach(m => {
      files.push({
        name: `${proj.name}/${m.name}`,
        data: (m.type || 'file') === 'file' ? m.content : ''
      });
    });
    const blob = createZip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name || 'project'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteProject = () => {
    if (!window.confirm('Delete current project?')) return;
    setProjects(prev => {
      const filtered = prev.filter(p => p.id !== activeId);
      if (filtered.length === 0) {
        const id = 'proj-' + Date.now();
        setActiveId(id);
        return [{ id, name: 'Default', inputJson: '{}', modules: [], selectedTemplate: '' }];
      }
      if (!filtered.find(p => p.id === activeId)) {
        setActiveId(filtered[0].id);
      }
      return filtered;
    });
  };

  // JSON hover tooltip logic
  const [tooltip, setTooltip] = useState(null);
  const timeoutRef = useRef(null);
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
    while (cur && cur.parent) {
      if (cur.parent.type === 'property') {
        segs.unshift('.' + cur.parent.children[0].value);
        cur = cur.parent.parent;
        continue;
      }
      if (cur.parent.type === 'array') {
        const idx = cur.parent.children.indexOf(cur);
        segs.unshift(`[${idx}]`);
      }
      cur = cur.parent;
    }
    let path = segs.join('');
    if (!path.startsWith('.')) path = '.' + path;
    setTooltip({ path, x: e.clientX, y: e.clientY });
  };
  const onMouseLeave = () => setTooltip(null);
  const onContextMenu = e => {
    e.preventDefault();
    if (!inputView) return;
    const pos = inputView.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;
    const tree = parseTree(inputJson);
    if (!tree) return;
    const node = findNodeAtOffset(tree, pos);
    if (!node) return;
    const segs = [];
    let cur = node;
    while (cur && cur.parent) {
      if (cur.parent.type === 'property') {
        segs.unshift('.' + cur.parent.children[0].value);
        cur = cur.parent.parent;
        continue;
      }
      if (cur.parent.type === 'array') {
        const idx = cur.parent.children.indexOf(cur);
        segs.unshift(`[${idx}]`);
      }
      cur = cur.parent;
    }
    let path = segs.join('');
    if (!path.startsWith('.')) path = '.' + path;
    navigator.clipboard.writeText(path);
    setTooltip({ path, x: e.clientX, y: e.clientY, copied: true });
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setTooltip(t => t && { ...t, copied: false });
    }, 2000);
  };
  const onCopyTooltip = () => tooltip && navigator.clipboard.writeText(tooltip.path);

  if (view === 'modules') {
    return <ModulesPage modules={modules} setModules={setModules} onBack={() => setView('main')} />;
  }

  return (
    <div className="root">
      <div className="topBar">
        <div className="copyHint">Right-click on json field to copy JSLT path</div>
        <div className="topBarRight">
          <select value={activeId} onChange={e => setActiveId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn" onClick={() => {
            const name = prompt('Project name');
            if (!name) return;
            const id = 'proj-' + Date.now();
            setProjects([...projects, { id, name, inputJson: '{}', modules: [], selectedTemplate: '' }]);
            setActiveId(id);
          }}>New From Scratch</button>
          <label className="btn fileUpload">
            New From Folder
            <input type="file" webkitdirectory="" directory="" multiple className="fileInput" onChange={e => {
              const files = Array.from(e.target.files).filter(f => f.name.endsWith('.jslt'));
              if (files.length === 0) { e.target.value=''; return; }
              const name = prompt('Project name');
              if (!name) { e.target.value=''; return; }
              const id = 'proj-' + Date.now();
              const mods = [];
              let loaded = 0;
              const finalize = () => {
                mods.sort((a,b)=>a.name.localeCompare(b.name));
                const main = mods[0] ? mods[0].name : '';
                setProjects(prev => [...prev, { id, name, inputJson: '{}', modules: mods, selectedTemplate: main }]);
                setActiveId(id);
              };
              if (files.length === 0) finalize();
              files.forEach(file => {
                const reader = new FileReader();
                reader.onload = () => {
                  mods.push({ type: 'file', name: file.webkitRelativePath || file.name, content: reader.result });
                  loaded++; if (loaded === files.length) finalize();
                };
                reader.readAsText(file);
              });
              e.target.value = '';
            }} />
          </label>
          <button className="btn" onClick={exportProject}>Export</button>
          <button className="btn" onClick={deleteProject}>Delete</button>
          <button className="btn" onClick={() => setView('modules')}>Modules</button>
        </div>
      </div>
      <div className="container">
        {!inputCollapsed && (!fullScreen || fullScreen === 'input') && (
          <div className="paneContainer">
            <div className="label">
              Input JSON
              <div className="labelButtons">
                <button className="btn" onClick={beautifyInput}>Beautify</button>
                <button className="btn" onClick={() => setFullScreen(fullScreen === 'input' ? null : 'input')}>{fullScreen === 'input' ? 'Exit' : 'Expand'}</button>
                <button
                  className="collapseBtn"
                  onClick={() => {
                    setFullScreen(null);
                    setInputCollapsed(true);
                  }}
                >
                  ⏴
                </button>
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
                <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                  {modules.filter(m => (m.type || 'file') !== 'folder').map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <button className="btn" onClick={() => setFullScreen(fullScreen === 'template' ? null : 'template')}>{fullScreen === 'template' ? 'Exit' : 'Expand'}</button>
                <button
                  className="collapseBtn"
                  onClick={() => {
                    setFullScreen(null);
                    setTemplateCollapsed(true);
                  }}
                >
                  ⏴
                </button>
              </div>
            </div>
            <div className="editor">
              <CodeMirror
                value={jslt}
                extensions={[javascript(), keymap.of([indentWithTab])]}
                onChange={value => {
                  setJslt(value);
                  setModules(prev => prev.map(m =>
                    m.name === selectedTemplate && (m.type || 'file') !== 'folder'
                      ? { ...m, content: value }
                      : m
                  ));
                }}
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
                <button
                  className="collapseBtn"
                  onClick={() => {
                    setFullScreen(null);
                    setOutputCollapsed(true);
                  }}
                >
                  ⏴
                </button>
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
            {tooltip.copied ? 'copied' : tooltip.path}
          </div>
        )}
      </div>
    </div>
  );
}
