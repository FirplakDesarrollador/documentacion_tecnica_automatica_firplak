'use client'

import React, { useState, useRef, useEffect, MouseEvent, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlusCircle, Save, Type, Image as ImageIcon, Box, Move, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Loader2, Eye, EyeOff, Minus, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, AlignHorizontalJustifyStart, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter, Undo2, Redo2, Copy, Trash2, Settings, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { updateTemplate, getPreviewProduct } from '@/app/templates/actions'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type TemplateElementType = 'text' | 'dynamic_text' | 'image' | 'barcode' | 'box' | 'dashed_line'

export interface TemplateElement {
    id: string
    type: TemplateElementType
    x: number
    y: number
    width: number
    height: number
    content?: string
    dataField?: string
    fontSize?: number // in pt now
    fontWeight?: string // e.g., 'normal', 'medium', 'bold'
    fontStyle?: string // 'normal' | 'italic'
    textAlign?: 'left' | 'center' | 'right'
    fontFamily?: string
    borderStyle?: 'solid' | 'dashed' | 'dotted' // used for lines/boxes
    borderWidth?: number
    required?: boolean
    lineHeight?: number
}

const PIXELS_PER_MM = 4
const MAX_HISTORY = 10

function OverflowText({ text, textAlign, isPreviewMode, type, previewData, dataField, lineHeight }: { text: string, textAlign: 'left' | 'center' | 'right' | undefined, isPreviewMode: boolean, type: string, previewData?: any, dataField?: string, lineHeight?: number }) {
    const textRef = useRef<HTMLDivElement>(null)
    const [isOverflowing, setIsOverflowing] = useState(false)

    // Regex replacement for rich text variables
    const displayText = React.useMemo(() => {
        if (!isPreviewMode || !previewData) return text

        if (type === 'dynamic_text') {
            const varName = text.replace(/[{}]/g, '');
            const val = previewData[varName];
            if (val === null || val === undefined || val === '') return '[VACIO]';
            return String(val);
        }

        let interpolated = text
        const matches = text.match(/\{[^}]+\}/g)
        if (matches) {
            matches.forEach(match => {
                const varName = match.slice(1, -1)
                const val = previewData[varName];
                const replacement = (val === null || val === undefined || val === '') ? '[VACIO]' : String(val);
                interpolated = interpolated.replace(match, replacement)
            })
        }
        return interpolated
    }, [text, isPreviewMode, previewData, type])

    useEffect(() => {
        if (!textRef.current || !isPreviewMode) {
            setIsOverflowing(false)
            return
        }

        const checkOverflow = () => {
            if (!textRef.current) return;
            const el = textRef.current
            // We give an 8px tolerance to account for slight line-height calculations across browsers
            const overflowing = (el.scrollHeight > el.clientHeight + 8) || (el.scrollWidth > el.clientWidth + 8)
            setIsOverflowing(overflowing)
        }

        checkOverflow()

        const resizeObserver = new ResizeObserver(() => {
            checkOverflow()
        })
        
        resizeObserver.observe(textRef.current)

        return () => {
            resizeObserver.disconnect()
        }
    }, [displayText, isPreviewMode])

    const renderTextContent = () => {
        // Parse for visual bolding of SKU code if it's the exact match
        if (isPreviewMode && previewData && type === 'dynamic_text' && dataField === 'code') {
            const parts = String(displayText).split('-')
            if (parts.length > 1) {
                const lastPart = parts.pop()
                return <>{parts.join('-')}-<b>{lastPart}</b></>
            }
            return displayText
        }

        // If it's HTML (has tags), render it. Else render as plain text node
        if (typeof displayText === 'string' && (displayText.includes('<') || displayText.includes('&nbsp;'))) {
            // Because contentEditable creates <div> blocks, we might need to preserve formatting
            return <div dangerouslySetInnerHTML={{ __html: displayText }} />
        }
        return displayText
    }

    return (
        <div
            ref={textRef}
            className={`w-full h-full overflow-hidden pointer-events-none flex flex-col justify-center ${isOverflowing ? 'ring-2 ring-red-500 bg-red-100/50' : ''}`}
        >
            {isOverflowing && <span className="absolute -top-5 left-0 bg-red-500 text-white text-[9px] px-1 rounded shadow-sm z-50 pointer-events-none">Desbordamiento</span>}
            <div style={{ textAlign, width: '100%', wordBreak: 'break-word', whiteSpace: 'pre-wrap', padding: '0 2px', lineHeight: lineHeight || 1.2 }}>
                {renderTextContent()}
            </div>
        </div>
    )
}

function RichTextEditor({ content, onChange, onInsertVariable }: { content: string, onChange: (val: string) => void, onInsertVariable: (v: string) => void }) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Initial load only if empty
    useEffect(() => {
        if (editorRef.current && content && editorRef.current.innerHTML !== content) {
            editorRef.current.innerHTML = content;
        }
    }, [content]);

    const execCommand = (command: string, e: React.MouseEvent) => {
        e.preventDefault();
        document.execCommand(command, false, undefined);
        editorRef.current?.focus();
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    };

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    };

    return (
        <div className="flex flex-col border border-input rounded-md overflow-hidden bg-white focus-within:ring-1 focus-within:ring-ring">
            <div className="flex bg-slate-50 border-b p-1 gap-1 items-center">
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('bold', e)} title="Negrita">
                    <b>B</b>
                </Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('italic', e)} title="Cursiva">
                    <i>I</i>
                </Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('underline', e)} title="Subrayado">
                    <u>U</u>
                </Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('removeFormat', e)} title="Borrar Formato">
                    <Trash2 className="h-3 w-3 text-slate-400" />
                </Button>
                
                <div className="h-4 w-px bg-slate-300 mx-1" />

                <select
                    className="h-6 text-[10px] rounded border bg-white hover:bg-slate-50 cursor-pointer px-1 outline-none font-bold text-slate-600"
                    onChange={(e) => {
                        const size = e.target.value;
                        if (!size) return;
                        
                        // Use a more robust way to apply font size via execCommand + span replacement
                        // since browser fontSize only supports 1-7
                        document.execCommand('styleWithCSS', false, "true");
                        document.execCommand('fontSize', false, "7");
                        
                        if (editorRef.current) {
                            const fontEls = editorRef.current.getElementsByTagName('font');
                            const spanEls = editorRef.current.getElementsByTagName('span');
                            
                            // Process both possible outcomes (some browsers use font, others use span with styleWithCSS)
                            Array.from(fontEls).forEach(el => {
                                if (el.getAttribute('size') === "7") {
                                    el.removeAttribute('size');
                                    el.style.fontSize = `${size}pt`;
                                }
                            });
                            Array.from(spanEls).forEach(el => {
                                if (el.style.fontSize === 'xxx-large' || el.style.fontSize === '48px') {
                                    el.style.fontSize = `${size}pt`;
                                }
                            });
                            
                            onChange(editorRef.current.innerHTML);
                        }
                        e.target.value = "";
                    }}
                    value=""
                >
                    <option value="" disabled>Tamaño</option>
                    {[6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48].map(s => (
                        <option key={s} value={s}>{s}pt</option>
                    ))}
                </select>

                <select
                    className="h-6 text-[10px] rounded border bg-slate-100 hover:bg-slate-200 cursor-pointer px-1 outline-none ml-auto"
                    onChange={(e) => {
                        if (e.target.value) {
                            onInsertVariable(e.target.value);
                            e.target.value = "";
                        }
                    }}
                    value=""
                >
                    <option value="" disabled>+ Insertar Variable</option>
                    <option value="final_name_es">Nombre (ES)</option>
                    <option value="final_name_en">Nombre (EN)</option>
                    <option value="code">Código Artículo (SKU)</option>
                    <option value="sku_base">SKU Sin Color</option>
                    <option value="barcode_text">Código de Barras EAN</option>
                    <option value="color">Color (Nombre)</option>
                    <option value="color_code">Color (Código)</option>
                    <option value="sap_description">Descripción SAP</option>
                    <option value="furniture_name">Nombre Mueble Genérico</option>
                    <option value="line">Línea</option>
                    <option value="commercial_measure">Medida Comercial</option>
                    <option value="use_destination">Uso</option>
                    <option value="zone_home">Zona</option>
                    <option value="width_cm">Ancho (cm)</option>
                    <option value="depth_cm">Fondo (cm)</option>
                    <option value="height_cm">Alto (cm)</option>
                    <option value="weight_kg">Peso (kg)</option>
                    <option value="width_in">Ancho (in)</option>
                    <option value="depth_in">Fondo (in)</option>
                    <option value="height_in">Alto (in)</option>
                    <option value="weight_lb">Peso (lb)</option>
                </select>
            </div>
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className="min-h-[80px] p-2 text-sm outline-none"
                style={{ direction: 'ltr', whiteSpace: 'pre-wrap' }}
            />
        </div>
    )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BuilderCanvas({ template, assets = [] }: { template: any, assets?: any[] }) {

    const [elements, setElements] = useState<TemplateElement[]>([])
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [isModified, setIsModified] = useState(false)

    // Unsaved Changes Interception State
    const [showExitDialog, setShowExitDialog] = useState(false)
    const [pendingHref, setPendingHref] = useState<string | null>(null)
    const [exportFormats, setExportFormats] = useState<string[]>(
        template.export_formats ? template.export_formats.split(',') : ['pdf', 'jpg']
    )

    // History Stack for Undo / Redo
    const [history, setHistory] = useState<TemplateElement[][]>([])
    const [historyIndex, setHistoryIndex] = useState(-1)

    // Dragging State
    const [isDragging, setIsDragging] = useState(false)
    const [dragOffsets, setDragOffsets] = useState<{ id: string, offsetX: number, offsetY: number }[]>([])

    // Resizing State
    const [isResizing, setIsResizing] = useState(false)
    const [resizeHandle, setResizeHandle] = useState<string | null>(null)
    const [resizeStartRect, setResizeStartRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null)
    const [resizeStartMouse, setResizeStartMouse] = useState<{ x: number, y: number } | null>(null)
    const [resizingElementId, setResizingElementId] = useState<string | null>(null)

    const [isPreviewMode, setIsPreviewMode] = useState(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [previewData, setPreviewData] = useState<any>(null)

    const canvasRef = useRef<HTMLDivElement>(null)

    // Layout configuration
    const CANVAS_WIDTH = template.width_mm * PIXELS_PER_MM
    const CANVAS_HEIGHT = template.height_mm * PIXELS_PER_MM

    // Initial Load
    useEffect(() => {
        try {
            const parsed = JSON.parse(template.elements_json)
            if (Array.isArray(parsed)) {
                setElements(parsed)
                setHistory([parsed])
                setHistoryIndex(0)
            } else {
                setHistory([[]])
                setHistoryIndex(0)
            }
        } catch (e) {
            console.error("Failed to parse template elements", e)
            setHistory([[]])
            setHistoryIndex(0)
        }
    }, [template.elements_json])

    // Warn before leaving if unsaved changes exist
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isModified) {
                e.preventDefault()
                e.returnValue = ''
            }
        }
        
        const handleAnchorClick = (e: globalThis.MouseEvent) => {
            if (!isModified) return;
            const target = e.target as HTMLElement;
            const a = target.closest('a');
            if (a && a.href && a.target !== '_blank' && !a.href.startsWith('javascript:')) {
                const currentUrl = new URL(window.location.href);
                const targetUrl = new URL(a.href);
                // Intercept only if it's pointing to a different path
                if (currentUrl.pathname !== targetUrl.pathname) {
                    e.preventDefault();
                    setPendingHref(a.href);
                    setShowExitDialog(true);
                }
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        document.addEventListener('click', handleAnchorClick, { capture: true })
        
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
            document.removeEventListener('click', handleAnchorClick, { capture: true })
        }
    }, [isModified])

    const handleExitWithoutSaving = () => {
        setShowExitDialog(false);
        setIsModified(false); // remove the block
        if (pendingHref) {
            window.location.href = pendingHref;
        }
    };

    const handleExitAndSave = async () => {
        await handleSave();
        setShowExitDialog(false);
        if (pendingHref) {
            window.location.href = pendingHref;
        }
    };

    // Undo / Redo Logic
    const commitHistory = useCallback((newElements: TemplateElement[]) => {
        setElements(newElements)
        setIsModified(true)

        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1)
            newHistory.push([...newElements])
            if (newHistory.length > MAX_HISTORY) {
                newHistory.shift()
            }
            return newHistory
        })
        setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1))
    }, [historyIndex])

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1
            setHistoryIndex(newIndex)
            setElements(history[newIndex])
            setIsModified(true)
            setSelectedIds([])
        }
    }, [history, historyIndex])

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1
            setHistoryIndex(newIndex)
            setElements(history[newIndex])
            setIsModified(true)
            setSelectedIds([])
        }
    }, [history, historyIndex])

    const updateSelectedElements = useCallback((updates: Partial<TemplateElement>) => {
        setElements(prev => {
            const newElements = prev.map(el => selectedIds.includes(el.id) ? { ...el, ...updates } : el)
            commitHistory(newElements)
            return newElements
        })
    }, [selectedIds, commitHistory])

    const removeSelectedElements = useCallback(() => {
        setElements(prev => {
            const newElements = prev.filter(el => !selectedIds.includes(el.id))
            commitHistory(newElements)
            return newElements
        })
        setSelectedIds([])
    }, [selectedIds, commitHistory])

    const duplicateSelectedElements = useCallback(() => {
        if (selectedIds.length === 0) return
        setElements(prev => {
            const toCopy = prev.filter(el => selectedIds.includes(el.id))
            const newEls = toCopy.map(el => ({ ...el, id: crypto.randomUUID(), x: el.x + 10, y: el.y + 10 }))
            const newElements = [...prev, ...newEls]
            commitHistory(newElements)
            setSelectedIds(newEls.map(e => e.id))
            return newElements
        })
    }, [selectedIds, commitHistory])

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isTyping = 
                ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName || '') || 
                (document.activeElement as HTMLElement)?.isContentEditable;

            // Undo: Ctrl+Z
            if (e.ctrlKey && e.key === 'z') {
                if (!isTyping) {
                    e.preventDefault()
                    undo()
                }
            }
            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
                if (!isTyping) {
                    e.preventDefault()
                    redo()
                }
            }

            // Delete key
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
                // Ensure we are not typing in a field
                if (!isTyping) {
                    e.preventDefault()
                    removeSelectedElements()
                }
            }

            // Copy & Paste (Ctrl+C, Ctrl+V)
            if (e.ctrlKey && e.key === 'c' && selectedIds.length > 0) {
                if (!isTyping) {
                    const toCopy = elements.filter(el => selectedIds.includes(el.id))
                    sessionStorage.setItem('template_clipboard', JSON.stringify(toCopy))
                    toast("Copiado al portapapeles")
                }
            }
            if (e.ctrlKey && e.key === 'v') {
                if (!isTyping) {
                    const stored = sessionStorage.getItem('template_clipboard')
                    if (stored) {
                        try {
                            const parsed: TemplateElement[] = JSON.parse(stored)
                            const newEls = parsed.map(el => ({ ...el, id: crypto.randomUUID(), x: el.x + 10, y: el.y + 10 }))
                            commitHistory([...elements, ...newEls])
                            setSelectedIds(newEls.map(e => e.id))
                        } catch (e) {
                            console.error(e)
                        }
                    }
                }
            }

            // Move with Arrows (1mm) or Shift + Arrows (5mm)
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIds.length > 0) {
                if (!isTyping) {
                    e.preventDefault()
                    const step = e.shiftKey ? 20 : 4 // 5mm vs 1mm (4px per mm)
                    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
                    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
                    
                    const newElements = elements.map(el => {
                        if (selectedIds.includes(el.id)) {
                            return { ...el, x: el.x + dx, y: el.y + dy }
                        }
                        return el
                    })
                    setElements(newElements)
                    // We only commit to history on discrete steps or we can use a debounced commit
                    // For simplicity, let's commit on each press if it's not a repeat, but repeat is actually common for fine tuning.
                    // If we commit on every repeat, the history fills up fast.
                    if (!e.repeat) {
                        commitHistory(newElements)
                    } else {
                        // If repeating, we'll just update the current state and commit on keyup or similar
                        // But useEffect doesn't easily track keyup without state. 
                        // Let's just commit for now to keep it simple and functional.
                        commitHistory(newElements)
                    }
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [undo, redo, selectedIds, elements, commitHistory, removeSelectedElements])

    const handleSave = async () => {
        setIsSaving(true)
        const res = await updateTemplate(template.id, {
            elements_json: JSON.stringify(elements),
            export_formats: exportFormats.join(',')
        })
        setIsSaving(false)

        if (res.success) {
            toast.success("Plantilla guardada correctamente")
            setIsModified(false)
        } else {
            toast.error("Error al guardar: " + res.error)
        }
    }

    const handleTogglePreview = async () => {
        if (!isPreviewMode) {
            if (!previewData) {
                const data = await getPreviewProduct()
                setPreviewData(data)
            }
        }
        setIsPreviewMode(!isPreviewMode)
    }

    const addElement = (type: TemplateElementType) => {
        const newEl: TemplateElement = {
            id: crypto.randomUUID(),
            type,
            x: 20,
            y: 20,
            width: type === 'barcode' ? 120 : (type === 'dashed_line' ? CANVAS_WIDTH - 40 : 100),
            height: type === 'barcode' ? 40 : (type === 'dashed_line' ? 2 : 30),
            content: type === 'text' ? 'Texto Nuevo' : undefined,
            dataField: type === 'dynamic_text' ? 'final_name_es' : undefined,
            fontSize: 10, // Default 10 pt
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'left',
            fontFamily: 'Montserrat',
            borderStyle: type === 'dashed_line' ? 'dashed' : 'solid',
            borderWidth: type === 'dashed_line' ? 2 : 0,
            required: false
        }

        if (type === 'image') {
            newEl.content = 'logo_empresa'
            newEl.width = 150
            newEl.height = 50
        }

        commitHistory([...elements, newEl])
        setSelectedIds([newEl.id])
    }

    // Remove un-hoisted funcs
    // Align Tools
    const alignElements = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        if (selectedIds.length < 2) return
        const selectedEls = elements.filter(el => selectedIds.includes(el.id))
        const newElements = elements.map(el => {
            if (!selectedIds.includes(el.id)) return el
            let newX = el.x
            let newY = el.y

            if (alignment === 'left') {
                newX = Math.min(...selectedEls.map(e => e.x))
            } else if (alignment === 'right') {
                const maxX = Math.max(...selectedEls.map(e => e.x + e.width))
                newX = maxX - el.width
            } else if (alignment === 'center') {
                const minX = Math.min(...selectedEls.map(e => e.x))
                const maxX = Math.max(...selectedEls.map(e => e.x + e.width))
                const centerX = (minX + maxX) / 2
                newX = centerX - (el.width / 2)
            } else if (alignment === 'top') {
                newY = Math.min(...selectedEls.map(e => e.y))
            } else if (alignment === 'bottom') {
                const maxY = Math.max(...selectedEls.map(e => e.y + e.height))
                newY = maxY - el.height
            } else if (alignment === 'middle') {
                const minY = Math.min(...selectedEls.map(e => e.y))
                const maxY = Math.max(...selectedEls.map(e => e.y + e.height))
                const centerY = (minY + maxY) / 2
                newY = centerY - (el.height / 2)
            }
            return { ...el, x: Math.round(newX), y: Math.round(newY) }
        })
        commitHistory(newElements)
    }

    const alignWorkspace = (alignment: 'center_h' | 'center_v') => {
        if (selectedIds.length !== 1) return
        const el = elements.find(e => e.id === selectedIds[0])
        if (!el) return

        const newElements = elements.map(e => {
            if (e.id === el.id) {
                if (alignment === 'center_h') {
                    return { ...e, x: Math.round((CANVAS_WIDTH / 2) - (e.width / 2)) }
                } else if (alignment === 'center_v') {
                    return { ...e, y: Math.round((CANVAS_HEIGHT / 2) - (e.height / 2)) }
                }
            }
            return e
        })
        commitHistory(newElements)
    }

    // Drag, Drop and Resize Implementation
    const handleCanvasClick = (e: MouseEvent) => {
        if (e.target === canvasRef.current) {
            setSelectedIds([])
        }
    }

    const handleMouseDownOnElement = (e: MouseEvent, id: string) => {
        e.stopPropagation()
        let newSelectedIds = [...selectedIds]

        if (e.shiftKey) {
            if (newSelectedIds.includes(id)) {
                newSelectedIds = newSelectedIds.filter(i => i !== id)
            } else {
                newSelectedIds.push(id)
            }
        } else {
            if (!newSelectedIds.includes(id)) {
                newSelectedIds = [id]
            }
        }

        setSelectedIds(newSelectedIds)

        if (!canvasRef.current || newSelectedIds.length === 0) return
        const rect = canvasRef.current.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const offsets = newSelectedIds.map(selectedId => {
            const el = elements.find(el => el.id === selectedId)
            return el ? { id: selectedId, offsetX: mouseX - el.x, offsetY: mouseY - el.y } : null
        }).filter(Boolean) as any[]

        setDragOffsets(offsets)
        setIsDragging(true)
    }

    const handleResizeMouseDown = (e: MouseEvent, id: string, handle: string) => {
        e.stopPropagation()
        setSelectedIds([id])
        setResizingElementId(id)

        const el = elements.find(el => el.id === id)
        if (!el || !canvasRef.current) return

        setResizeStartMouse({ x: e.clientX, y: e.clientY })
        setResizeStartRect({ x: el.x, y: el.y, w: el.width, h: el.height })
        setResizeHandle(handle)
        setIsResizing(true)
    }

    useEffect(() => {
        const handleMouseMove = (e: globalThis.MouseEvent) => {
            if (isDragging && selectedIds.length > 0 && canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect()
                const mouseX = e.clientX - rect.left
                const mouseY = e.clientY - rect.top

                setElements(prev => prev.map(el => {
                    if (selectedIds.includes(el.id)) {
                        const offset = dragOffsets.find(o => o.id === el.id)
                        if (offset) {
                            return { ...el, x: Math.round(mouseX - offset.offsetX), y: Math.round(mouseY - offset.offsetY) }
                        }
                    }
                    return el
                }))
            } else if (isResizing && resizingElementId && resizeStartRect && resizeStartMouse) {
                const dx = e.clientX - resizeStartMouse.x
                const dy = e.clientY - resizeStartMouse.y

                setElements(prev => prev.map(el => {
                    if (el.id === resizingElementId) {
                        let { x, y, w, h } = resizeStartRect

                        if (resizeHandle?.includes('e')) w += dx
                        if (resizeHandle?.includes('w')) { w -= dx; x += dx }
                        if (resizeHandle?.includes('s')) h += dy
                        if (resizeHandle?.includes('n')) { h -= dy; y += dy }

                        // Minimum size constrains
                        if (w < 2) { w = 2; x = el.x }
                        if (h < 2) { h = 2; y = el.y }

                        return { ...el, x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) }
                    }
                    return el
                }))
            }
        }

        const handleMouseUp = () => {
            if (isDragging || isResizing) {
                // Determine if state actually changed before committing to history
                // (Optimization: only commit when mouse is released to avoid overwhelming history)
                commitHistory(elements)
            }
            setIsDragging(false)
            setIsResizing(false)
            setResizingElementId(null)
            setResizeHandle(null)
        }

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging, isResizing, selectedIds, dragOffsets, resizeStartRect, resizeStartMouse, resizeHandle, resizingElementId, commitHistory, elements])

    const activeEl = selectedIds.length === 1 ? elements.find(e => e.id === selectedIds[0]) : null

    // Helper to render Resize Handles
    const renderResizeHandles = (el: TemplateElement) => {
        if (!selectedIds.includes(el.id) || selectedIds.length > 1) return null;

        const handleClass = "absolute w-3 h-3 bg-white border border-blue-600 rounded-full z-20 hover:scale-125 transition-transform"
        return (
            <>
                {/* Corners */}
                <div className={`${handleClass} -top-1.5 -left-1.5 cursor-nwse-resize`} onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'nw')} />
                <div className={`${handleClass} -top-1.5 -right-1.5 cursor-nesw-resize`} onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'ne')} />
                <div className={`${handleClass} -bottom-1.5 -left-1.5 cursor-nesw-resize`} onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'sw')} />
                <div className={`${handleClass} -bottom-1.5 -right-1.5 cursor-nwse-resize`} onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'se')} />
                {/* Edges */}
                <div className={`${handleClass} top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize`} onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'w')} />
                <div className={`${handleClass} top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize`} onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'e')} />
                <div className={`${handleClass} left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize`} onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'n')} />
                <div className={`${handleClass} left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize`} onMouseDown={(e) => handleResizeMouseDown(e, el.id, 's')} />
            </>
        )
    }

    return (
        <div className="flex flex-col gap-4 xl:flex-row h-full">
            {/* Toolbar / Canvas Area */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
                    <div className="flex gap-2 flex-wrap items-center">
                        <Button variant="outline" size="sm" onClick={() => addElement('text')}>
                            <Type className="h-4 w-4 mr-2" /> Texto
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addElement('dynamic_text')}>
                            <Box className="h-4 w-4 mr-2" /> Variable
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addElement('image')}>
                            <ImageIcon className="h-4 w-4 mr-2" /> Imagen/Logo
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addElement('barcode')}>
                            ||| Barcode
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addElement('dashed_line')}>
                            <Minus className="h-4 w-4 mr-2" /> Línea
                        </Button>

                        <div className="h-6 w-px bg-gray-200 mx-1" />

                        <Button variant="ghost" size="icon" disabled={historyIndex <= 0} onClick={undo} title="Deshacer (Ctrl+Z)">
                            <Undo2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={historyIndex >= history.length - 1} onClick={redo} title="Rehacer (Ctrl+Y)">
                            <Redo2 className="h-4 w-4" />
                        </Button>

                        {/* Alignment Tools (Visible when multiple elements are selected) */}
                        {selectedIds.length > 1 && (
                            <div className="flex ml-2 border-l pl-2 gap-1 bg-slate-50 rounded-md p-1">
                                <Button title="Alinear a la Izquierda" variant="ghost" size="icon-sm" onClick={() => alignElements('left')}><AlignHorizontalJustifyStart className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear al Centro Horizontal" variant="ghost" size="icon-sm" onClick={() => alignElements('center')}><AlignHorizontalSpaceAround className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear a la Derecha" variant="ghost" size="icon-sm" onClick={() => alignElements('right')}><AlignHorizontalJustifyStart className="h-4 w-4 text-blue-600 rotate-180" /></Button>
                                <Button title="Alinear Arriba" variant="ghost" size="icon-sm" onClick={() => alignElements('top')}><AlignVerticalJustifyStart className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear al Centro Vertical" variant="ghost" size="icon-sm" onClick={() => alignElements('middle')}><AlignVerticalSpaceAround className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear Abajo" variant="ghost" size="icon-sm" onClick={() => alignElements('bottom')}><AlignVerticalJustifyStart className="h-4 w-4 text-blue-600 rotate-180" /></Button>
                            </div>
                        )}

                        {/* Alignment Workspace (Visible when 1 element is selected) */}
                        {selectedIds.length === 1 && (
                            <div className="flex ml-2 border-l pl-2 gap-1">
                                <Button title="Centrar Horizontalmente en Lienzo" variant="ghost" size="icon-sm" onClick={() => alignWorkspace('center_h')}><AlignHorizontalSpaceAround className="h-4 w-4" /></Button>
                                <Button title="Centrar Verticalmente en Lienzo" variant="ghost" size="icon-sm" onClick={() => alignWorkspace('center_v')}><AlignVerticalSpaceAround className="h-4 w-4" /></Button>
                            </div>
                        )}

                        {selectedIds.length > 0 && (
                            <div className="flex ml-2 border-l pl-2 gap-1">
                                <Button title="Duplicar (Ctrl+C & Ctrl+V)" variant="ghost" size="icon-sm" onClick={duplicateSelectedElements}><Copy className="h-4 w-4 text-green-600" /></Button>
                                <Button title="Eliminar (Supr)" variant="ghost" size="icon-sm" onClick={removeSelectedElements}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                            </div>
                        )}

                    </div>
                    <div className="flex gap-2 items-center">
                        <Button variant={isPreviewMode ? 'default' : 'secondary'} className={isPreviewMode ? 'bg-indigo-600 hover:bg-indigo-700' : ''} onClick={handleTogglePreview}>
                            {isPreviewMode ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                            {isPreviewMode ? 'Salir de Preview' : 'Live Preview'}
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving || !isModified}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {isModified ? '* Guardar Cambios' : 'Guardar Plantilla'}
                        </Button>
                    </div>
                </div>

                {/* The Canvas Area */}
                <div className="flex-1 overflow-auto bg-slate-100 p-8 rounded-xl border flex items-center justify-center relative shadow-inner min-h-[500px]">
                    <div
                        ref={canvasRef}
                        onMouseDown={handleCanvasClick}
                        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
                        className="bg-white shadow-xl relative ring-1 ring-slate-200 shrink-0 origin-center select-none overflow-hidden"
                    >
                        {/* Render elements */}
                        {elements.map((el) => {
                            const isSelected = selectedIds.includes(el.id);
                            return (
                                <div
                                    key={el.id}
                                    onMouseDown={(e) => handleMouseDownOnElement(e, el.id)}
                                    className={`absolute flex items-center justify-center cursor-move ${isSelected ? 'ring-1 ring-blue-500 z-10' : 'hover:ring-1 hover:ring-blue-300 border border-transparent hover:border-dashed hover:border-gray-400'
                                        }`}
                                    style={{
                                        left: el.x,
                                        top: el.y,
                                        width: el.width,
                                        height: el.height,
                                        fontSize: `${el.fontSize}pt`,
                                        fontWeight: el.fontWeight as 'normal' | 'bold' | '500',
                                        fontStyle: el.fontStyle,
                                        fontFamily: el.fontFamily === 'Montserrat' ? 'var(--font-montserrat), sans-serif' : 'inherit',
                                    }}
                                >
                                    {renderResizeHandles(el)}

                                    {/* Dashed/Solid Line type */}
                                    {el.type === 'dashed_line' && (
                                        <div
                                            className="w-full h-full border-gray-800"
                                            style={{
                                                borderBottomStyle: el.borderStyle || 'solid',
                                                borderBottomWidth: el.borderWidth || 2
                                            }}
                                        />
                                    )}

                                    {/* Image type */}
                                    {el.type === 'image' && (
                                        <div className="w-full h-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50/50 overflow-hidden">
                                            {isPreviewMode ? (
                                                (() => {
                                                    // 1. Try to find in generic placeholders
                                                    if (el.content === 'logo_empresa') {
                                                        const logoAsset = assets.find(a => a.type === 'logo' && a.name.toLowerCase().includes('logo'));
                                                        if (logoAsset) return <img src={logoAsset.file_path} className="max-w-full max-h-full object-contain pointer-events-none" />
                                                        return <span className="text-gray-400 text-[10px] text-center">[Logo Empresa No Encontrado]</span>
                                                    }

                                                    if (el.content === 'isometrico_placeholder') {
                                                        if (previewData?.isometric_path) {
                                                            return <img src={previewData.isometric_path} className="max-w-full max-h-full object-contain pointer-events-none" />
                                                        }
                                                        return <span className="text-gray-400 text-[10px] text-center">[Isometrico Placeholder]</span>
                                                    }

                                                    // 2. Try to find by direct ID or Name in assets
                                                    const asset = assets.find(a => a.id === el.content || a.name === el.content);
                                                    if (asset) {
                                                        return <img src={asset.file_path} className="max-w-full max-h-full object-contain pointer-events-none" />
                                                    }

                                                    return <span className="text-gray-400 text-xs font-semibold pointer-events-none p-1 text-center bg-white/70 rounded">[{el.content}]</span>
                                                })()
                                            ) : (
                                                <span className="text-gray-400 text-xs font-semibold pointer-events-none p-1 text-center bg-white/70 rounded">[{el.content}]</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Barcode type */}
                                    {el.type === 'barcode' && (
                                        <div className="w-full h-full bg-slate-800 pointer-events-none text-white text-xs flex items-center justify-center opacity-70 overflow-hidden">
                                            ||| BARCODE {isPreviewMode && previewData && previewData[el.dataField || ''] ? `(${previewData[el.dataField || '']})` : ''} |||
                                        </div>
                                    )}

                                    {/* Text types */}
                                    {(el.type === 'dynamic_text' || el.type === 'text') && (
                                        <OverflowText
                                            text={el.type === 'dynamic_text' ? `{${el.dataField}}` : (el.content || '')}
                                            textAlign={el.textAlign}
                                            isPreviewMode={isPreviewMode}
                                            type={el.type}
                                            previewData={previewData}
                                            dataField={el.dataField}
                                            lineHeight={el.lineHeight}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Properties Panel */}
            <div className="w-full xl:w-80 flex flex-col shrink-0 h-[calc(100vh-220px)] sticky top-4">
                <Card className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 shadow-inner">
                    <div className="p-4 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Box className="h-4 w-4 text-indigo-500" />
                            Propiedades
                        </h3>
                        {selectedIds.length > 1 && (
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                {selectedIds.length} ítems
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar pb-12">
                    {activeEl ? (
                        <div className="flex flex-col gap-5">
                            <div>
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Tipo de Elemento</Label>
                                <Input value={activeEl.type.replace('_', ' ').toUpperCase()} disabled className="bg-muted text-xs font-semibold shadow-none border-transparent" />
                            </div>

                            {/* Required Field Toggle */}
                            {(activeEl.type === 'text' || activeEl.type === 'dynamic_text' || activeEl.type === 'image' || activeEl.type === 'barcode') && (
                                <div className="flex items-center space-x-2 bg-slate-100 p-2 rounded-md border border-slate-200">
                                    <input 
                                        type="checkbox" 
                                        id="required-toggle"
                                        checked={activeEl.required || false}
                                        onChange={(e) => updateSelectedElements({ required: e.target.checked })}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <Label htmlFor="required-toggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                                        Campo Obligatorio (Bloquea Exportación si está vacío)
                                    </Label>
                                </div>
                            )}

                            {activeEl.type === 'dynamic_text' && (
                                <div>
                                    <Label className="text-xs text-slate-700 font-semibold mb-1 block">Campo de Datos (Variable)</Label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={activeEl.dataField || ''}
                                        onChange={(e) => updateSelectedElements({ dataField: e.target.value })}
                                    >
                                        <option value="" disabled>-- Selecciona una variable --</option>
                                        <option value="final_name_es">Nombre (ES)</option>
                                        <option value="final_name_en">Nombre (EN)</option>
                                        <option value="code">Código Artículo (SKU)</option>
                                        <option value="sku_base">SKU Sin Color</option>
                                        <option value="barcode_text">Código de Barras EAN</option>
                                        <option value="color">Color (Nombre)</option>
                                        <option value="color_code">Color (Código)</option>
                                        <option value="sap_description">Descripción SAP</option>
                                        <option value="furniture_name">Nombre Mueble Genérico</option>
                                        <option value="line">Línea</option>
                                        <option value="commercial_measure">Medida Comercial</option>
                                        <option value="use_destination">Uso</option>
                                        <option value="zone_home">Zona</option>
                                        <option value="width_cm">Ancho (cm)</option>
                                        <option value="depth_cm">Fondo (cm)</option>
                                        <option value="height_cm">Alto (cm)</option>
                                        <option value="weight_kg">Peso (kg)</option>
                                        <option value="width_in">Ancho (in)</option>
                                        <option value="depth_in">Fondo (in)</option>
                                        <option value="height_in">Alto (in)</option>
                                        <option value="weight_lb">Peso (lb)</option>
                                    </select>
                                </div>
                            )}

                            {activeEl.type === 'text' && (
                                <div>
                                    <Label className="text-xs text-slate-700 font-semibold mb-1 block">Contenido del Texto Libre</Label>
                                    <RichTextEditor 
                                        content={activeEl.content || ''}
                                        onChange={(val) => updateSelectedElements({ content: val })}
                                        onInsertVariable={(v) => {
                                            const current = activeEl.content || ''
                                            updateSelectedElements({ content: current + `{${v}}` })
                                        }}
                                    />
                                    <span className="text-[10px] text-gray-500 mt-1 block">Puedes seleccionar una palabra y usar los botones para ponerla en <b>Negrita</b>, <i>Cursiva</i>, etc.</span>
                                </div>
                            )}

                            {activeEl.type === 'image' && (
                                <div>
                                    <Label className="text-xs text-slate-700 font-semibold mb-1 block">Recurso / Imagen</Label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={activeEl.content || ''}
                                        onChange={(e) => updateSelectedElements({ content: e.target.value })}
                                    >
                                        <option value="logo_empresa">Logo Empresa Pordefecto</option>
                                        <option value="isometrico_placeholder">Isométrico (Placeholder)</option>
                                        <option value="icon_rh">Icono RH Fijo</option>
                                        <option value="icon_edge_2mm">Icono Canto 2mm</option>
                                        <option value="icon_soft_close">Icono Cierre Lento</option>
                                        <option value="icon_full_extension">Icono Extensión Total</option>

                                        {assets.length > 0 && <optgroup label="Assets (Base de Datos)">
                                            {assets.map(a => (
                                                <option key={a.id} value={a.id}>{a.name}</option>
                                            ))}
                                        </optgroup>}
                                    </select>
                                </div>
                            )}

                            {activeEl.type === 'barcode' && (
                                <div>
                                    <Label className="text-xs text-slate-700 font-semibold mb-1 block">Variable a codificar en Barras</Label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={activeEl.dataField || ''}
                                        onChange={(e) => updateSelectedElements({ dataField: e.target.value })}
                                    >
                                        <option value="barcode_text">Campo de Código de Barras EAN</option>
                                        <option value="code">Código SKU</option>
                                    </select>
                                </div>
                            )}

                            {activeEl.type === 'dashed_line' && (
                                <div className="space-y-4 border-t pt-4 border-slate-200">
                                    <Label className="font-semibold text-xs text-muted-foreground uppercase flex items-center">Estilo de Línea</Label>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Grosor (px)</Label>
                                            <Input type="number" className="bg-white h-8" value={activeEl.borderWidth || 2} onChange={(e) => updateSelectedElements({ borderWidth: parseInt(e.target.value) || 1 })} />
                                        </div>
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Estilo</Label>
                                            <select
                                                className="flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                value={activeEl.borderStyle || 'solid'}
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                onChange={(e) => updateSelectedElements({ borderStyle: e.target.value as any })}
                                            >
                                                <option value="solid">Continua (___)</option>
                                                <option value="dashed">Punteada (- - -)</option>
                                                <option value="dotted">Puntos (. . .)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(activeEl.type === 'text' || activeEl.type === 'dynamic_text') && (
                                <div className="space-y-4 border-t pt-4 border-slate-200">
                                    <Label className="font-semibold text-xs text-muted-foreground uppercase flex items-center">Tipografía (Fuente de Letra)</Label>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Tamaño (Puntos - pt)</Label>
                                            <Input type="number" className="bg-white h-8" value={activeEl.fontSize || 10} onChange={(e) => updateSelectedElements({ fontSize: parseInt(e.target.value) || 10 })} />
                                        </div>
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Interlineado (Ej: 0.9)</Label>
                                            <Input type="number" step="0.1" className="bg-white h-8" value={activeEl.lineHeight || 1.2} onChange={(e) => updateSelectedElements({ lineHeight: parseFloat(e.target.value) || 1.2 })} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Alineación Horizontal</Label>
                                            <div className="flex gap-1">
                                                <Button size="icon" variant={activeEl.textAlign === 'left' ? 'default' : 'outline'} className="h-8 w-8 bg-white" onClick={() => updateSelectedElements({ textAlign: 'left' })}>
                                                    <AlignLeft className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant={activeEl.textAlign === 'center' ? 'default' : 'outline'} className="h-8 w-8 bg-white" onClick={() => updateSelectedElements({ textAlign: 'center' })}>
                                                    <AlignCenter className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant={activeEl.textAlign === 'right' ? 'default' : 'outline'} className="h-8 w-8 bg-white" onClick={() => updateSelectedElements({ textAlign: 'right' })}>
                                                    <AlignRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Peso de Fuente</Label>
                                            <select
                                                className="flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                value={activeEl.fontWeight}
                                                onChange={(e) => updateSelectedElements({ fontWeight: e.target.value })}
                                            >
                                                <option value="normal">Normal (Regular)</option>
                                                <option value="500">Semi-Bold (Medium)</option>
                                                <option value="bold">Negrilla (Bold)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Cursiva</Label>
                                            <div className="flex gap-1">
                                                <Button size="sm" variant={activeEl.fontStyle === 'italic' ? 'default' : 'outline'} className="h-8 w-full bg-white text-xs" onClick={() => updateSelectedElements({ fontStyle: activeEl.fontStyle === 'italic' ? 'normal' : 'italic' })}>
                                                    <Italic className="h-3 w-3 mr-1" /> Activar
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4 border-t pt-4 border-slate-200">
                                <Label className="font-semibold text-xs text-muted-foreground uppercase">Medidas y Posición (Milímetros)</Label>
                                <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-md border">
                                    <div>
                                        <Label className="text-[10px] text-slate-500 mb-1 block">Eje X (Izquierda)</Label>
                                        <div className="relative">
                                            <Input type="number" step="0.5" className="h-8 text-sm pr-7" value={activeEl.x / PIXELS_PER_MM} onChange={(e) => updateSelectedElements({ x: Math.round(parseFloat(e.target.value) * PIXELS_PER_MM) || 0 })} />
                                            <span className="absolute right-2 top-2 text-[10px] text-gray-400">mm</span>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500 mb-1 block">Eje Y (Arriba)</Label>
                                        <div className="relative">
                                            <Input type="number" step="0.5" className="h-8 text-sm pr-7" value={activeEl.y / PIXELS_PER_MM} onChange={(e) => updateSelectedElements({ y: Math.round(parseFloat(e.target.value) * PIXELS_PER_MM) || 0 })} />
                                            <span className="absolute right-2 top-2 text-[10px] text-gray-400">mm</span>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500 mb-1 block">Ancho Total</Label>
                                        <div className="relative">
                                            <Input type="number" step="0.5" className="h-8 text-sm pr-7" value={activeEl.width / PIXELS_PER_MM} onChange={(e) => updateSelectedElements({ width: Math.round(parseFloat(e.target.value) * PIXELS_PER_MM) || 10 })} />
                                            <span className="absolute right-2 top-2 text-[10px] text-gray-400">mm</span>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500 mb-1 block">Alto Total</Label>
                                        <div className="relative">
                                            <Input type="number" step="0.5" className="h-8 text-sm pr-7" value={activeEl.height / PIXELS_PER_MM} onChange={(e) => updateSelectedElements({ height: Math.round(parseFloat(e.target.value) * PIXELS_PER_MM) || 10 })} />
                                            <span className="absolute right-2 top-2 text-[10px] text-gray-400">mm</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : selectedIds.length > 1 ? (
                        <div className="text-muted-foreground text-sm text-center py-10 flex flex-col items-center bg-white rounded-lg border border-dashed">
                            <Box className="h-10 w-10 mb-3 text-indigo-400" />
                            <span className="font-semibold text-slate-700">Múltiples elementos</span>
                            <span className="text-xs mt-1 px-4">{selectedIds.length} elementos seleccionados. Usa las herramientas de la barra superior.</span>
                        </div>
                    ) : (
                        <div className="text-muted-foreground text-sm text-center py-10 flex flex-col items-center bg-white rounded-lg border border-dashed opacity-60 hover:opacity-100 transition-opacity">
                            <Move className="h-10 w-10 mb-3 text-slate-300" />
                            Selecciona un elemento en el lienzo para configurar medidas.
                        </div>
                    )}

                    {/* Global Template Settings (Visible when NO elements are selected) */}
                    {!activeEl && selectedIds.length === 0 && (
                        <div className="space-y-4 border-t pt-4 border-slate-200">
                            <Label className="font-semibold text-xs text-muted-foreground uppercase flex items-center">Configuración de Plantilla</Label>
                            
                            <div className="flex flex-col gap-3">
                                <Label className="text-xs font-bold text-slate-700">Formatos de Exportación Permitidos</Label>
                                <div className="flex gap-2">
                                    {(['pdf', 'jpg'] as const).map(fmt => (
                                        <button
                                            key={fmt}
                                            onClick={() => {
                                                const newFormats = exportFormats.includes(fmt)
                                                    ? exportFormats.filter(f => f !== fmt)
                                                    : [...exportFormats, fmt]
                                                if (newFormats.length > 0) {
                                                    setExportFormats(newFormats)
                                                    setIsModified(true)
                                                } else {
                                                    toast.error("Debes permitir al menos un formato")
                                                }
                                            }}
                                            className={`flex-1 py-2 px-3 text-xs font-bold rounded-md border transition-all ${
                                                exportFormats.includes(fmt)
                                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                            }`}
                                        >
                                            {fmt.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    Define qué formatos podrán elegir los usuarios al exportar productos con esta plantilla.
                                </p>
                            </div>

                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-md mt-4">
                                <p className="text-[10px] text-amber-700 leading-tight">
                                    <b>Tipografía:</b> Esta plantilla utiliza <b>Montserrat</b> por defecto. Asegúrate de que los textos sean legibles antes de guardar.
                                </p>
                            </div>
                        </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Exit Warning Dialog */}
            <Dialog open={showExitDialog} onOpenChange={(open) => {
                if (!open) {
                    setShowExitDialog(false)
                    setPendingHref(null)
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>¡Cuidado! Tienes cambios sin guardar</DialogTitle>
                        <DialogDescription className="pt-2">
                            Si sales ahora de la edición de la plantilla, perderás las modificaciones recientes que no has guardado. ¿Qué deseas hacer?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
                        <Button variant="outline" onClick={() => setShowExitDialog(false)}>
                            Cancelar la acción
                        </Button>
                        <Button variant="destructive" onClick={handleExitWithoutSaving}>
                            Sí, salir sin guardar
                        </Button>
                        <Button variant="default" onClick={handleExitAndSave} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Guardar y seguir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    )
}
