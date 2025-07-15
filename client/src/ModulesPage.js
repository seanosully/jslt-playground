import React, { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import './App.css';

export default function ModulesPage({ modules, setModules, onBack }) {
  const [selected, setSelected] = useState(null);
  const [openFolders, setOpenFolders] = useState({});
  const dragPathRef = useRef(null);

  const buildTree = () => {
    const root = { children: {} };
    modules.forEach(m => {
      const type = m.type || 'file';
      const parts = m.name.split('/').filter(p => p);
      let cur = root;
      parts.forEach((part, idx) => {
        cur.children[part] = cur.children[part] || {
          name: part,
          path: parts.slice(0, idx + 1).join('/') + (idx === parts.length - 1 && type === 'folder' ? '/' : ''),
          type: idx === parts.length - 1 ? type : 'folder',
          children: {}
        };
        cur = cur.children[part];
      });
      if (type === 'file') {
        cur.module = m;
      }
    });
    return root;
  };

  const tree = buildTree();

  const toggleFolder = path => {
    setOpenFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const addFile = () => {
    const name = prompt('New file path');
    if (!name) return;
    const fileName = name.endsWith('.jslt') ? name : name + '.jslt';
    setModules([...modules, { type: 'file', name: fileName, content: '{}' }]);
    setSelected(fileName);
  };

  const addFolder = () => {
    const name = prompt('New folder path');
    if (!name) return;
    const path = name.endsWith('/') ? name : name + '/';
    setModules([...modules, { type: 'folder', name: path }]);
    setOpenFolders(prev => ({ ...prev, [path]: true }));
  };

  const handleModuleUpload = e => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.jslt'));
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result;
        const name = file.name;
        setModules(prev => [...prev, { type: 'file', name, content }]);
        setSelected(name);
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
        setModules(prev => [...prev, { type: 'file', name, content }]);
        setSelected(name);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const updateContent = (path, content) => {
    const idx = modules.findIndex(m => m.name === path && (m.type || 'file') !== 'folder');
    if (idx >= 0) {
      const newMods = modules.slice();
      newMods[idx] = { ...newMods[idx], content };
      setModules(newMods);
    }
  };

  const removeEntry = (path, type) => {
    const msg = type === 'folder'
      ? `Delete folder ${path} and all contents?`
      : `Delete file ${path}?`;
    if (!window.confirm(msg)) return;
    if (type === 'folder') {
      setModules(modules.filter(m => !m.name.startsWith(path)));
      if (selected && selected.startsWith(path)) setSelected(null);
    } else {
      setModules(modules.filter(m => m.name !== path));
      if (selected === path) setSelected(null);
    }
  };

  const moveEntry = (src, destFolder) => {
    const isFolder = src.endsWith('/');
    if (destFolder && !destFolder.endsWith('/')) destFolder += '/';
    const base = isFolder ? src.slice(0, -1).split('/').pop() + '/' : src.split('/').pop();
    setModules(prev => prev.map(m => {
      if (isFolder) {
        if (m.name.startsWith(src)) {
          const suffix = m.name.slice(src.length);
          return { ...m, name: destFolder + base + suffix };
        }
        return m;
      }
      if (m.name === src) {
        return { ...m, name: destFolder + base };
      }
      return m;
    }));
    if (selected && selected.startsWith(src)) {
      const suffix = selected.slice(src.length);
      setSelected(destFolder + base + suffix);
    }
    setOpenFolders(prev => ({ ...prev, [destFolder || '']: true }));
  };

  const findModule = path => modules.find(m => m.name === path && (m.type || 'file') !== 'folder');

  const renderNode = node => {
    if (node.type === 'folder') {
      const isOpen = openFolders[node.path] !== false;
      return (
        <div key={node.path}>
          <div
            className="treeItemRow"
            draggable
            onDragStart={e => (dragPathRef.current = node.path)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const src = dragPathRef.current;
              if (src && src !== node.path && !node.path.startsWith(src)) {
                moveEntry(src, node.path);
              }
            }}
          >
            <div className="treeItem folder" onClick={() => toggleFolder(node.path)}>
              {isOpen ? '📂' : '📁'} {node.name}
            </div>
            <button
              className="deleteBtn"
              onClick={e => { e.stopPropagation(); removeEntry(node.path, 'folder'); }}
            >✕</button>
          </div>
          {isOpen && (
            <div className="treeChildren">
              {Object.values(node.children)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(renderNode)}
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        key={node.path}
        className={`treeItemRow file${selected === node.path ? ' selected' : ''}`}
        draggable
        onDragStart={e => (dragPathRef.current = node.path)}
      >
        <div
          className={`treeItem file${selected === node.path ? ' selected' : ''}`}
          onClick={() => setSelected(node.path)}
        >
          {node.name}
        </div>
        <button
          className="deleteBtn"
          onClick={e => { e.stopPropagation(); removeEntry(node.path, 'file'); }}
        >✕</button>
      </div>
    );
  };

  const selectedModule = selected ? findModule(selected) : null;

  return (
    <div className="modulesPage">
      <div className="modulesTopBar">
        <button className="btn" onClick={onBack}>Back</button>
      </div>
      <div className="modulesLayout">
        <div className="fileTree">
          <div className="label">
            Files
            <div className="labelButtons moduleControls">
              <button className="btn smallBtn" onClick={addFile}>New File</button>
              <button className="btn smallBtn" onClick={addFolder}>New Folder</button>
              <label className="btn smallBtn fileUpload">
                Upload File
                <input type="file" accept=".jslt" multiple className="fileInput" onChange={handleModuleUpload} />
              </label>
              <label className="btn smallBtn fileUpload">
                Upload Folder
                <input type="file" webkitdirectory="" directory="" multiple className="fileInput" onChange={handleFolderUpload} />
              </label>
            </div>
          </div>
          <div
            className="treeScroll"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const src = dragPathRef.current;
              if (src) moveEntry(src, '');
            }}
          >
            {Object.values(tree.children)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(renderNode)}
          </div>
        </div>
        <div className="editorPane">
          {selectedModule ? (
            <Editor
              height="100%"
              language="javascript"
              value={selectedModule.content}
              onChange={value => updateContent(selectedModule.name, value ?? '')}
            />
          ) : (
            <div className="noSelection">Select a file</div>
          )}
        </div>
      </div>
    </div>
  );
}
