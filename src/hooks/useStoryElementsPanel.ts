import { uiText } from "../lib/uiText.js";
import { useCallback } from 'react';
import type React from 'react';
import type { Block, RenpyAnalysisResult, Variable, FileSystemTreeNode, Position } from '@/types';
import { formatErrorMessage } from '@/lib/formatErrorMessage';

export interface UseStoryElementsPanelParams {
  blocks: Block[];
  analysisResult: RenpyAnalysisResult;
  updateBlock: (id: string, data: Partial<Block>) => void;
  addBlock: (filePath: string, content: string, initialPosition?: Position, options?: { markDirty?: boolean }) => void;
  setFileSystemTree: React.Dispatch<React.SetStateAction<FileSystemTreeNode | null>>;
  setHoverHighlightIds: React.Dispatch<React.SetStateAction<Set<string> | null>>;
  projectRootPath: string | null;
  addToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  handleOpenEditor: (blockId: string, line?: number) => void;
}

export interface UseStoryElementsPanelReturn {
  handleAddVariable: (v: { name: string; type: 'define' | 'default'; initialValue: string }) => Promise<void>;
  handleEditVariable: (oldName: string, updated: Omit<Variable, 'definedInBlockId' | 'line'>) => void;
  handleFindScreenDefinition: (name: string) => void;
  handleHoverHighlightStart: (key: string, type: 'character' | 'variable') => void;
  handleHoverHighlightEnd: () => void;
}

export function useStoryElementsPanel({
  blocks, analysisResult, updateBlock, addBlock,
  setFileSystemTree, setHoverHighlightIds,
  projectRootPath, addToast, handleOpenEditor,
}: UseStoryElementsPanelParams): UseStoryElementsPanelReturn {

  const handleAddVariable = useCallback(async (v: { name: string; type: 'define' | 'default'; initialValue: string }) => {
    const varContent = `${v.type} ${v.name} = ${v.initialValue}\n`;
    const targetFile = 'game/variables.rpy';
    const existing = blocks.find(b => b.filePath === targetFile);
    if (existing) {
      updateBlock(existing.id, { content: existing.content + '\n' + varContent });
      addToast(uiText("Added variable {value0} to variables.rpy", { value0: v.name }), 'success');
    } else if (window.electronAPI && projectRootPath) {
      try {
        const fullPath = await window.electronAPI.path.join(projectRootPath, 'game', 'variables.rpy') as string;
        const res = await window.electronAPI.writeFile(fullPath, varContent);
        if (res.success) {
          addBlock(targetFile, varContent, undefined, { markDirty: false });
          const projData = await window.electronAPI.loadProject(projectRootPath);
          setFileSystemTree(projData.tree);
          addToast(uiText("Created variables.rpy and added variable {value0}", { value0: v.name }), 'success');
        } else {
          const errorMsg = typeof res.error === 'string' ? res.error : 'Unknown error';
          throw new Error(errorMsg);
        }
      } catch (e) {
        addToast(uiText("Failed to create variables.rpy: {value0}", { value0: formatErrorMessage(e) }), 'error');
      }
    } else {
      addBlock(targetFile, varContent);
      addToast(uiText("Added variable {value0} to variables.rpy", { value0: v.name }), 'success');
    }
  }, [blocks, updateBlock, addToast, projectRootPath, addBlock, setFileSystemTree]);

  const handleEditVariable = useCallback((oldName: string, updated: Omit<Variable, 'definedInBlockId' | 'line'>) => {
    const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const oldVar = analysisResult.variables.get(oldName);
    if (!oldVar) {
      addToast(uiText("Error: Cannot find definition for variable '{value0}'.", { value0: oldName }), 'error');
      return;
    }

    const defBlock = blocks.find(b => b.id === oldVar.definedInBlockId);
    if (!defBlock) {
      addToast(uiText("Error: Cannot find the file containing variable '{value0}'.", { value0: oldName }), 'error');
      return;
    }

    const defRegex = new RegExp(
      `^(\\s*(?:define|default)\\s+)${escapeForRegex(oldName)}(\\s*=)`,
      'm'
    );

    if (!defRegex.test(defBlock.content)) {
      addToast(uiText("Error: Could not locate the declaration of '{value0}' in the source file.", { value0: oldName }), 'error');
      return;
    }

    const newName = updated.name;
    const newType = updated.type;
    const newInitialValue = updated.initialValue;

    const fullDefRegex = new RegExp(
      `^(\\s*)(?:define|default)\\s+${escapeForRegex(oldName)}\\s*=\\s*(.*)$`,
      'm'
    );
    const newDefContent = defBlock.content.replace(fullDefRegex, `$1${newType} ${newName} = ${newInitialValue}`);

    if (oldName !== newName) {
      const usageRegex = new RegExp(`\\b${escapeForRegex(oldName)}\\b`, 'g');
      let renamedFileCount = 0;

      blocks.forEach(block => {
        const base = block.id === defBlock.id ? newDefContent : block.content;
        const replaced = base.replace(usageRegex, newName);

        if (block.id === defBlock.id) {
          updateBlock(block.id, { content: replaced });
          renamedFileCount++;
        } else if (replaced !== base) {
          updateBlock(block.id, { content: replaced });
          renamedFileCount++;
        }
      });

      addToast(uiText("Renamed \"{value0}\" to \"{value1}\" in {value2} file(s).", { value0: oldName, value1: newName, value2: renamedFileCount }), 'success');
    } else {
      updateBlock(defBlock.id, { content: newDefContent });
      addToast(uiText("Variable \"{value0}\" updated.", { value0: oldName }), 'success');
    }
  }, [analysisResult.variables, blocks, updateBlock, addToast]);

  const handleFindScreenDefinition = useCallback((name: string) => {
    const def = analysisResult.screens.get(name);
    if (def) handleOpenEditor(def.definedInBlockId, def.line);
  }, [analysisResult.screens, handleOpenEditor]);

  const handleHoverHighlightStart = useCallback((key: string, type: 'character' | 'variable') => {
    const ids = new Set<string>();
    if (type === 'character') {
      analysisResult.dialogueLines.forEach((dialogues, blockId) => {
        if (dialogues.some(d => d.tag === key)) ids.add(blockId);
      });
    } else {
      analysisResult.variableUsages.get(key)?.forEach(u => ids.add(u.blockId));
    }
    setHoverHighlightIds(ids);
  }, [analysisResult.dialogueLines, analysisResult.variableUsages, setHoverHighlightIds]);

  const handleHoverHighlightEnd = useCallback(() => setHoverHighlightIds(null), [setHoverHighlightIds]);

  return {
    handleAddVariable,
    handleEditVariable,
    handleFindScreenDefinition,
    handleHoverHighlightStart,
    handleHoverHighlightEnd,
  };
}
