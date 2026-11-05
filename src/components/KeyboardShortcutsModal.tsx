import { uiText } from "../lib/uiText.js";
/**
 * @file KeyboardShortcutsModal.tsx
 * @description Modal reference card listing all keyboard shortcuts and mouse gestures (~200 lines).
 * Key features: reads `MouseGestureSettings` to show the current pan combination, groups shortcuts
 * by category, links to Settings to change mouse gesture configuration.
 * Integration: uses `useModalAccessibility`; opened from `Toolbar` help menu.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useModalAccessibility } from '@/hooks/useModalAccessibility';
import type { MouseGestureSettings, CanvasPanGesture } from '@/types';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mouseGestures?: MouseGestureSettings;
  onOpenSettings?: () => void;
}

const DEFAULT_GESTURES: MouseGestureSettings = {
  canvasPanGesture: 'shift-drag',
  middleMouseAlwaysPans: false,
  zoomScrollDirection: 'normal',
  zoomScrollSensitivity: 1.0,
};

function getPanKeys(gesture: CanvasPanGesture): string[] {
  if (gesture === 'drag') return ['Drag'];
  if (gesture === 'middle-drag') return ['Middle Mouse', 'Drag'];
  return ['Shift', 'Drag'];
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
  mouseGestures,
  onOpenSettings,
}) => {
  const { modalProps, contentRef } = useModalAccessibility({ isOpen, onClose, titleId: 'shortcuts-modal-title' });

  if (!isOpen) return null;

  const gestures = mouseGestures ?? DEFAULT_GESTURES;

  const canvasItems = [
    { keys: ['N'], description: uiText("Add New Block") },
    { keys: ['G'], description: uiText("Group Selected Blocks") },
    { keys: ['Delete'], description: uiText("Delete Selected Blocks/Groups") },
    { keys: ['Escape'], description: uiText("Clear Selection") },
    { keys: ['Enter'], description: uiText("Open Selected in Editor") },
    { keys: ['↑', '↓', '←', '→'], description: uiText("Move Focus Between Nodes") },
    { keys: ['F'], description: uiText("Fit to Screen") },
    { keys: ['['], description: uiText("Navigate Back (Flow Canvas)") },
    { keys: [']'], description: uiText("Navigate Forward (Flow Canvas)") },
    { keys: getPanKeys(gestures.canvasPanGesture), description: uiText("Pan Canvas") },
    ...(gestures.middleMouseAlwaysPans && gestures.canvasPanGesture !== 'middle-drag'
      ? [{ keys: ['Middle Mouse', 'Drag'], description: uiText("Pan Canvas (also)") }]
      : []),
    {
      keys: ['Scroll'],
      description: gestures.zoomScrollDirection === 'inverted'
        ? 'Zoom In/Out (scroll inverted)'
        : 'Zoom In/Out',
    },
    { keys: ['Double Click'], description: uiText("Open Block in Editor") },
  ];

  const shortcuts = [
    { category: 'General', items: [
        { keys: ['F5'], description: uiText("Run Project") },
        { keys: ['Shift', 'F5'], description: uiText("Stop Project") },
        { keys: ['Ctrl', 'G'], description: uiText("Go to Label") },
        { keys: ['Ctrl', 'Shift', 'G'], description: uiText("Warp to Label") },
        { keys: ['Ctrl', 'Shift', 'F'], description: uiText("Search in Files") },
        { keys: ['Ctrl', 'S'], description: uiText("Save All") },
        { keys: ['Ctrl', 'W'], description: uiText("Close Active Tab") },
        { keys: ['Ctrl', 'Shift', 'T'], description: uiText("Reopen Closed Tab") },
        { keys: ['Ctrl', 'Q'], description: uiText("Quit Application") },
        { keys: ['Ctrl', ','], description: uiText("Settings") },
        { keys: ['Ctrl', '/'], description: uiText("Keyboard Shortcuts") },
        { keys: ['Ctrl', 'Z'], description: uiText("Undo") },
        { keys: ['Ctrl', 'Y'], description: uiText("Redo") },
    ]},
    { category: 'Canvas', items: canvasItems, configurable: true },
    { category: 'Editor', items: [
        { keys: ['Ctrl', 'S'], description: uiText("Save File") },
        { keys: ['Ctrl', 'Click'], description: uiText("Go to Definition") },
    ]},
    { category: 'Explorer', items: [
        { keys: ['Double Click'], description: uiText("Open File") },
        { keys: ['Right Click'], description: uiText("Context Menu") },
    ]},
  ];

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100]" onClick={onClose}>
        <div ref={contentRef} {...modalProps} className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl m-4 flex flex-col border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <header className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 id="shortcuts-modal-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">{uiText("Keyboard Shortcuts")}</h2>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" aria-label={uiText("Close")}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </header>
            <main className="p-6 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {shortcuts.map(section => (
                        <div key={section.category}>
                            <div className="flex items-baseline justify-between mb-3">
                                <h3 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">{section.category}</h3>
                                {section.configurable && onOpenSettings && (
                                    <button
                                        onClick={() => { onClose(); onOpenSettings(); }}
                                        className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline"
                                    >
                                        {uiText("Configure →")}</button>
                                )}
                            </div>
                            <ul className="space-y-2">
                                {section.items.map((item, idx) => (
                                    <li key={idx} className="flex justify-between items-center">
                                        <span className="text-sm text-gray-600 dark:text-gray-300">{item.description}</span>
                                        <div className="flex space-x-1">
                                            {item.keys.map((k, i) => (
                                                <kbd key={i} className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-md dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 shadow-sm min-w-[1.5rem] text-center">{k}</kbd>
                                            ))}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </main>
            <footer className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-b-lg border-t border-gray-200 dark:border-gray-700 text-right">
                <button onClick={onClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded transition-colors">
                    {uiText("Close")}</button>
            </footer>
        </div>
    </div>,
    document.body
  );
};

export default KeyboardShortcutsModal;
