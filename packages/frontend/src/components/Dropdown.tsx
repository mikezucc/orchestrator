import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export default function Dropdown({ trigger, children, align = 'right', className = '' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        triggerRef.current && 
        dropdownRef.current && 
        !triggerRef.current.contains(event.target as Node) &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      setDropdownPosition({
        top: rect.bottom + scrollTop,
        left: align === 'right' 
          ? rect.right + scrollLeft - 192 // 192px = 48rem (w-48)
          : rect.left + scrollLeft
      });
    }
  }, [isOpen, align]);

  return (
    <>
      <div className={`relative ${className}`} ref={triggerRef}>
        <div onClick={() => setIsOpen(!isOpen)}>
          {trigger}
        </div>
      </div>
      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed w-48 bg-white dark:bg-te-gray-800 border border-te-gray-200 dark:border-te-gray-700 rounded shadow-lg z-50"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`
          }}
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  );
}