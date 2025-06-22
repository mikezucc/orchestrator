import { useState, useRef, useEffect } from 'react';
import { useOrganization } from '../contexts/OrganizationContext';
import { ChevronDown, Building2, Check } from 'lucide-react';

export default function OrganizationSwitcher() {
  const { currentOrganization, organizations, switchOrganization, isLoading } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading || organizations.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors"
      >
        <Building2 className="w-4 h-4 text-te-gray-600 dark:text-te-gray-400" />
        <span className="text-sm font-medium">
          {currentOrganization?.name || 'Select Organization'}
        </span>
        <ChevronDown className={`w-4 h-4 text-te-gray-600 dark:text-te-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-te-gray-900 rounded-lg shadow-lg border border-te-gray-200 dark:border-te-gray-700 py-1 z-50">
          <div className="px-3 py-2 border-b border-te-gray-200 dark:border-te-gray-700">
            <p className="text-xs text-te-gray-600 dark:text-te-gray-400 uppercase tracking-wider">
              Switch Organization
            </p>
          </div>
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => {
                if (org.id !== currentOrganization?.id) {
                  switchOrganization(org.id);
                }
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-te-gray-100 dark:hover:bg-te-gray-800 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-te-gray-400" />
                <span className="text-sm">{org.name}</span>
              </div>
              {org.id === currentOrganization?.id && (
                <Check className="w-4 h-4 text-te-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}