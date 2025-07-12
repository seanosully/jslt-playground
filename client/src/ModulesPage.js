import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import './App.css';

export default function ModulesPage({ modules, setModules, onBack }) {
  const [selectedModule, setSelectedModule] = useState(0);

  const addModule = () => {
    const newName = `module${modules.length + 1}.jslt`;
    setModules([...modules, { name: newName, content: '{}' }]);
    setSelectedModule(modules.length);
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

  const beautifyModule = idx => {
    try {
      const m = modules[idx];
      const parsed = JSON.parse(m.content);
      updateModule(idx, m.name, JSON.stringify(parsed, null, 2));
    } catch {}
  };

  const handleModuleUpload = e => {
    const file = e.target.files[0];
    if (!file || !file.name.endsWith('.jslt')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      setModules(prev => [...prev, { name: file.name, content }]);
      setSelectedModule(modules.length);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="container column">
      <div className="label">
        Modules
        <div className="labelButtons">
          <button className="btn" onClick={addModule}>Add Module</button>
          <input type="file" accept=".jslt" className="fileInput" onChange={handleModuleUpload} />
          <button className="btn" onClick={onBack}>Back</button>
        </div>
      </div>
      <div className="modules">
        <div className="moduleList">
          {modules.map((m, i) => (
            <div key={i} className={i === selectedModule ? 'moduleItem active' : 'moduleItem'}>
              <input value={m.name} onChange={e => updateModule(i, e.target.value, m.content)} />
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
    </div>
  );
}
