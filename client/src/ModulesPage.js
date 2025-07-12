import React, { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import './App.css';

export default function ModulesPage({ modules, setModules, onBack }) {
  const [open, setOpen] = useState(() => modules.map(() => false));

  useEffect(() => {
    setOpen(prev => {
      const diff = modules.length - prev.length;
      if (diff > 0) return [...prev, ...Array(diff).fill(false)];
      if (diff < 0) return prev.slice(0, modules.length);
      return prev;
    });
  }, [modules]);

  const addModule = () => {
    const newName = `module${modules.length + 1}.jslt`;
    setModules([...modules, { name: newName, content: '{}' }]);
    setOpen(prev => [...prev, false]);
  };

  const updateModule = (idx, name, content) => {
    const newMods = modules.slice();
    newMods[idx] = { name, content };
    setModules(newMods);
  };

  const deleteModule = idx => {
    const newMods = modules.filter((_, i) => i !== idx);
    setModules(newMods);
    setOpen(o => o.filter((_, i) => i !== idx));
  };

  const beautifyModule = idx => {
    try {
      const m = modules[idx];
      const parsed = JSON.parse(m.content);
      updateModule(idx, m.name, JSON.stringify(parsed, null, 2));
    } catch {}
  };

  const handleModuleUpload = e => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.jslt'));
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result;
        setModules(prev => [...prev, { name: file.name, content }]);
        setOpen(prev => [...prev, false]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const handleFolderUpload = e => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.jslt'));
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result;
        const name = file.webkitRelativePath || file.name;
        setModules(prev => [...prev, { name, content }]);
        setOpen(prev => [...prev, false]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  return (
    <div className="container column">
      <div className="label">
        Modules
        <div className="labelButtons">
          <button className="btn" onClick={addModule}>Add Module</button>
          <input type="file" accept=".jslt" multiple className="fileInput" onChange={handleModuleUpload} />
          <input type="file" webkitdirectory="" directory="" multiple className="fileInput" onChange={handleFolderUpload} />
          <button className="btn" onClick={onBack}>Back</button>
        </div>
      </div>
      <div className="modules">
        {modules.map((m, i) => (
          <div key={i} className="moduleBlock">
            <div className="moduleHeader">
              <input
                value={m.name}
                onChange={e => updateModule(i, e.target.value, m.content)}
              />
              <div className="labelButtons">
                <button className="btn" onClick={() => beautifyModule(i)}>Beautify</button>
                <button className="btn" onClick={() => setOpen(o => o.map((v, j) => j === i ? !v : v))}>
                  {open[i] ? 'Collapse' : 'Expand'}
                </button>
                <button className="btn" onClick={() => deleteModule(i)}>✕</button>
              </div>
            </div>
            {open[i] && (
              <div className="editor moduleEditor">
                <CodeMirror
                  value={m.content}
                  extensions={[javascript(), keymap.of([indentWithTab])]}
                  onChange={content => updateModule(i, m.name, content)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
