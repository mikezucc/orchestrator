import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scriptsApi } from '../api/scripts';
import type { Script } from '@gce-platform/types';

interface ScriptLibraryDropdownProps {
  onSelectScript: (script: Script) => void;
  selectedTags?: string[];
}

export default function ScriptLibraryDropdown({ onSelectScript, selectedTags = [] }: ScriptLibraryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: scriptsResponse, isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: () => scriptsApi.list(),
  });

  const scripts = scriptsResponse?.data || [];

  // Filter scripts based on search term and selected tags
  const filteredScripts = scripts.filter(script => {
    const matchesSearch = searchTerm === '' || 
      script.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      script.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTags = selectedTags.length === 0 ||
      selectedTags.every(tag => script.tags?.includes(tag));

    return matchesSearch && matchesTags;
  });

  // Group scripts by personal vs organization
  const personalScripts = filteredScripts.filter(s => !s.organizationId);
  const orgScripts = filteredScripts.filter(s => s.organizationId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectScript = (script: Script) => {
    onSelectScript(script);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-secondary flex items-center space-x-2"
        type="button"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
        </svg>
        <span>Load from Library</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-96 bg-white dark:bg-te-gray-900 rounded-lg shadow-lg border border-te-gray-200 dark:border-te-gray-800 z-50">
          <div className="p-3 border-b border-te-gray-200 dark:border-te-gray-800">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search scripts..."
              className="w-full px-3 py-2 text-sm bg-te-gray-100 dark:bg-te-gray-950 border border-te-gray-300 dark:border-te-gray-700 rounded-lg focus:border-te-gray-500 dark:focus:border-te-yellow focus:outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-te-gray-500 dark:text-te-gray-600">
                Loading scripts...
              </div>
            ) : filteredScripts.length === 0 ? (
              <div className="p-4 text-center text-sm text-te-gray-500 dark:text-te-gray-600">
                No scripts found
              </div>
            ) : (
              <>
                {personalScripts.length > 0 && (
                  <div>
                    <div className="px-3 py-2 text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 bg-te-gray-50 dark:bg-te-gray-950">
                      Personal Scripts
                    </div>
                    {personalScripts.map(script => (
                      <ScriptItem key={script.id} script={script} onSelect={handleSelectScript} />
                    ))}
                  </div>
                )}

                {orgScripts.length > 0 && (
                  <div>
                    <div className="px-3 py-2 text-xs uppercase tracking-wider text-te-gray-600 dark:text-te-gray-400 bg-te-gray-50 dark:bg-te-gray-950">
                      Organization Scripts
                    </div>
                    {orgScripts.map(script => (
                      <ScriptItem key={script.id} script={script} onSelect={handleSelectScript} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScriptItem({ script, onSelect }: { script: Script; onSelect: (script: Script) => void }) {
  return (
    <button
      onClick={() => onSelect(script)}
      className="w-full px-3 py-3 text-left hover:bg-te-gray-50 dark:hover:bg-te-gray-800 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-te-gray-900 dark:text-te-gray-100 truncate">
            {script.name}
          </h4>
          {script.description && (
            <p className="text-xs text-te-gray-600 dark:text-te-gray-400 mt-1 line-clamp-2">
              {script.description}
            </p>
          )}
          <div className="flex items-center space-x-3 mt-2">
            <span className="text-xs text-te-gray-500 dark:text-te-gray-600">
              by {script.createdByUser?.email || 'Unknown'}
            </span>
            <span className="text-xs text-te-gray-500 dark:text-te-gray-600">
              {script.timeout}s timeout
            </span>
          </div>
          {script.tags && script.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {script.tags.map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 bg-te-gray-100 dark:bg-te-gray-800 text-te-gray-600 dark:text-te-gray-400 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <svg className="w-4 h-4 text-te-gray-400 dark:text-te-gray-600 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}