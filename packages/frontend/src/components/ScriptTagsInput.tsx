import { useState } from 'react';

interface ScriptTagsInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  onlyDisplay?: boolean;
}

export default function ScriptTagsInput({ tags, onChange, onlyDisplay = false }: ScriptTagsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      // Remove last tag when backspace is pressed on empty input
      removeTag(tags[tags.length - 1]);
    }
  };

  const addTag = () => {
    const newTag = inputValue.trim().toLowerCase();
    if (newTag && !tags.includes(newTag)) {
      onChange([...tags, newTag]);
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  if (onlyDisplay) {
    return (
      <div className="flex flex-wrap gap-1">
        {tags.map(tag => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 bg-te-gray-100 dark:bg-te-gray-800 text-te-gray-600 dark:text-te-gray-400 rounded"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-te-gray-100 dark:bg-te-gray-950 border border-te-gray-300 dark:border-te-gray-700 rounded-lg focus-within:border-te-gray-500 dark:focus-within:border-te-yellow">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center text-xs px-2 py-1 bg-te-gray-200 dark:bg-te-gray-800 text-te-gray-700 dark:text-te-gray-300 rounded group"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1 text-te-gray-500 hover:text-te-gray-700 dark:hover:text-te-gray-100"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          className="flex-1 min-w-[100px] text-sm bg-transparent focus:outline-none"
        />
      </div>
      <p className="text-xs text-te-gray-600 dark:text-te-gray-500">
        Press Enter or comma to add a tag
      </p>
    </div>
  );
}