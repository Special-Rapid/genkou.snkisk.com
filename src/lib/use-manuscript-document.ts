import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { editDocument, orientSelection, textareaDocument, type CharacterOrientation, type ManuscriptDocument } from './text-orientation'

type Selection = { start: number; end: number }
type Snapshot = { document: ManuscriptDocument; selection: Selection }
export function useManuscriptDocument(initial: () => ManuscriptDocument) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({ document: textareaDocument(initial()), selection: { start: 0, end: 0 } }))
  const current = useRef(snapshot)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const past = useRef<Snapshot[]>([]), future = useRef<Snapshot[]>([])
  const before = useRef<Selection | undefined>(undefined)
  const compositionStart = useRef<Snapshot | null>(null)
  const compositionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [composing, setComposing] = useState(false)
  const restoreSelection = useRef(false)
  const selection = useRef<Selection>({ start: 0, end: 0 })
  const [selected, setSelected] = useState(selection.current)
  const publish = (next: Snapshot, restore = false) => {
    current.current = next; restoreSelection.current = restore; selection.current = next.selection; setSelected(next.selection); setSnapshot(next)
  }
  const remember = (value: Snapshot) => { past.current = [...past.current.slice(-99), value]; future.current = [] }
  const recordSelection = () => {
    if (!textarea.current) return
    selection.current = { start: textarea.current.selectionStart, end: textarea.current.selectionEnd }
    setSelected(selection.current)
  }
  const undo = (redo = false) => {
    if (compositionStart.current) return
    const source = redo ? future : past, destination = redo ? past : future
    const next = source.current.pop()
    if (!next) return
    destination.current.push({ ...current.current, selection: selection.current }); publish(next, true)
  }
  useEffect(() => {
    const input = textarea.current
    if (!input) return
    const handleBeforeInput = (event: InputEvent) => {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undo(event.inputType === 'historyRedo'); return }
      let start = input.selectionStart, end = input.selectionEnd
      if (start === end && event.inputType === 'deleteContentBackward' && start > 0) start -= Array.from(input.value.slice(0, start)).at(-1)?.length ?? 1
      if (start === end && event.inputType === 'deleteContentForward' && end < input.value.length) end += Array.from(input.value.slice(end))[0]?.length ?? 1
      before.current = { start, end }
    }
    input.addEventListener('beforeinput', handleBeforeInput)
    return () => { input.removeEventListener('beforeinput', handleBeforeInput); clearTimeout(compositionTimer.current) }
  }, [])
  useLayoutEffect(() => {
    if (!restoreSelection.current || !textarea.current) return
    textarea.current.focus({ preventScroll: true }); textarea.current.setSelectionRange(snapshot.selection.start, snapshot.selection.end)
    restoreSelection.current = false
  }, [snapshot])
  return {
    document: snapshot.document, textarea, selected, composing,
    replace: (document: ManuscriptDocument) => { past.current = []; future.current = []; publish({ document: textareaDocument(document), selection: { start: 0, end: 0 } }) },
    orient: (mode?: CharacterOrientation) => {
      if (compositionStart.current) return
      const next = orientSelection(current.current.document, selected.start, selected.end, mode)
      if (JSON.stringify(next.runs) !== JSON.stringify(current.current.document.runs)) remember({ ...current.current, selection: selected })
      publish({ document: next, selection: selected }, true)
    },
    inputProps: {
      onSelect: recordSelection,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (event.target.value === current.current.document.text) return
        const document = editDocument(current.current.document, event.target.value, before.current)
        before.current = undefined
        if (!compositionStart.current) remember({ ...current.current, selection: selection.current })
        publish({ document, selection: { start: event.target.selectionStart, end: event.target.selectionEnd } })
      },
      onCompositionStart: () => { compositionStart.current = { ...current.current, selection: selection.current }; setComposing(true) },
      onCompositionEnd: () => {
        clearTimeout(compositionTimer.current)
        // Some browsers send the final input immediately after compositionend.
        compositionTimer.current = setTimeout(() => {
          const original = compositionStart.current
          if (original) {
            if (original.document.text === current.current.document.text) {
              // A cancelled conversion must not erase formatting on unchanged text.
              publish({ document: original.document, selection: current.current.selection })
            } else remember(original)
          }
          compositionStart.current = null
          setComposing(false)
        }, 0)
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing || compositionStart.current || !(event.ctrlKey || event.metaKey) || event.altKey) return
        if (event.key.toLowerCase() === 'z' || (event.ctrlKey && event.key.toLowerCase() === 'y')) { event.preventDefault(); undo(event.shiftKey || event.key.toLowerCase() === 'y') }
      },
    },
  }
}
