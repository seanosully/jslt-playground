import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { parseTree, findNodeAtOffset } from 'jsonc-parser';
import { createZip } from './zip';
import './App.css';
import ModulesPage from './ModulesPage';

export default function App() {
  // Projects handling -----------------------------------------------------
  const loadProjects = () => {
    const saved = localStorage.getItem('projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // migrate old format with single inputJson
        parsed.forEach(p => {
          if (!p.inputs) {
            p.inputs = [{ name: 'input.json', content: p.inputJson || '{}' }];
            p.selectedInput = 'input.json';
            delete p.inputJson;
          }
        });
        return parsed;
      } catch {
        /* ignore */
      }
    }
    const id = 'proj-' + Date.now();
    return [{
      id,
      name: 'Default',
      inputs: [{ name: 'input.json', content: '{\n  "data": { "fruit": { "cost": 12 } }\n}' }],
      selectedInput: 'input.json',
      modules: [{ type: 'file', name: 'default.jslt', content: '{\n  "price": .data.fruit.cost\n}' }],
      selectedTemplate: 'default.jslt'
    }];
  };

  const [projects, setProjects] = useState(loadProjects);
  const [activeId, setActiveId] = useState(() => {
    return localStorage.getItem('activeProjectId') || projects[0].id;
  });

  const [inputs, setInputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
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
  const folderInputRef = useRef(null);
  const pendingImportName = useRef('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Load project data when active project changes
  useEffect(() => {
    const proj = projects.find(p => p.id === activeId);
    if (!proj) return;
    setInputs(proj.inputs || []);
    const inputName =
      proj.selectedInput ||
      ((proj.inputs && proj.inputs[0]) ? proj.inputs[0].name : '');
    setSelectedInput(inputName);
    const inp = (proj.inputs || []).find(i => i.name === inputName);
    setInputJson(inp ? inp.content : '');
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
      if (
        JSON.stringify(p.inputs) === JSON.stringify(inputs) &&
        p.selectedInput === selectedInput &&
        p.selectedTemplate === selectedTemplate &&
        JSON.stringify(p.modules) === JSON.stringify(modules)
      ) {
        return p;
      }
      return { ...p, inputs, selectedInput, modules, selectedTemplate };
    }));
  }, [inputs, selectedInput, modules, selectedTemplate, activeId]);

  // Persist projects and active project id
  useEffect(() => { localStorage.setItem('projects', JSON.stringify(projects)); }, [projects]);
  useEffect(() => { localStorage.setItem('activeProjectId', activeId); }, [activeId]);

  // Initialize Input JSON editor
  const inputEditorRef = useRef(null);
  const onInputChange = value => {
    const val = value ?? '';
    setInputJson(val);
    setInputs(prev => prev.map(i =>
      i.name === selectedInput ? { ...i, content: val } : i
    ));
  };

  // keep input editor in sync with selected input
  useEffect(() => {
    const inp = inputs.find(i => i.name === selectedInput);
    if (inp && inp.content !== inputJson) setInputJson(inp.content);
    if (!inp && inputs[0]) setSelectedInput(inputs[0].name);
  }, [inputs, selectedInput]);

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
  const beautifyInput = () => {
    try {
      const pretty = JSON.stringify(JSON.parse(inputJson), null, 2);
      setInputJson(pretty);
      setInputs(prev => prev.map(i =>
        i.name === selectedInput ? { ...i, content: pretty } : i
      ));
    } catch {}
  };

  const addInput = () => {
    const name = prompt('New input file name');
    if (!name) return;
    const fileName = name.endsWith('.json') ? name : name + '.json';
    setInputs([...inputs, { name: fileName, content: '{}' }]);
    setSelectedInput(fileName);
    setInputJson('{}');
  };

  const deleteInput = () => {
    if (!window.confirm(`Delete ${selectedInput}?`)) return;
    setInputs(prev => {
      const filtered = prev.filter(i => i.name !== selectedInput);
      if (filtered.length === 0) {
        const def = { name: 'input.json', content: '{}' };
        setSelectedInput(def.name);
        setInputJson(def.content);
        return [def];
      }
      const next = filtered[0];
      setSelectedInput(next.name);
      setInputJson(next.content);
      return filtered;
    });
  };

  const exportProject = () => {
    const proj = projects.find(p => p.id === activeId);
    if (!proj) return;
    const files = [{ name: `${proj.name}/`, data: '' }];
    (proj.inputs || []).forEach(i => {
      files.push({ name: `${proj.name}/inputs/${i.name}`, data: i.content });
    });
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
        return [{
          id,
          name: 'Default',
          inputs: [{ name: 'input.json', content: '{}' }],
          selectedInput: 'input.json',
          modules: [],
          selectedTemplate: ''
        }];
      }
      if (!filtered.find(p => p.id === activeId)) {
        setActiveId(filtered[0].id);
      }
      return filtered;
    });
  };

  const createProjectFromScratch = name => {
    if (!name) return;
    const id = 'proj-' + Date.now();
    setProjects([...projects, {
      id,
      name,
      inputs: [{ name: 'input.json', content: '{}' }],
      selectedInput: 'input.json',
      modules: [{ type: 'file', name: 'default.jslt', content: '' }],
      selectedTemplate: 'default.jslt'
    }]);
    setActiveId(id);
  };

  const handleImportFolder = e => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.jslt'));
    if (files.length === 0) { e.target.value = ''; return; }
    const name = pendingImportName.current || 'Imported Project';
    pendingImportName.current = '';
    const id = 'proj-' + Date.now();
    const mods = [];
    let loaded = 0;
    const finalize = () => {
      mods.sort((a, b) => a.name.localeCompare(b.name));
      const main = mods[0] ? mods[0].name : '';
      setProjects(prev => [...prev, {
        id,
        name,
        inputs: [{ name: 'input.json', content: '{}' }],
        selectedInput: 'input.json',
        modules: mods,
        selectedTemplate: main
      }]);
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
  };

  const handleCreateNewProject = () => {
    setNewProjectName('');
    setShowCreateModal(true);
  };

  const handleProjectChange = e => {
    const val = e.target.value;
    if (val === '__new__') {
      e.target.value = activeId;
      handleCreateNewProject();
      return;
    }
    setActiveId(val);
  };

  // JSON hover tooltip logic
  const [tooltip, setTooltip] = useState(null);
  const timeoutRef = useRef(null);
  const getOffsetAtCoords = (x, y) => {
    if (!inputEditorRef.current) return null;
    const target = inputEditorRef.current.getTargetAtClientPoint(x, y);
    if (!target || !target.range) return null;
    return inputEditorRef.current.getModel().getOffsetAt(target.range.getStartPosition());
  };
  const onMouseMove = e => {
    const pos = getOffsetAtCoords(e.clientX, e.clientY);
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
    const pos = getOffsetAtCoords(e.clientX, e.clientY);
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
    navigator.clipboard.writeText(path).catch(err => {
      // clipboard API may fail without permissions
      console.warn('Failed to copy', err);
    });
    setTooltip({ path, x: e.clientX, y: e.clientY, copied: true });
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setTooltip(t => t && { ...t, copied: false });
    }, 2000);
  };
  const onCopyTooltip = () => {
    if (!tooltip) return;
    navigator.clipboard.writeText(tooltip.path).catch(err => {
      console.warn('Failed to copy', err);
    });
  };

  if (view === 'modules') {
    return <ModulesPage modules={modules} setModules={setModules} onBack={() => setView('main')} />;
  }

  return (
    <div className="root">
      <div className="topBar">
        <div className="projectSelect">
          <label>
            Select Project:
            <select value={activeId} onChange={e => handleProjectChange(e)}>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value="__new__">Create New Project...</option>
            </select>
          </label>
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            className="fileInput"
            style={{ display: 'none' }}
            onChange={handleImportFolder}
          />
        </div>
        <div className="topBarRight">
          <button className="btn" onClick={exportProject}>Export</button>
          <button className="btn" onClick={deleteProject}>Delete Project</button>
          <button className="btn" onClick={() => setView('modules')}>Go to Modules</button>
        </div>
      </div>
      <div className="container">
        {!inputCollapsed && (!fullScreen || fullScreen === 'input') && (
          <div className="paneContainer">
            <div className="label">
              <div>
                Input JSON
                <div className="copyHint">Right-click on json field to copy JSLT path</div>
              </div>
              <div className="labelButtons">
                <select value={selectedInput} onChange={e => setSelectedInput(e.target.value)}>
                  {inputs.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                </select>
                <button className="btn" onClick={addInput}>New</button>
                <button className="btn" onClick={deleteInput}>Delete</button>
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
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}
              onContextMenu={onContextMenu}
            >
              <Editor
                height="100%"
                language="json"
                value={inputJson}
                onMount={(editor) => { inputEditorRef.current = editor; }}
                onChange={onInputChange}
              />
            </div>
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
              <Editor
                height="100%"
                language="javascript"
                value={jslt}
                onChange={value => {
                  const val = value ?? '';
                  setJslt(val);
                  setModules(prev => prev.map(m =>
                    m.name === selectedTemplate && (m.type || 'file') !== 'folder'
                      ? { ...m, content: val }
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
      {showCreateModal && (
        <div className="modalOverlay">
          <div className="modalContent">
            <h3>Create New Project</h3>
            <input
              type="text"
              placeholder="Project name"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
            />
            <div className="modalButtons">
              <button
                className="btn"
                onClick={() => {
                  createProjectFromScratch(newProjectName.trim() || 'Untitled');
                  setShowCreateModal(false);
                }}
              >
                Start from Scratch
              </button>
              <button
                className="btn"
                onClick={() => {
                  pendingImportName.current = newProjectName.trim() || 'Imported Project';
                  setShowCreateModal(false);
                  if (folderInputRef.current) {
                    folderInputRef.current.value = '';
                    folderInputRef.current.click();
                  }
                }}
              >
                Import from Folder
              </button>
              <button className="btn" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
