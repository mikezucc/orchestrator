import React from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/themes/prism-tomorrow.css';

interface ScriptEditorProps {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  readOnly?: boolean;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({
  value,
  onChange,
  placeholder = '#!/bin/bash\n# Your script here...',
  className = '',
  minHeight = '22.5rem',
  readOnly = false,
}) => {
  const highlight = (code: string) => {
    return Prism.highlight(code, Prism.languages.bash, 'bash');
  };

  return (
    <div className={`rounded overflow-hidden bg-gray-900 ${className}`}>
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={highlight}
        padding={12}
        readOnly={readOnly}
        placeholder={placeholder}
        style={{
          fontFamily: '"Fira code", "Fira Mono", monospace',
          fontSize: '0.75rem',
          lineHeight: '1.5',
          minHeight,
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
        }}
        textareaClassName="outline-none"
        preClassName="text-gray-100"
      />
    </div>
  );
};

export default ScriptEditor;