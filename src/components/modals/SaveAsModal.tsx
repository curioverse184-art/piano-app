import React, { useState } from 'react';
import { Copy, X, Check } from 'lucide-react';

interface SaveAsModalProps {
  isOpen: boolean;
  currentTitle: string;
  onClose: () => void;
  onSaveCopy: (newTitle: string) => void;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  currentTitle,
  onClose,
  onSaveCopy,
}) => {
  const [newTitle, setNewTitle] = useState(`${currentTitle} (Copy)`);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim()) {
      onSaveCopy(newTitle.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
              <Copy className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-stone-900 text-base">Save a Copy</h2>
              <p className="text-xs text-stone-500">Duplicate this project with a new name</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              New Project Title
            </label>
            <input
              type="text"
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter title for this copy..."
              className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium text-stone-900 bg-stone-50/50"
            />
            <p className="text-[11px] text-stone-500 mt-1.5">
              This will create a new, independent copy stored directly in your local projects library.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:pointer-events-none rounded-lg shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Copy</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
