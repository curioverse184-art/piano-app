import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  projectTitle: string;
  actionType: 'new' | 'open' | 'home';
  onSaveAndProceed: () => void;
  onDiscardAndProceed: () => void;
  onCancel: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  projectTitle,
  actionType,
  onSaveAndProceed,
  onDiscardAndProceed,
  onCancel,
}) => {
  if (!isOpen) return null;

  const actionDescription =
    actionType === 'new'
      ? 'creating a new project'
      : actionType === 'open'
      ? 'opening another project'
      : 'leaving the editor';

  return (
    <div
      id="unsaved-changes-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-stone-900 text-base">Unsaved Changes</h2>
              <p className="text-xs text-stone-500">Save your work before proceeding</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <p className="text-sm text-stone-700 leading-relaxed">
            You have unsaved changes in{' '}
            <span className="font-semibold text-stone-900">"{projectTitle || 'Untitled Project'}"</span>.
            Would you like to save your changes before {actionDescription}?
          </p>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDiscardAndProceed}
            className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors"
          >
            Don't Save
          </button>
          <button
            type="button"
            onClick={onSaveAndProceed}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors shadow-xs"
          >
            Save Project
          </button>
        </div>
      </div>
    </div>
  );
};
