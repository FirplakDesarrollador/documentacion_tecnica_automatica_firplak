'use client'

import React, { useState, useRef, useEffect, MouseEvent, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlusCircle, Save, Type, Image as ImageIcon, Box, Move, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Loader2, Eye, EyeOff, Minus, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, AlignHorizontalJustifyStart, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter, AlignVerticalJustifyEnd, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Undo2, Redo2, Copy, Trash2, Settings, BookOpen, Shuffle, RotateCcw, LayoutGrid, Combine, FileText, FileEdit, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { updateTemplate, getPreviewProduct, getRandomPreviewProduct, validateExportFilenameLength } from '@/app/templates/actions'
import { getDatasetsAction, FieldDef } from '@/app/datasets/actions'
import { resolveAssetsAction } from '@/app/generate/actions'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { enrichProductDataWithIcons } from '@/lib/engine/productUtils'
import { PIXELS_PER_MM } from '@/lib/constants'
import { hydrateText } from '@/lib/export/exportUtils'
import { resolveZoneHomeEnAction } from '@/app/products/actions'

export type TemplateElementType = 'text' | 'dynamic_text' | 'image' | 'barcode' | 'box' | 'dashed_line' | 'dynamic_image' | 'icon_group'

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
    verticalAlign?: 'top' | 'middle' | 'bottom'
    fontFamily?: string
    borderStyle?: 'solid' | 'dashed' | 'dotted' // used for lines/boxes
    borderWidth?: number
    required?: boolean
    lineHeight?: number
    letterSpacing?: number
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'sentence'
    // dynamic_image specific fields
    caption?: string                                      // Free text displayed below the icon (supports \n for line breaks)
    captionFontSize?: number                             // pt, default 6.5
    captionTextAlign?: 'left' | 'center' | 'right'      // default 'center'
    iconSizeMM?: number                                  // fixed size in mm (e.g. 15, 20)
    captionGapMM?: number                                // space between icon and caption in mm
    
    // icon_group specific fields
    groupId?: string
    groupGapMM?: number
    groupAlign?: 'flex-start' | 'center' | 'flex-end' | 'space-between'
    groupWrap?: boolean
}


const MAX_HISTORY = 10

function OverflowText({ text, textAlign = 'left', verticalAlign = 'middle', isPreviewMode, type, previewData, dataField, fontSize, lineHeight, letterSpacing, textTransform, width, height }: { text: string, textAlign?: 'left' | 'center' | 'right' | undefined, verticalAlign?: 'top' | 'middle' | 'bottom' | undefined, isPreviewMode: boolean, type: string, previewData?: any, dataField?: string, fontSize?: number, lineHeight?: number, letterSpacing?: number, textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize', width?: number, height?: number, [key: string]: any }) {
    const textRef = useRef<HTMLDivElement>(null)
    const [isOverflowing, setIsOverflowing] = useState(false)
    const [adjustedFontSize, setAdjustedFontSize] = useState<number>(fontSize || 12)

    // Regex replacement for rich text variables
    const displayText = React.useMemo(() => {
        if (!isPreviewMode || !previewData) return text

        const { getVariableValue } = require('@/lib/export/exportUtils')

        if (type === 'dynamic_text') {
            const varName = text.replace(/[{}]/g, '');
            return getVariableValue(previewData, varName) || '[VACÍO]';
        }

        let interpolated = text
        const matches = text.match(/\{[^}]+\}/g)
        if (matches) {
            matches.forEach(match => {
                const varName = match.slice(1, -1)
                const replacement = getVariableValue(previewData, varName);
                interpolated = interpolated.replace(match, replacement || '[VACÍO]')
            })
        }
        return interpolated
    }, [text, isPreviewMode, previewData, type])

    // Initialize/Reset font scaling when content or boundaries change
    useEffect(() => {
        setAdjustedFontSize(fontSize || 12)
    }, [fontSize, displayText, width, height])

    useEffect(() => {
        if (!textRef.current || !isPreviewMode) {
            setIsOverflowing(false)
            return
        }

        const checkOverflow = () => {
            if (!textRef.current) return;
            const el = textRef.current
            // Tolerar 4px de redondeo/line-height
            const hasOverflow = (el.scrollHeight > el.clientHeight + 4) || (el.scrollWidth > el.clientWidth + 4)
            
            // Si hay desbordamiento y podemos bajar más la fuente, lo hacemos
            if (hasOverflow && adjustedFontSize > 5) {
                setAdjustedFontSize(prev => Math.max(5, prev - 0.5))
            } else {
                // Si ya no podemos bajar más o ya no desborda, actualizamos el estado visual de error
                setIsOverflowing(hasOverflow)
            }
        }

        // Delay mínimo para permitir que el DOM se asiente antes de medir
        const timer = setTimeout(checkOverflow, 30)
        return () => clearTimeout(timer)
    }, [displayText, isPreviewMode, adjustedFontSize, width, height])

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
            className={`w-full h-full overflow-hidden pointer-events-none flex flex-col ${verticalAlign === 'top' ? 'justify-start' : verticalAlign === 'bottom' ? 'justify-end' : 'justify-center'} ${isOverflowing ? 'ring-2 ring-red-500 bg-red-100/50' : ''}`}
        >
            {isOverflowing && <span className="absolute -top-5 left-0 bg-red-500 text-white text-[9px] px-1 rounded shadow-sm z-50 pointer-events-none">Desbordamiento</span>}
            <div style={{ 
                textAlign, 
                width: '100%', 
                wordBreak: 'break-word', 
                whiteSpace: 'pre-wrap', 
                padding: '0 2px', 
                fontSize: isPreviewMode ? `${adjustedFontSize}pt` : undefined,
                lineHeight: lineHeight || 1.2,
                letterSpacing: letterSpacing ? `${letterSpacing}em` : undefined
            }}>
                {renderTextContent()}
            </div>
        </div>
    )
}

function DynamicImageElement({ 
    el, 
    isPreviewMode, 
    previewData 
}: { 
    el: TemplateElement, 
    isPreviewMode: boolean, 
    previewData: any 
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [innerOverflow, setInnerOverflow] = useState(false)
    const [adjustedCaptionFontSize, setAdjustedCaptionFontSize] = useState(el.captionFontSize || 6.5)
    
    useEffect(() => {
        setAdjustedCaptionFontSize(el.captionFontSize || 6.5)
    }, [el.caption, el.captionFontSize, el.width, el.height])

    useEffect(() => {
        if (!isPreviewMode || !containerRef.current) return
        const check = () => {
            const c = containerRef.current
            if (!c) return
            // Tolerancia de 4px para medir el desbordamiento
            const overflowing = (c.scrollHeight > c.clientHeight + 4) || (c.scrollWidth > c.clientWidth + 4)
            
            if (overflowing && adjustedCaptionFontSize > 4) {
                setAdjustedCaptionFontSize(prev => Math.max(4, prev - 0.5))
            } else {
                setInnerOverflow(overflowing)
            }
        }
        
        const timer = setTimeout(() => requestAnimationFrame(check), 50)
        return () => clearTimeout(timer)
    }, [el.caption, el.iconSizeMM, el.width, el.height, el.captionGapMM, isPreviewMode, adjustedCaptionFontSize])

    if (!isPreviewMode) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 border-2 border-dashed border-indigo-300 bg-indigo-50/40 rounded overflow-hidden pointer-events-none">
                <ImageIcon className="h-4 w-4 text-indigo-400 shrink-0" />
                <span className="text-[8px] text-indigo-600 font-bold text-center px-1 leading-tight tracking-tight">
                    {el.dataField || 'icono'}
                </span>
            </div>
        )
    }

    const iconUrl = previewData?.[`${el.dataField}_url`]
    if (!iconUrl) {
        if (el.groupId) return null; // Natural collapse inside flex groups
        return <div className="w-full h-full border border-dashed border-slate-200 rounded opacity-30 pointer-events-none" />
    }

    let rawCaption = el.caption || ''
    if (previewData) {
        rawCaption = rawCaption.replace(/\{([^}]+)\}/g, (match, key) => {
            if (key === 'color' || key === 'color_name' || key === 'name_color_sap') {
                return String(previewData.color_name || '[VACÍO]').replace(/\n/g, '<br>');
            }
            if (key === 'color_code') return String(previewData.color_code || '[VACÍO]').replace(/\n/g, '<br>');
            
            const contextKey = `${el.dataField}_${key}`;
            if (previewData[contextKey] !== undefined) return String(previewData[contextKey]).replace(/\n/g, '<br>');
            if (previewData[key] !== undefined) return String(previewData[key]).replace(/\n/g, '<br>');
            return match;
        });
    }
    const captionHtml = rawCaption.includes('<') ? rawCaption : rawCaption.replace(/\n/g, '<br>')
    const sizePx = (el.iconSizeMM || 15) * PIXELS_PER_MM
    const gapPx = (el.captionGapMM ?? 2) * PIXELS_PER_MM
    const vAlign = el.verticalAlign === 'top' ? 'justify-start' : el.verticalAlign === 'middle' ? 'justify-center' : 'justify-end'

    return (
        <div 
            ref={containerRef}
            className={cn(
                "w-full h-full flex flex-col items-center overflow-hidden pointer-events-none p-1 relative",
                vAlign,
                innerOverflow && "ring-2 ring-red-500 bg-red-100/50"
            )}
        >
            {innerOverflow && (
                <span className="absolute -top-5 left-0 bg-red-500 text-white text-[9px] px-1 rounded shadow-sm z-50">
                    Desbordamiento
                </span>
            )}
            <div 
                className="flex items-center justify-center min-h-0 w-full"
                style={{ marginBottom: rawCaption.trim() ? `${gapPx}px` : '0px' }}
            >
                <img
                    src={iconUrl}
                    alt={el.dataField}
                    style={{ 
                        width: sizePx, 
                        height: sizePx, 
                        minWidth: sizePx, 
                        minHeight: sizePx 
                    }}
                    className="object-contain shrink-0"
                />
            </div>
            {rawCaption.trim() && (
                <div
                    style={{ 
                        width: '100%', 
                        fontSize: `${adjustedCaptionFontSize}pt`, 
                        textAlign: el.captionTextAlign || 'center',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap'
                    }}
                    dangerouslySetInnerHTML={{ __html: captionHtml }}
                />
            )}
        </div>
    )
}



function RichTextEditor({ content, onChange, isExternalDataSource = false, datasetSchema = [] }: { content: string, onChange: (val: string) => void, isExternalDataSource?: boolean, datasetSchema?: FieldDef[] }) {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastRangeRef = useRef<Range | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lineHeightRef = useRef<HTMLInputElement>(null);
    const letterSpacingRef = useRef<HTMLInputElement>(null);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [currentWeight, setCurrentWeight] = useState('normal');

    // Initial load only if empty
    useEffect(() => {
        if (editorRef.current && content && editorRef.current.innerHTML !== content) {
            editorRef.current.innerHTML = content;
        }
    }, [content]);

    // Update input value when selection changes
    useEffect(() => {
        const handleSelectionChange = () => {
            if (editorRef.current && window.getSelection()?.rangeCount && editorRef.current.contains(window.getSelection()?.anchorNode || null)) {
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) return;
                let node = selection.anchorNode;
                if (node?.nodeType === 3) node = node.parentNode;
                const element = node as HTMLElement;
                const style = window.getComputedStyle(element);

                // Update Font Size Input
                if (!isInputFocused && inputRef.current) {
                    const currentPx = parseFloat(style.fontSize);
                    const currentPt = Math.round(currentPx * 0.75 * 2) / 2;
                    inputRef.current.value = currentPt.toString();
                }

                // Update Line Height Input
                if (lineHeightRef.current && !isInputFocused) {
                    const style = window.getComputedStyle(element);
                    const lh = style.lineHeight;
                    let val = 1.2;
                    if (lh === 'normal') val = 1.2;
                    else if (lh.includes('px')) val = Math.round((parseFloat(lh) / parseFloat(style.fontSize)) * 100) / 100;
                    else val = parseFloat(lh);

                    // SEARCH FOR data-lh (high precision)
                    let el: HTMLElement | null = element;
                    while (el && el !== editorRef.current) {
                        const saved = el.getAttribute('data-lh');
                        if (saved) { val = parseFloat(saved); break; }
                        el = el.parentElement;
                    }
                    lineHeightRef.current.value = (!isNaN(val) ? val.toFixed(2) : '1.20');
                }

                // Update Letter Spacing Input
                if (letterSpacingRef.current && !isInputFocused) {
                    const style = window.getComputedStyle(element);
                    const ls = style.letterSpacing;
                    let ratio = 0;
                    if (ls !== 'normal' && ls !== '0px') {
                        const px = parseFloat(ls);
                        const fs = parseFloat(style.fontSize);
                        ratio = (!isNaN(px) && !isNaN(fs) && fs > 0) ? Math.round((px / fs) * 100) / 100 : 0;
                    }

                    // SEARCH FOR data-ls (high precision)
                    let el: HTMLElement | null = element;
                    while (el && el !== editorRef.current) {
                        const saved = el.getAttribute('data-ls');
                        if (saved) { ratio = parseFloat(saved); break; }
                        el = el.parentElement;
                    }
                    letterSpacingRef.current.value = (!isNaN(ratio) ? ratio.toFixed(2) : '0.00');
                }

                // Update Weight State
                const weight = style.fontWeight;
                if (weight === '400' || weight === 'normal') setCurrentWeight('normal');
                else if (weight === '500') setCurrentWeight('500');
                else if (parseInt(weight) >= 600 || weight === 'bold') setCurrentWeight('bold');
            }
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [isInputFocused]);

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

    const getSelectionLh = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !editorRef.current) return 1.2;
        let node = selection.anchorNode;
        if (node?.nodeType === 3) node = node.parentNode;
        
        // Search for data-lh in hierarchy (higher precision source)
        let el = node as HTMLElement;
        while (el && el !== editorRef.current) {
            const dLh = el.getAttribute('data-lh');
            if (dLh) return parseFloat(dLh);
            el = el.parentElement as HTMLElement;
        }

        const style = window.getComputedStyle(node as HTMLElement);
        const lh = style.lineHeight;
        if (lh === 'normal') return 1.2;
        if (lh.includes('px')) return parseFloat(lh) / parseFloat(style.fontSize);
        return parseFloat(lh) || 1.2;
    };

    const getSelectionLs = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !editorRef.current) return 0;
        let node = selection.anchorNode;
        if (node?.nodeType === 3) node = node.parentNode;
        let block = node as HTMLElement;
        
        while (block && block !== editorRef.current) {
            const saved = block.getAttribute('data-ls');
            if (saved !== null) return parseFloat(saved);
            const d = window.getComputedStyle(block).display;
            if (d === 'block' || block.tagName === 'DIV' || block.tagName === 'P') break;
            block = block.parentElement as HTMLElement;
        }

        if (!block) return 0;
        const style = window.getComputedStyle(block);
        const ls = style.letterSpacing;
        if (ls === 'normal' || ls === '0px') return 0;
        const px = parseFloat(ls);
        const fs = parseFloat(style.fontSize);
        return (!isNaN(px) && !isNaN(fs) && fs > 0) ? Math.round((px / fs) * 100) / 100 : 0;
    };

    const applyLetterSpacing = (lsEm: number) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
        
        const range = selection.getRangeAt(0);
        
        // Find all blocks in selection
        const allBlocks = Array.from(editorRef.current.querySelectorAll('div, p'))
            .filter(node => selection.containsNode(node, true));

        if (allBlocks.length > 0) {
            allBlocks.forEach(b => {
                const el = b as HTMLElement;
                if (lsEm === 0) {
                    el.style.letterSpacing = '';
                    el.removeAttribute('data-ls');
                } else {
                    el.style.letterSpacing = `${lsEm}em`;
                    el.setAttribute('data-ls', lsEm.toString());
                }
            });
        } else {
            // Apply to nearest block (fallback)
            let node = selection.anchorNode;
            if (node?.nodeType === 3) node = node.parentNode;
            let block = node as HTMLElement;
            
            let targetBlock: HTMLElement | null = null;
            while (block && block !== editorRef.current) {
                const d = window.getComputedStyle(block).display;
                if (d === 'block' || block.tagName === 'DIV' || block.tagName === 'P') {
                    targetBlock = block;
                    break;
                }
                block = block.parentElement as HTMLElement;
            }

            if (!targetBlock && editorRef.current) {
                document.execCommand('formatBlock', false, 'div');
                const newSel = window.getSelection();
                let n = newSel?.anchorNode;
                if (n?.nodeType === 3) n = n.parentNode;
                targetBlock = n as HTMLElement;
            }

            if (targetBlock) {
                if (lsEm === 0) {
                    targetBlock.style.letterSpacing = '';
                    targetBlock.removeAttribute('data-ls');
                } else {
                    targetBlock.style.letterSpacing = `${lsEm}em`;
                    targetBlock.setAttribute('data-ls', lsEm.toString());
                }
            }
        }
        
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    };

    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && editorRef.current?.contains(selection.anchorNode)) {
            lastRangeRef.current = selection.getRangeAt(0);
        }
    };

    const insertVariable = (variable: string) => {
        if (editorRef.current) {
            const selection = window.getSelection();
            if (!selection) return;

            if (lastRangeRef.current) {
                selection.removeAllRanges();
                selection.addRange(lastRangeRef.current);
            } else {
                editorRef.current.focus();
                const range = document.createRange();
                range.selectNodeContents(editorRef.current);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }

            const range = selection.getRangeAt(0);
            range.deleteContents();

            // Create variable span
            const span = document.createElement('span');
            span.className = 'technical-variable';
            span.setAttribute('data-variable', variable);
            span.textContent = `{${variable}}`;
            span.style.cssText = 'color:inherit; font-weight:inherit; font-size:inherit; font-family:inherit; user-select:all; display:inline !important; white-space:pre-wrap; vertical-align:baseline; margin:0 1px;';

            // Insert with zero-width spaces to fix cursor issues
            const before = document.createTextNode('\u200B');
            const after = document.createTextNode('\u200B');

            range.insertNode(after);
            range.insertNode(span);
            range.insertNode(before);

            // Move cursor to the position after the second ZWS
            range.setStartAfter(after);
            range.setEndAfter(after);
            selection.removeAllRanges();
            selection.addRange(range);

            onChange(editorRef.current.innerHTML);
            lastRangeRef.current = range;
        }
    };

    return (
        <div className="flex flex-col border border-input rounded-md overflow-hidden bg-white focus-within:ring-1 focus-within:ring-ring">
            <div className="flex flex-wrap bg-slate-50 border-b p-1 gap-1 items-center">
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

                {/* Font Weight Selector */}
                <select 
                    className="h-6 text-[10px] rounded border bg-white px-1 outline-none font-medium"
                    value={currentWeight}
                    onChange={(e) => {
                        const weight = e.target.value;
                        const selection = window.getSelection();
                        if (!selection || selection.rangeCount === 0) return;
                        let node = selection.anchorNode;
                        if (node?.nodeType === 3) node = node.parentNode;
                        const element = node as HTMLElement;
                        const currentFontSize = window.getComputedStyle(element).fontSize;

                        editorRef.current?.focus();
                        const existingElements = editorRef.current?.querySelectorAll('font, span') || [];
                        existingElements.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
                        document.execCommand('styleWithCSS', false, "true");
                        document.execCommand('fontSize', false, "7"); // Temporary marker
                        
                        if (editorRef.current) {
                            const allFontOrSpan = editorRef.current.querySelectorAll('font, span');
                            allFontOrSpan.forEach(el => {
                                const htmlEl = el as HTMLElement;
                                if (
                                    !htmlEl.hasAttribute('data-pre-existing') || 
                                    htmlEl.getAttribute('size') === '7' || 
                                    htmlEl.style.fontSize === 'xxx-large' ||
                                    htmlEl.style.fontSize === '7'
                                ) {
                                    htmlEl.style.fontWeight = weight;
                                    htmlEl.style.fontSize = currentFontSize; // FIX: Keep current size
                                    htmlEl.removeAttribute('size');
                                }
                            });
                            existingElements.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
                            onChange(editorRef.current.innerHTML);
                        }
                    }}
                >
                    <option value="normal">Normal</option>
                    <option value="500">SemiB</option>
                    <option value="bold">Bold</option>
                </select>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                <div className="flex items-center bg-white border rounded">
                    <Button 
                        variant="ghost" 
                        size="icon-sm" 
                        className="h-6 w-6 rounded-none border-r"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const adjust = (val: number) => {
                                // Use input value as base if possible, otherwise selection
                                let currentPt = 10.5;
                                if (inputRef.current && inputRef.current.value) {
                                    currentPt = parseFloat(inputRef.current.value);
                                } else {
                                    const selection = window.getSelection();
                                    if (!selection || selection.rangeCount === 0) return;
                                    let node = selection.anchorNode;
                                    if (node?.nodeType === 3) node = node.parentNode;
                                    const element = node as HTMLElement;
                                    const currentPx = parseFloat(window.getComputedStyle(element).fontSize);
                                    currentPt = Math.round(currentPx * 0.75 * 2) / 2;
                                }
                                
                                const newSize = Math.max(6, Math.min(100, currentPt + val));
                                if (inputRef.current) inputRef.current.value = newSize.toString();
                                
                                // Apply using the robust method
                                editorRef.current?.focus();
                                document.execCommand('formatBlock', false, 'div');
                                const existingElements = editorRef.current?.querySelectorAll('font, span') || [];
                                existingElements.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
                                document.execCommand('styleWithCSS', false, "true");
                                document.execCommand('fontSize', false, "7");
                                
                                if (editorRef.current) {
                                    const allFontOrSpan = editorRef.current.querySelectorAll('font, span');
                                    allFontOrSpan.forEach(el => {
                                        const htmlEl = el as HTMLElement;
                                        // Target only NEW elements or elements that were just modified by the command (size 7)
                                        if (
                                            !htmlEl.hasAttribute('data-pre-existing') || 
                                            htmlEl.getAttribute('size') === '7' || 
                                            htmlEl.style.fontSize === 'xxx-large' ||
                                            htmlEl.style.fontSize === '7'
                                        ) {
                                            htmlEl.style.fontSize = `${newSize}pt`;
                                            htmlEl.removeAttribute('size');
                                            // Extreme safety fallback
                                            if (parseInt(htmlEl.style.fontSize) > 60) htmlEl.style.fontSize = '12pt';
                                        }
                                    });
                                    existingElements.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
                                    onChange(editorRef.current.innerHTML);
                                }
                            };

                            adjust(-0.5);
                            const interval = setInterval(() => adjust(-0.5), 150);
                            const stop = () => {
                                clearInterval(interval);
                                window.removeEventListener('mouseup', stop);
                            };
                            window.addEventListener('mouseup', stop);
                        }}
                    >
                        -
                    </Button>
                    <input 
                        ref={inputRef}
                        type="text" 
                        className="h-6 w-10 text-[10px] text-center outline-none bg-transparent"
                        placeholder="Size"
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={(e) => {
                            setIsInputFocused(false);
                            const val = (e.target as HTMLInputElement).value;
                            if (val) {
                                const newSize = parseFloat(val);
                                if (!isNaN(newSize)) {
                                    editorRef.current?.focus();
                                    const existingElements = editorRef.current?.querySelectorAll('font, span') || [];
                                    existingElements.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
                                    document.execCommand('styleWithCSS', false, "true");
                                    document.execCommand('fontSize', false, "7");
                                    if (editorRef.current) {
                                        editorRef.current.querySelectorAll('font, span').forEach(el => {
                                            const htmlEl = el as HTMLElement;
                                            if (
                                                !htmlEl.hasAttribute('data-pre-existing') || 
                                                htmlEl.getAttribute('size') === '7' || 
                                                htmlEl.style.fontSize === 'xxx-large' ||
                                                htmlEl.style.fontSize === '7'
                                            ) {
                                                htmlEl.style.fontSize = `${newSize}pt`;
                                                htmlEl.removeAttribute('size');
                                            }
                                        });
                                        existingElements.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
                                        onChange(editorRef.current.innerHTML);
                                    }
                                }
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                            }
                        }}
                    />
                    <Button 
                        variant="ghost" 
                        size="icon-sm" 
                        className="h-6 w-6 rounded-none border-l"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const adjust = (val: number) => {
                                // Use input value as base if possible, otherwise selection
                                let currentPt = 10.5;
                                if (inputRef.current && inputRef.current.value) {
                                    currentPt = parseFloat(inputRef.current.value);
                                } else {
                                    const selection = window.getSelection();
                                    if (!selection || selection.rangeCount === 0) return;
                                    let node = selection.anchorNode;
                                    if (node?.nodeType === 3) node = node.parentNode;
                                    const element = node as HTMLElement;
                                    const currentPx = parseFloat(window.getComputedStyle(element).fontSize);
                                    currentPt = Math.round(currentPx * 0.75 * 2) / 2;
                                }
                                
                                const newSize = Math.max(6, Math.min(100, currentPt + val));
                                if (inputRef.current) inputRef.current.value = newSize.toString();
                                
                                // Apply using the robust method
                                editorRef.current?.focus();
                                const existingElements = editorRef.current?.querySelectorAll('font, span') || [];
                                existingElements.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
                                document.execCommand('styleWithCSS', false, "true");
                                document.execCommand('fontSize', false, "7");
                                
                                if (editorRef.current) {
                                    const allFontOrSpan = editorRef.current.querySelectorAll('font, span');
                                    allFontOrSpan.forEach(el => {
                                        const htmlEl = el as HTMLElement;
                                        if (
                                            !htmlEl.hasAttribute('data-pre-existing') || 
                                            htmlEl.getAttribute('size') === '7' || 
                                            htmlEl.style.fontSize === 'xxx-large' ||
                                            htmlEl.style.fontSize === '7'
                                        ) {
                                            htmlEl.style.fontSize = `${newSize}pt`;
                                            htmlEl.removeAttribute('size');
                                        }
                                    });
                                    existingElements.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
                                    onChange(editorRef.current.innerHTML);
                                }
                            };

                            adjust(0.5);
                            const interval = setInterval(() => adjust(0.5), 150);
                            const stop = () => {
                                clearInterval(interval);
                                window.removeEventListener('mouseup', stop);
                            };
                            window.addEventListener('mouseup', stop);
                        }}
                    >
                        +
                    </Button>
                </div>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* Line Height Control */}
                <div className="flex items-center bg-white border rounded">
                    <Button 
                        variant="ghost" 
                        size="icon-sm" 
                        className="h-6 w-6 rounded-none border-r"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            let startVal = getSelectionLh();
                            const adjust = (val: number) => {
                                startVal = Math.round(Math.max(0.4, Math.min(3.0, startVal + val)) * 100) / 100;
                                if (lineHeightRef.current) lineHeightRef.current.value = startVal.toFixed(2);
                                
                                editorRef.current?.focus();
                                const selection = window.getSelection();
                                let node = selection?.anchorNode;
                                if (node?.nodeType === 3) node = node.parentNode;
                                const currentFontSize = window.getComputedStyle(node as HTMLElement || editorRef.current!).fontSize;

                                const existingElements = editorRef.current?.querySelectorAll('font, span') || [];
                                existingElements.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
                                document.execCommand('styleWithCSS', false, "true");
                                document.execCommand('fontSize', false, "7"); 
                                if (editorRef.current) {
                                    editorRef.current.querySelectorAll('font, span').forEach(el => {
                                        const htmlEl = el as HTMLElement;
                                        if (
                                            !htmlEl.hasAttribute('data-pre-existing') || 
                                            htmlEl.getAttribute('size') === '7' || 
                                            htmlEl.style.fontSize === 'xxx-large' ||
                                            htmlEl.style.fontSize === '7'
                                        ) {
                                            const lhStr = startVal.toString();
                                            htmlEl.style.lineHeight = lhStr;
                                            htmlEl.setAttribute('data-lh', lhStr);
                                            htmlEl.style.fontSize = currentFontSize;
                                            htmlEl.removeAttribute('size');
                                            
                                            // Extreme safety fallback for 36pt spikes
                                            if (parseInt(htmlEl.style.fontSize) > 60) htmlEl.style.fontSize = '10pt';

                                            let p = htmlEl.parentElement;
                                            while (p && p !== editorRef.current) {
                                                const d = window.getComputedStyle(p).display;
                                                if (d === 'block' || p.tagName === 'DIV' || p.tagName === 'P') {
                                                    p.style.lineHeight = lhStr;
                                                    p.setAttribute('data-lh', lhStr);
                                                    break;
                                                }
                                                p = p.parentElement;
                                            }
                                        }
                                    });
                                    existingElements.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
                                    onChange(editorRef.current.innerHTML);
                                }
                            };

                            adjust(-0.05);
                            const interval = setInterval(() => adjust(-0.05), 150);
                            const stop = () => {
                                clearInterval(interval);
                                window.removeEventListener('mouseup', stop);
                            };
                            window.addEventListener('mouseup', stop);
                        }}
                    >
                        -
                    </Button>
                    <input 
                        ref={lineHeightRef}
                        type="text" 
                        className="h-6 w-8 text-[10px] text-center outline-none bg-transparent"
                        placeholder="1.2"
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={(e) => {
                            setIsInputFocused(false);
                            const val = (e.target as HTMLInputElement).value;
                            if (val) {
                                editorRef.current?.focus();
                                // Ensure the current line is a block (fixes first lines issue)
                                document.execCommand('formatBlock', false, 'div');
                                
                                const existingElements = editorRef.current?.querySelectorAll('font, span') || [];
                                existingElements.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
                                document.execCommand('styleWithCSS', false, "true");
                                document.execCommand('fontSize', false, "7"); // Marker
                                if (editorRef.current) {
                                    editorRef.current.querySelectorAll('font, span').forEach(el => {
                                        const htmlEl = el as HTMLElement;
                                        if (
                                            !htmlEl.hasAttribute('data-pre-existing') || 
                                            htmlEl.getAttribute('size') === '7' || 
                                            htmlEl.style.fontSize === 'xxx-large' ||
                                            htmlEl.style.fontSize === '7'
                                        ) {
                                            htmlEl.style.lineHeight = val;
                                            htmlEl.removeAttribute('size');

                                            // Apply to parent block
                                            let p = htmlEl.parentElement;
                                            while (p && p !== editorRef.current) {
                                                const d = window.getComputedStyle(p).display;
                                                if (d === 'block' || p.tagName === 'DIV' || p.tagName === 'P') {
                                                    p.style.lineHeight = val;
                                                    break;
                                                }
                                                p = p.parentElement;
                                            }
                                        }
                                    });
                                    existingElements.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
                                    onChange(editorRef.current.innerHTML);
                                }
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                            }
                        }}
                    />
                    <Button 
                        variant="ghost" 
                        size="icon-sm" 
                        className="h-6 w-6 rounded-none border-l"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            let startVal = getSelectionLh();
                            const adjust = (val: number) => {
                                startVal = Math.round(Math.max(0.4, Math.min(3.0, startVal + val)) * 100) / 100;
                                if (lineHeightRef.current) lineHeightRef.current.value = startVal.toFixed(2);
                                
                                editorRef.current?.focus();
                                const selection = window.getSelection();
                                let node = selection?.anchorNode;
                                if (node?.nodeType === 3) node = node.parentNode;
                                const currentFontSize = window.getComputedStyle(node as HTMLElement || editorRef.current!).fontSize;

                                const existingElements = editorRef.current?.querySelectorAll('font, span') || [];
                                existingElements.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
                                document.execCommand('styleWithCSS', false, "true");
                                document.execCommand('fontSize', false, "7"); 
                                if (editorRef.current) {
                                    editorRef.current.querySelectorAll('font, span').forEach(el => {
                                        const htmlEl = el as HTMLElement;
                                        if (!htmlEl.hasAttribute('data-pre-existing') || htmlEl.getAttribute('size') === '7' || htmlEl.style.fontSize === 'xxx-large' || htmlEl.style.fontSize === '7') {
                                            const lhStr = startVal.toString();
                                            htmlEl.style.lineHeight = lhStr;
                                            htmlEl.setAttribute('data-lh', lhStr);
                                            htmlEl.style.fontSize = currentFontSize; // FIX: Preserve original font size
                                            htmlEl.removeAttribute('size');

                                            // Apply to parent block
                                            let p = htmlEl.parentElement;
                                            while (p && p !== editorRef.current) {
                                                const d = window.getComputedStyle(p).display;
                                                if (d === 'block' || p.tagName === 'DIV' || p.tagName === 'P') {
                                                    p.style.lineHeight = lhStr;
                                                    p.setAttribute('data-lh', lhStr);
                                                    break;
                                                }
                                                p = p.parentElement;
                                            }
                                        }
                                    });
                                    existingElements.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
                                    onChange(editorRef.current.innerHTML);
                                }
                            };

                            adjust(0.05);
                            const interval = setInterval(() => adjust(0.05), 150);
                            const stop = () => {
                                clearInterval(interval);
                                window.removeEventListener('mouseup', stop);
                            };
                            window.addEventListener('mouseup', stop);
                        }}
                    >
                        +
                    </Button>
                </div>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* Alignment buttons */}
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('justifyLeft', e)} title="Alinear izquierda">
                    <AlignLeft className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('justifyCenter', e)} title="Centrar">
                    <AlignCenter className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('justifyRight', e)} title="Alinear derecha">
                    <AlignRight className="h-3 w-3" />
                </Button>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* Letter Spacing (Kerning) stepper */}
                <span className="text-[9px] text-slate-400 font-medium select-none">LS</span>
                <div className="flex items-center bg-white border rounded">
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-none border-r"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            editorRef.current?.focus();
                            let startVal = getSelectionLs();
                            const adjust = (v: number) => {
                                startVal = Math.round((startVal + v) * 100) / 100;
                                if (letterSpacingRef.current) letterSpacingRef.current.value = startVal.toString();
                                applyLetterSpacing(startVal);
                            };
                            adjust(-0.01);
                            const iv = setInterval(() => adjust(-0.01), 100);
                            const stop = () => { clearInterval(iv); window.removeEventListener('mouseup', stop); };
                            window.addEventListener('mouseup', stop);
                        }}
                    >-</Button>
                    <input
                        ref={letterSpacingRef}
                        type="text"
                        className="h-6 w-10 text-[10px] text-center outline-none bg-transparent"
                        placeholder="0em"
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={(e) => {
                            setIsInputFocused(false);
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) applyLetterSpacing(v);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-none border-l"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            editorRef.current?.focus();
                            let startVal = getSelectionLs();
                            const adjust = (v: number) => {
                                startVal = Math.round((startVal + v) * 100) / 100;
                                if (letterSpacingRef.current) letterSpacingRef.current.value = startVal.toString();
                                applyLetterSpacing(startVal);
                            };
                            adjust(0.01);
                            const iv = setInterval(() => adjust(0.01), 100);
                            const stop = () => { clearInterval(iv); window.removeEventListener('mouseup', stop); };
                            window.addEventListener('mouseup', stop);
                        }}
                    >+</Button>
                </div>


                <select
                    className="h-6 text-[10px] rounded border bg-slate-100 hover:bg-slate-200 cursor-pointer px-1 outline-none ml-auto"
                    defaultValue=""
                    onFocus={saveSelection}
                    onMouseEnter={saveSelection}
                    onMouseDown={saveSelection}
                    onChange={(e) => {
                        insertVariable(e.target.value);
                        e.target.value = "";
                    }}
                >
                    <option value="" disabled>+ Variable</option>
                    {isExternalDataSource && datasetSchema.length > 0 ? (
                        <optgroup label="Dataset Externo">
                            {datasetSchema.map(f => (
                                <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                        </optgroup>
                    ) : (
                        <>
                        <optgroup label="Producto">
                            <option value="sku_base">Código SKU</option>
                            <option value="final_name_es">Nombre (ES)</option>
                            <option value="final_name_en">Nombre (EN)</option>
                            <option value="technical_description_es">Descripción Técnica (ES)</option>
                            <option value="technical_description_en">Descripción Técnica (EN)</option>
                            <option value="color_code">Código color</option>
                            <option value="name_color_sap">Nombre color</option>
                            <option value="use_destination">Uso (Designación)</option>
                            <option value="zone_home">Zona Firplak</option>
                            <option value="carb2">Certificación CARB2</option>
                        </optgroup>
                        <optgroup label="Medidas">
                            <option value="width_cm">Ancho (cm)</option>
                            <option value="height_cm">Alto (cm)</option>
                            <option value="depth_cm">Fondo (cm)</option>
                            <option value="width_in">Ancho (in)</option>
                            <option value="height_in">Alto (in)</option>
                            <option value="depth_in">Fondo (in)</option>
                        </optgroup>
                        <optgroup label="Otros">
                            <option value="commercial_measure">Medida Comercial</option>
                            <option value="weight_kg">Peso (kg)</option>
                            <option value="weight_lb">Peso (lb)</option>
                            <option value="line">Línea</option>
                        </optgroup>
                        </>
                    )}
                    {/* NOTE: Icon variables removed from text — use 'Icono Variable' element type instead */}
                </select>
            </div>
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                onMouseUp={saveSelection}
                onKeyUp={saveSelection}
                onFocus={saveSelection}
                onBlur={saveSelection}
                className="min-h-[80px] p-2 text-sm outline-none"
                style={{ direction: 'ltr', whiteSpace: 'pre-wrap' }}
            />
        </div>
    )
}

/**
 * CaptionEditor — mini rich-text editor scoped to dynamic_image captions.
 * Same toolbar as RichTextEditor (Bold, Italic, Weight, Size, Line Height)
 * but without the variable insertion selector.
 * Backward-compatible: if caption is plain text with \n it converts to <br> on mount.
 */
function CaptionEditor({ content, onChange }: { content: string, onChange: (val: string) => void }) {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastRangeRef = useRef<Range | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lineHeightRef = useRef<HTMLInputElement>(null);
    const letterSpacingRef = useRef<HTMLInputElement>(null);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [currentWeight, setCurrentWeight] = useState('normal');
    const initialized = useRef(false);

    // On mount: load content, converting plain text (\n) to HTML (<br>) for backward compat
    useEffect(() => {
        if (editorRef.current && !initialized.current) {
            initialized.current = true;
            const html = content.includes('<')
                ? content                        // Already HTML — load as-is
                : content.replace(/\n/g, '<br>') // Plain text — convert newlines
            editorRef.current.innerHTML = html;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When content changes from outside (e.g. switching selected element)
    useEffect(() => {
        if (editorRef.current) {
            const html = content.includes('<') ? content : content.replace(/\n/g, '<br>')
            if (editorRef.current.innerHTML !== html) {
                editorRef.current.innerHTML = html;
                initialized.current = true;
            }
        }
    }, [content]);

    // Sync toolbar state with selection
    useEffect(() => {
        const handleSelectionChange = () => {
            if (editorRef.current && window.getSelection()?.rangeCount && editorRef.current.contains(window.getSelection()?.anchorNode || null)) {
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) return;
                let node = selection.anchorNode;
                if (node?.nodeType === 3) node = node.parentNode;
                const element = node as HTMLElement;
                const style = window.getComputedStyle(element);

                if (!isInputFocused && inputRef.current) {
                    const currentPx = parseFloat(style.fontSize);
                    const currentPt = Math.round(currentPx * 0.75 * 2) / 2;
                    inputRef.current.value = currentPt.toString();
                }
                if (lineHeightRef.current && document.activeElement !== lineHeightRef.current) {
                    const style = window.getComputedStyle(element);
                    const lh = style.lineHeight;
                    let val = 1.2;
                    if (lh === 'normal') val = 1.2;
                    else if (lh.includes('px')) val = Math.round((parseFloat(lh) / parseFloat(style.fontSize)) * 100) / 100;
                    else val = parseFloat(lh);

                    // SEARCH FOR data-lh (high precision)
                    let el: HTMLElement | null = element;
                    while (el && el !== editorRef.current) {
                        const saved = el.getAttribute('data-lh');
                        if (saved) { val = parseFloat(saved); break; }
                        el = el.parentElement;
                    }
                    lineHeightRef.current.value = (!isNaN(val) ? val.toFixed(2) : '1.20');
                }
                if (letterSpacingRef.current && document.activeElement !== letterSpacingRef.current) {
                    const style = window.getComputedStyle(element);
                    const ls = style.letterSpacing;
                    let ratio = 0;
                    if (ls !== 'normal' && ls !== '0px') {
                        const px = parseFloat(ls);
                        const fs = parseFloat(style.fontSize);
                        ratio = (!isNaN(px) && !isNaN(fs) && fs > 0) ? Math.round((px / fs) * 100) / 100 : 0;
                    }

                    // SEARCH FOR data-ls (high precision)
                    let el: HTMLElement | null = element;
                    while (el && el !== editorRef.current) {
                        const saved = el.getAttribute('data-ls');
                        if (saved) { ratio = parseFloat(saved); break; }
                        el = el.parentElement;
                    }
                    letterSpacingRef.current.value = (!isNaN(ratio) ? ratio.toFixed(2) : '0.00');
                }
                const weight = style.fontWeight;
                if (weight === '400' || weight === 'normal') setCurrentWeight('normal');
                else if (weight === '500') setCurrentWeight('500');
                else if (parseInt(weight) >= 600 || weight === 'bold') setCurrentWeight('bold');
            }
        };
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [isInputFocused]);

    const execCommand = (command: string, e: React.MouseEvent) => {
        e.preventDefault();
        document.execCommand(command, false, undefined);
        editorRef.current?.focus();
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    };

    const handleInput = () => {
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    };

    const applySize = (newSize: number) => {
        editorRef.current?.focus();
        const existing = editorRef.current?.querySelectorAll('font, span') || [];
        existing.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('fontSize', false, '7');
        if (editorRef.current) {
            editorRef.current.querySelectorAll('font, span').forEach(el => {
                const h = el as HTMLElement;
                if (!h.hasAttribute('data-pre-existing') || h.getAttribute('size') === '7' || h.style.fontSize === 'xxx-large') {
                    h.style.fontSize = `${newSize}pt`;
                    h.removeAttribute('size');
                }
            });
            existing.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
            onChange(editorRef.current.innerHTML);
        }
    };

    const applyLineHeight = (newLh: number) => {
        let savedFontSize = '6.5pt';
        const selForSize = window.getSelection();
        if (selForSize && selForSize.rangeCount > 0) {
            let n = selForSize.anchorNode;
            if (n?.nodeType === 3) n = n.parentNode;
            savedFontSize = window.getComputedStyle(n as HTMLElement).fontSize;
        }

        editorRef.current?.focus();
        document.execCommand('formatBlock', false, 'div');
        const existing = editorRef.current?.querySelectorAll('font, span') || [];
        existing.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('fontSize', false, '7'); 
        if (editorRef.current) {
            editorRef.current.querySelectorAll('font, span').forEach(el => {
                const h = el as HTMLElement;
                if (!h.hasAttribute('data-pre-existing') || h.getAttribute('size') === '7' || h.style.fontSize === 'xxx-large') {
                    const lhStr = (Math.round(newLh * 100) / 100).toString();
                    h.style.lineHeight = lhStr;
                    h.setAttribute('data-lh', lhStr);
                    // Force the font size back and REMOVE the size attribute completely
                    h.style.fontSize = savedFontSize; 
                    h.removeAttribute('size');
                    // Safety: if the font size is still dangerously large, force a default
                    if (parseInt(h.style.fontSize) > 40) h.style.fontSize = '8pt';
                    
                    let p = h.parentElement;
                    while (p && p !== editorRef.current) {
                        const d = window.getComputedStyle(p).display;
                        if (d === 'block' || p.tagName === 'DIV' || p.tagName === 'P') { 
                            p.style.lineHeight = lhStr; 
                            p.setAttribute('data-lh', lhStr);
                            break; 
                        }
                        p = p.parentElement;
                    }
                }
            });
            existing.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
            onChange(editorRef.current.innerHTML);
        }
    };


    const getSelectionLh = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !editorRef.current) return 1.2;
        let node = selection.anchorNode;
        if (node?.nodeType === 3) node = node.parentNode;

        // HIGHER PRECISION: Check for data-lh in ancestors
        let el = node as HTMLElement;
        while (el && el !== editorRef.current) {
            const saved = el.getAttribute('data-lh');
            if (saved) return parseFloat(saved);
            el = el.parentElement as HTMLElement;
        }

        const style = window.getComputedStyle(node as HTMLElement);
        const lh = style.lineHeight;
        if (lh === 'normal') return 1.2;
        if (lh.includes('px')) return parseFloat(lh) / parseFloat(style.fontSize);
        return parseFloat(lh) || 1.2;
    };

    const getSelectionLs = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return 0;
        let node = selection.anchorNode;
        if (node?.nodeType === 3) node = node.parentNode;
        let block = node as HTMLElement;
        
        // 1. Try to read our custom attribute first (maximum precision)
        while (block && block !== editorRef.current) {
            const saved = block.getAttribute('data-ls');
            if (saved !== null) return parseFloat(saved);
            const d = window.getComputedStyle(block).display;
            if (d === 'block' || block.tagName === 'DIV' || block.tagName === 'P') break;
            block = block.parentElement as HTMLElement;
        }

        // 2. Fallback to computed style
        if (!block) return 0;
        const style = window.getComputedStyle(block);
        const ls = style.letterSpacing;
        if (ls === 'normal' || ls === '0px') return 0;
        const px = parseFloat(ls);
        const fs = parseFloat(style.fontSize);
        return (!isNaN(px) && !isNaN(fs) && fs > 0) ? Math.round((px / fs) * 100) / 100 : 0;
    };

    /**
     * Apply letter-spacing (in em) to the nearest block ancestor.
     */
    const applyLetterSpacing = (lsEm: number) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
        
        const range = selection.getRangeAt(0);
        
        // Find all block elements (DIV, P) within the editor that intersect with the selection
        const blocks = Array.from(editorRef.current.querySelectorAll('div, p'))
            .filter(block => selection.containsNode(block, true));
            
        if (blocks.length > 0) {
            // Apply to all selected blocks
            blocks.forEach(block => {
                const b = block as HTMLElement;
                if (lsEm === 0) {
                    b.style.letterSpacing = '';
                    b.removeAttribute('data-ls');
                } else {
                    b.style.letterSpacing = `${lsEm}em`;
                    b.setAttribute('data-ls', lsEm.toString());
                }
            });
        } else {
            // Fallback: apply to nearest block if selection is collapsed or no blocks contain it
            let node = selection.anchorNode;
            if (node?.nodeType === 3) node = node.parentNode;
            let block = node as HTMLElement;
            
            let targetBlock: HTMLElement | null = null;
            while (block && block !== editorRef.current) {
                const d = window.getComputedStyle(block).display;
                if (d === 'block' || block.tagName === 'DIV' || block.tagName === 'P') {
                    targetBlock = block;
                    break;
                }
                block = block.parentElement as HTMLElement;
            }

            if (!targetBlock && editorRef.current) {
                document.execCommand('formatBlock', false, 'div');
                const newSel = window.getSelection();
                let n = newSel?.anchorNode;
                if (n?.nodeType === 3) n = n.parentNode;
                targetBlock = n as HTMLElement;
            }

            if (targetBlock) {
                if (lsEm === 0) {
                    targetBlock.style.letterSpacing = '';
                    targetBlock.removeAttribute('data-ls');
                } else {
                    targetBlock.style.letterSpacing = `${lsEm}em`;
                    targetBlock.setAttribute('data-ls', lsEm.toString());
                }
            }
        }
        
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    };

    const getSelectionSize = () => {
        if (inputRef.current && inputRef.current.value) return parseFloat(inputRef.current.value);
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return 6.5;
        let node = selection.anchorNode;
        if (node?.nodeType === 3) node = node.parentNode;
        return Math.round(parseFloat(window.getComputedStyle(node as HTMLElement).fontSize) * 0.75 * 2) / 2;
    };

    return (
        <div className="flex flex-col border border-input rounded-md overflow-hidden bg-white focus-within:ring-1 focus-within:ring-ring">
            {/* Toolbar */}
            <div className="flex flex-wrap bg-slate-50 border-b p-1 gap-1 items-center">
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('bold', e)} title="Negrita"><b>B</b></Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('italic', e)} title="Cursiva"><i>I</i></Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('removeFormat', e)} title="Borrar Formato"><Trash2 className="h-3 w-3 text-slate-400" /></Button>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* Font Weight */}
                <select
                    className="h-6 text-[10px] rounded border bg-white px-1 outline-none font-medium"
                    value={currentWeight}
                    onChange={(e) => {
                        const weight = e.target.value;
                        const selection = window.getSelection();
                        if (!selection || selection.rangeCount === 0) return;
                        let node = selection.anchorNode;
                        if (node?.nodeType === 3) node = node.parentNode;
                        const currentFontSize = window.getComputedStyle(node as HTMLElement).fontSize;
                        editorRef.current?.focus();
                        const existing = editorRef.current?.querySelectorAll('font, span') || [];
                        existing.forEach(el => (el as HTMLElement).setAttribute('data-pre-existing', 'true'));
                        document.execCommand('styleWithCSS', false, 'true');
                        document.execCommand('fontSize', false, '7');
                        if (editorRef.current) {
                            editorRef.current.querySelectorAll('font, span').forEach(el => {
                                const h = el as HTMLElement;
                                if (!h.hasAttribute('data-pre-existing') || h.getAttribute('size') === '7' || h.style.fontSize === 'xxx-large') {
                                    h.style.fontWeight = weight;
                                    h.style.fontSize = currentFontSize;
                                    h.removeAttribute('size');
                                }
                            });
                            existing.forEach(el => (el as HTMLElement).removeAttribute('data-pre-existing'));
                            setCurrentWeight(weight);
                            onChange(editorRef.current.innerHTML);
                        }
                    }}
                >
                    <option value="normal">Normal</option>
                    <option value="500">SemiB</option>
                    <option value="bold">Bold</option>
                </select>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* Font Size stepper */}
                <div className="flex items-center bg-white border rounded">
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-none border-r"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const adjust = (v: number) => { const s = Math.max(5, Math.min(72, getSelectionSize() + v)); if (inputRef.current) inputRef.current.value = s.toString(); applySize(s); };
                            adjust(-0.5);
                            const iv = setInterval(() => adjust(-0.5), 150);
                            const stop = () => { clearInterval(iv); window.removeEventListener('mouseup', stop); };
                            window.addEventListener('mouseup', stop);
                        }}
                    >-</Button>
                    <input ref={inputRef} type="text" className="h-6 w-10 text-[10px] text-center outline-none bg-transparent" placeholder="pt"
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={(e) => { setIsInputFocused(false); const v = parseFloat(e.target.value); if (!isNaN(v)) applySize(v); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-none border-l"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const adjust = (v: number) => { const s = Math.max(5, Math.min(72, getSelectionSize() + v)); if (inputRef.current) inputRef.current.value = s.toString(); applySize(s); };
                            adjust(0.5);
                            const iv = setInterval(() => adjust(0.5), 150);
                            const stop = () => { clearInterval(iv); window.removeEventListener('mouseup', stop); };
                            window.addEventListener('mouseup', stop);
                        }}
                    >+</Button>
                </div>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* Line Height stepper */}
                <div className="flex items-center bg-white border rounded">
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-none border-r"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            let startVal = getSelectionLh(); 
                            const adjust = (v: number) => { 
                                document.execCommand('formatBlock', false, 'div'); 
                                startVal = Math.round(Math.max(0.4, Math.min(3.0, startVal + v)) * 100) / 100; 
                                if (lineHeightRef.current) lineHeightRef.current.value = startVal.toFixed(2); 
                                applyLineHeight(startVal); 
                            };
                            adjust(-0.05);
                            const iv = setInterval(() => adjust(-0.05), 150);
                            const stop = () => { clearInterval(iv); window.removeEventListener('mouseup', stop); };
                            window.addEventListener('mouseup', stop);
                        }}
                    >-</Button>
                    <input ref={lineHeightRef} type="text" className="h-6 w-8 text-[10px] text-center outline-none bg-transparent" placeholder="1.2"
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={(e) => { setIsInputFocused(false); const v = parseFloat(e.target.value); if (!isNaN(v)) applyLineHeight(v); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-none border-l"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            let startVal = getSelectionLh(); 
                            const adjust = (v: number) => { 
                                document.execCommand('formatBlock', false, 'div'); 
                                startVal = Math.round(Math.max(0.4, Math.min(3.0, startVal + v)) * 100) / 100; 
                                if (lineHeightRef.current) lineHeightRef.current.value = startVal.toFixed(2); 
                                applyLineHeight(startVal); 
                            };
                            adjust(0.05);
                            const iv = setInterval(() => adjust(0.05), 150);
                            const stop = () => { clearInterval(iv); window.removeEventListener('mouseup', stop); };
                            window.addEventListener('mouseup', stop);
                        }}
                    >+</Button>
                </div>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* Alignment — fully local, inside the HTML */}
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('justifyLeft', e)} title="Alinear izquierda"><AlignLeft className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('justifyCenter', e)} title="Centrar"><AlignCenter className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon-sm" className="h-6 w-6" onMouseDown={(e) => execCommand('justifyRight', e)} title="Alinear derecha"><AlignRight className="h-3 w-3" /></Button>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                {/* Letter Spacing (Kerning) stepper — applied at block level, no font-size side effects */}
                <span className="text-[9px] text-slate-400 font-medium select-none">LS</span>
                <div className="flex items-center bg-white border rounded">
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-none border-r"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            editorRef.current?.focus();
                            
                            let startVal = getSelectionLs();
                            const adjust = (v: number) => {
                                startVal = Math.round((startVal + v) * 100) / 100;
                                if (letterSpacingRef.current) letterSpacingRef.current.value = startVal.toString();
                                applyLetterSpacing(startVal);
                            };
                            
                            adjust(-0.01);
                            const iv = setInterval(() => adjust(-0.01), 100);
                            const stop = () => { clearInterval(iv); window.removeEventListener('mouseup', stop); };
                            window.addEventListener('mouseup', stop);
                        }}
                    >-</Button>
                    <input
                        ref={letterSpacingRef}
                        type="text"
                        className="h-6 w-10 text-[10px] text-center outline-none bg-transparent"
                        placeholder="0em"
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={(e) => {
                            setIsInputFocused(false);
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) applyLetterSpacing(v);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-none border-l"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            editorRef.current?.focus();
                            
                            let startVal = getSelectionLs();
                            const adjust = (v: number) => {
                                startVal = Math.round((startVal + v) * 100) / 100;
                                if (letterSpacingRef.current) letterSpacingRef.current.value = startVal.toString();
                                applyLetterSpacing(startVal);
                            };
                            
                            adjust(0.01);
                            const iv = setInterval(() => adjust(0.01), 100);
                            const stop = () => { clearInterval(iv); window.removeEventListener('mouseup', stop); };
                            window.addEventListener('mouseup', stop);
                        }}
                    >+</Button>
                </div>
            </div>

            {/* Editable area */}
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                className="min-h-[60px] p-2 text-[8pt] outline-none leading-snug"
                style={{ direction: 'ltr', whiteSpace: 'pre-wrap' }}
            />
        </div>
    )
}

export function BuilderCanvas({ template, assets = [], datasetSchema: initialSchema = [] }: { template: any, assets?: any[], datasetSchema?: any[] }) {

    const [elements, setElements] = useState<TemplateElement[]>([])
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [isModified, setIsModifiedState] = useState(false)
    const isModifiedRef = useRef(false)

    // Global settings states
    const [templateName, setTemplateName] = useState(template.name || '')
    const [dataSource, setDataSource] = useState(template.data_source || 'core_firplak')
    const [datasetSchema, setDatasetSchema] = useState(initialSchema)
    const [availableDatasets, setAvailableDatasets] = useState<any[]>([])

    const setIsModified = useCallback((val: boolean) => {
        isModifiedRef.current = val
        setIsModifiedState(val)
    }, [])

    // Unsaved Changes Interception State
    const [showExitDialog, setShowExitDialog] = useState(false)
    const [pendingHref, setPendingHref] = useState<string | null>(null)
    const [exportFormats, setExportFormats] = useState<string[]>(
        template.export_formats ? template.export_formats.split(',') : ['pdf', 'jpg']
    )
    const [exportFilenameFormat, setExportFilenameFormat] = useState<string>(
        template.export_filename_format || '{sku_base}_{final_name_es}'
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
    const [isLoadingRandom, setIsLoadingRandom] = useState(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [previewData, setPreviewData] = useState<any>(null)
    const [isValidating, setIsValidating] = useState(false)
    const [validationResult, setValidationResult] = useState<{ success: boolean, error?: string, count?: number } | null>(null)
    const assetMap = React.useMemo(() => {
        const map: Record<string, string> = {}
        assets.forEach(a => {
            if (a.name) map[a.name] = a.file_path
        })
        return map
    }, [assets])

    const enrichedData = React.useMemo(() => {
        if (!previewData) return null
        return enrichProductDataWithIcons(previewData, assetMap)
    }, [previewData, assetMap])

    // Helper: resuelve zone_home_en desde el Glosario antes de enriquecer (preview del builder)
    const enrichWithZone = async (data: any, resolvedAssetMap: Record<string, string>) => {
        if (!data) return enrichProductDataWithIcons(data, resolvedAssetMap)
        const zoneEn = await resolveZoneHomeEnAction(data.zone_home)
        const dataWithZone = zoneEn ? { ...data, zone_home_en: zoneEn } : data
        return enrichProductDataWithIcons(dataWithZone, resolvedAssetMap)
    }

    // Fetch datasets info
    useEffect(() => {
        getDatasetsAction().then(res => setAvailableDatasets(res))
    }, [])

    const handleDataSourceChange = async (newSource: string) => {
        setDataSource(newSource)
        setIsModified(true)
        
        // Update schema locally
        if (newSource === 'core_firplak') {
            setDatasetSchema([])
        } else {
            const ds = availableDatasets.find(d => d.id === newSource)
            if (ds && ds.schema_json) {
                const raw = ds.schema_json
                if (Array.isArray(raw)) {
                    setDatasetSchema(raw)
                } else if (raw && typeof raw === 'object') {
                    const selectedCols = raw.selectedColumns || []
                    setDatasetSchema(selectedCols.map((col: string) => ({
                        key: col,
                        label: col.replace(/_/g, ' '),
                        original: col,
                        is_identifier: col === raw.fieldMap?.code
                    })))
                }
            }
        }

        // Reload preview product for the new source
        const data = await getPreviewProduct(newSource)
        const assetsRemote = await resolveAssetsAction([])
        setPreviewData(await enrichWithZone(data, assetsRemote))
    }

    // Determinar si es fuente externa o core Firplak
    const isExternalDataSource = dataSource && dataSource !== 'core_firplak'

    // Lista de variables disponibles (estáticas para Firplak, dinámicas para datasets externos)
    const CORE_VARIABLE_OPTS = [
        { group: 'Identificadores', options: [
            { key: 'code', label: 'Código SKU (Completo)' },
            { key: 'sku_base', label: 'Código base SKU' },
            { key: 'barcode_text', label: 'Código de Barras' },
        ]},
        { group: 'Producto/Atributos', options: [
            { key: 'product_type', label: 'Tipo de Producto' },
            { key: 'cabinet_name', label: 'Nombre Mueble' },
            { key: 'designation', label: 'Uso (Designación)' },
            { key: 'commercial_measure', label: 'Medida Comercial' },
            { key: 'accessory_text', label: 'Accesorios/Riel' },
            { key: 'color', label: 'Color (Nombre)' },
            { key: 'color_code', label: 'Código color' },
            { key: 'name_color_sap', label: 'Nombre color' },
            { key: 'zone_home', label: 'Zona Firplak' },
            { key: 'carb2', label: 'Certificación CARB2' },
        ]},
        { group: 'Generados/Técnicos', options: [
            { key: 'final_name_es', label: 'Nombre (ES)' },
            { key: 'final_name_en', label: 'Nombre (EN)' },
            { key: 'technical_description_es', label: 'Descripción Técnica (ES)' },
            { key: 'technical_description_en', label: 'Descripción Técnica (EN)' },
        ]},
        { group: 'Medidas', options: [
            { key: 'width_cm', label: 'Ancho (cm)' },
            { key: 'height_cm', label: 'Alto (cm)' },
            { key: 'depth_cm', label: 'Fondo (cm)' },
            { key: 'width_in', label: 'Ancho (in)' },
            { key: 'height_in', label: 'Alto (in)' },
            { key: 'depth_in', label: 'Fondo (in)' },
        ]},
        { group: 'Otros', options: [
            { key: 'commercial_measure', label: 'Medida Comercial' },
            { key: 'weight_kg', label: 'Peso (kg)' },
            { key: 'weight_lb', label: 'Peso (lb)' },
            { key: 'line', label: 'Línea' },
        ]},
    ]

    const renderVariableOptions = () => {
        if (isExternalDataSource && datasetSchema.length > 0) {
            return (
                <optgroup label="Dataset Externo">
                    {datasetSchema.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                </optgroup>
            )
        }
        return CORE_VARIABLE_OPTS.map(group => (
            <optgroup key={group.group} label={group.group}>
                {group.options.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                ))}
            </optgroup>
        ))
    }

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
            if (isModifiedRef.current) {
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
        setIsModified(false); 
        isModifiedRef.current = false; // Synchronous bypass
        if (pendingHref) {
            window.location.href = pendingHref;
        }
    };

    const handleExitAndSave = async () => {
        await handleSave();
        setShowExitDialog(false);
        isModifiedRef.current = false; // Synchronous bypass
        if (pendingHref) {
            window.location.href = pendingHref;
        }
    };

    // Undo / Redo Logic
    const commitHistory = useCallback((newElements: TemplateElement[]) => {
        setElements(newElements)
        setIsModified(true)

        setHistory(prev => {
            // Use the current historyIndex to slice. 
            // Note: Since we need historyIndex here, we must keep it in deps.
            const newHistory = prev.slice(0, historyIndex + 1)
            newHistory.push([...newElements])
            if (newHistory.length > MAX_HISTORY) {
                newHistory.shift()
                // If we shifted, the index doesn't change relative to the end, 
                // but since we are at the end, historyIndex+1 becomes the new length.
            }
            return newHistory
        })
        
        setHistoryIndex(prev => {
            const next = prev + 1
            return next >= MAX_HISTORY ? MAX_HISTORY - 1 : next
        })
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

    const groupElements = useCallback(() => {
        const selectedEls = elements.filter(el => selectedIds.includes(el.id) && (el.type === 'image' || el.type === 'dynamic_image'));
        if (selectedEls.length < 2) {
            toast('Selecciona al menos 2 iconos/imágenes válidas para agrupar');
            return;
        }

        const minX = Math.min(...selectedEls.map(e => e.x));
        const minY = Math.min(...selectedEls.map(e => e.y));
        const maxX = Math.max(...selectedEls.map(e => e.x + e.width));
        const maxY = Math.max(...selectedEls.map(e => e.y + e.height));

        const newId = crypto.randomUUID();
        const newGroup: TemplateElement = {
            id: newId,
            type: 'icon_group',
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            groupGapMM: 2,
            groupAlign: 'flex-start',
            groupWrap: false
        };

        const newElements = elements.map(el => {
            if (selectedIds.includes(el.id) && (el.type === 'image' || el.type === 'dynamic_image')) {
                return { ...el, groupId: newId };
            }
            return el;
        });

        commitHistory([...newElements, newGroup]);
        setSelectedIds([newId]);
        toast('Elementos agrupados como fila condicional');
    }, [elements, selectedIds, commitHistory]);

    const ungroupElements = useCallback(() => {
        if (selectedIds.length !== 1) return;
        const groupEl = elements.find(el => el.id === selectedIds[0] && el.type === 'icon_group');
        if (!groupEl) return;

        const newElements = elements.filter(el => el.id !== groupEl.id).map(el => {
            if (el.groupId === groupEl.id) {
                const { groupId, ...rest } = el;
                return rest;
            }
            return el;
        });

        commitHistory(newElements);
        setSelectedIds([]);
        toast('Grupo separado correctamente');
    }, [elements, selectedIds, commitHistory]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeTag = document.activeElement?.tagName || '';
            const isInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag);
            const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
            const isTyping = isInput || isEditable;

            const key = e.key.toLowerCase();

            // Undo: Ctrl+Z
            if (e.ctrlKey && !e.shiftKey && key === 'z') {
                if (!isTyping) {
                    e.preventDefault()
                    undo()
                }
            }
            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if ((e.ctrlKey && key === 'y') || (e.ctrlKey && e.shiftKey && key === 'z')) {
                if (!isTyping) {
                    e.preventDefault()
                    redo()
                }
            }

            // Duplicate: Ctrl+D
            if (e.ctrlKey && key === 'd') {
                if (!isTyping && selectedIds.length > 0) {
                    e.preventDefault()
                    duplicateSelectedElements()
                }
            }

            // Delete key
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
                if (!isTyping) {
                    e.preventDefault()
                    removeSelectedElements()
                }
            }

            // Copy & Paste (Ctrl+C, Ctrl+V)
            if (e.ctrlKey && key === 'c') {
                if (!isTyping && selectedIds.length > 0) {
                    // We don't preventDefault here to allow standard text copy if something else is weirdly focused
                    // but we do our internal copy
                    const toCopy = elements.filter(el => selectedIds.includes(el.id))
                    sessionStorage.setItem('template_clipboard', JSON.stringify(toCopy))
                    toast("Elementos copiados")
                }
            }
            if (e.ctrlKey && key === 'v') {
                if (!isTyping) {
                    const stored = sessionStorage.getItem('template_clipboard')
                    if (stored) {
                        e.preventDefault() // Prevent browser default paste if we are handling it
                        try {
                            const parsed: TemplateElement[] = JSON.parse(stored)
                            const newEls = parsed.map(el => ({ 
                                ...el, 
                                id: crypto.randomUUID(), 
                                x: el.x + 10, 
                                y: el.y + 10 
                            }))
                            commitHistory([...elements, ...newEls])
                            setSelectedIds(newEls.map(e => e.id))
                            toast("Elementos pegados")
                        } catch (err) {
                            console.error(err)
                        }
                    }
                }
            }

            // Move with Arrows
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && selectedIds.length > 0) {
                if (!isTyping) {
                    e.preventDefault()
                    const step = e.shiftKey ? 20 : 4 // 5mm vs 1mm
                    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
                    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
                    
                    const newElements = elements.map(el => {
                        if (selectedIds.includes(el.id)) {
                            return { ...el, x: el.x + dx, y: el.y + dy }
                        }
                        return el
                    })
                    setElements(newElements)
                    if (!e.repeat) {
                        commitHistory(newElements)
                    } else {
                        // For repeated keys, we update state immediately and will commit eventually
                        // To keep it simple, we commit every time but we could debounce
                        commitHistory(newElements)
                    }
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [undo, redo, selectedIds, elements, commitHistory, removeSelectedElements, duplicateSelectedElements])

    const handleSave = async () => {
        setIsSaving(true)
        const res = await updateTemplate(template.id, {
            name: templateName,
            data_source: dataSource,
            elements_json: JSON.stringify(elements),
            export_formats: exportFormats.join(','),
            export_filename_format: exportFilenameFormat
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
                const data = await getPreviewProduct(dataSource)
                // Resolve system asset URLs (icons, logos) and enrich product data with icon fields
                const assetMap = await resolveAssetsAction([])
                setPreviewData(await enrichWithZone(data, assetMap))
            }
        }
        setIsPreviewMode(!isPreviewMode)
    }

    const handleRandomPreview = async () => {
        setIsLoadingRandom(true)
        try {
            // Pass current product code so the server excludes it (avoids same product twice)
            const data = await getRandomPreviewProduct(previewData?.code, dataSource)
            if (data) {
                const assetMap = await resolveAssetsAction([])
                setPreviewData(await enrichWithZone(data, assetMap))
                if (!isPreviewMode) setIsPreviewMode(true)
            } else {
                toast('No se encontraron más productos')
            }
        } finally {
            setIsLoadingRandom(false)
        }
    }

    const handleBasePreview = async () => {
        setIsLoadingRandom(true)
        try {
            const data = await getPreviewProduct(dataSource)
            const assetMap = await resolveAssetsAction([])
            setPreviewData(await enrichWithZone(data, assetMap))
        } finally {
            setIsLoadingRandom(false)
        }
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
            verticalAlign: 'middle',
            fontFamily: 'Montserrat',
            borderStyle: type === 'dashed_line' ? 'dashed' : 'solid',
            borderWidth: type === 'dashed_line' ? 2 : 0,
            required: false
        }

        if (type === 'image') {
            newEl.content = 'Logo Firplak general'
            newEl.width = 150
            newEl.height = 50
        }

        if (type === 'dynamic_image') {
            newEl.dataField = 'icon_rh'
            newEl.caption = 'Resistente a la humedad\nMoisture resistance'
            newEl.width = 44    // ~11 mm
            newEl.height = 52   // ~13 mm — enough for icon + two-line caption
            newEl.captionFontSize = 6.5
            newEl.captionTextAlign = 'center'
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

    // Distribute Tools
    const distributeElements = (axis: 'horizontal' | 'vertical') => {
        if (selectedIds.length < 3) return
        const selectedEls = elements.filter(el => selectedIds.includes(el.id))

        if (axis === 'horizontal') {
            const sorted = [...selectedEls].sort((a, b) => a.x - b.x)
            const firstEl = sorted[0]
            const lastEl = sorted[sorted.length - 1]
            const totalSpan = (lastEl.x + lastEl.width) - firstEl.x
            const totalElemWidth = sorted.reduce((sum, el) => sum + el.width, 0)
            const gap = (totalSpan - totalElemWidth) / (sorted.length - 1)

            let currentX = firstEl.x + firstEl.width + gap
            const positions: Record<string, number> = {}
            for (let i = 1; i < sorted.length - 1; i++) {
                positions[sorted[i].id] = Math.round(currentX)
                currentX += sorted[i].width + gap
            }

            const newElements = elements.map(el => {
                if (!selectedIds.includes(el.id)) return el
                if (positions[el.id] !== undefined) return { ...el, x: positions[el.id] }
                return el
            })
            commitHistory(newElements)

        } else {
            const sorted = [...selectedEls].sort((a, b) => a.y - b.y)
            const firstEl = sorted[0]
            const lastEl = sorted[sorted.length - 1]
            const totalSpan = (lastEl.y + lastEl.height) - firstEl.y
            const totalElemHeight = sorted.reduce((sum, el) => sum + el.height, 0)
            const gap = (totalSpan - totalElemHeight) / (sorted.length - 1)

            let currentY = firstEl.y + firstEl.height + gap
            const positions: Record<string, number> = {}
            for (let i = 1; i < sorted.length - 1; i++) {
                positions[sorted[i].id] = Math.round(currentY)
                currentY += sorted[i].height + gap
            }

            const newElements = elements.map(el => {
                if (!selectedIds.includes(el.id)) return el
                if (positions[el.id] !== undefined) return { ...el, y: positions[el.id] }
                return el
            })
            commitHistory(newElements)
        }
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

        const offsets = newSelectedIds?.map(selectedId => {
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
        <div className="flex-1 flex flex-col gap-4 xl:flex-row min-h-0 overflow-hidden">
            {/* Toolbar / Canvas Area */}
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto overflow-x-hidden pr-3 custom-scrollbar pb-40">
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
                        <Button variant="outline" size="sm" onClick={() => addElement('dynamic_image')} title="Icono condicional que aparece o desaparece según el producto">
                            <ImageIcon className="h-4 w-4 mr-2 text-indigo-500" /> Icono Variable
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
                            <div className="flex flex-wrap items-center ml-2 border-l pl-2 gap-1 bg-slate-50 rounded-md p-1">
                                <Button title="Alinear a la Izquierda" variant="ghost" size="icon-sm" onClick={() => alignElements('left')}><AlignHorizontalJustifyStart className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear al Centro Horizontal" variant="ghost" size="icon-sm" onClick={() => alignElements('center')}><AlignHorizontalJustifyCenter className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear a la Derecha" variant="ghost" size="icon-sm" onClick={() => alignElements('right')}><AlignRight className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear Arriba" variant="ghost" size="icon-sm" onClick={() => alignElements('top')}><AlignVerticalJustifyStart className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear al Centro Vertical" variant="ghost" size="icon-sm" onClick={() => alignElements('middle')}><AlignVerticalJustifyCenter className="h-4 w-4 text-blue-600" /></Button>
                                <Button title="Alinear Abajo" variant="ghost" size="icon-sm" onClick={() => alignElements('bottom')}><AlignVerticalJustifyEnd className="h-4 w-4 text-blue-600" /></Button>
                                {/* Distribute (requires 3+ elements) */}
                                {selectedIds.length >= 3 && (
                                    <>
                                        <div className="w-px bg-slate-300 mx-0.5 self-stretch" />
                                        <Button title="Distribuir uniformemente (Horizontal)" variant="ghost" size="icon-sm" onClick={() => distributeElements('horizontal')}>
                                            <AlignHorizontalDistributeCenter className="h-4 w-4 text-indigo-500" />
                                        </Button>
                                        <Button title="Distribuir uniformemente (Vertical)" variant="ghost" size="icon-sm" onClick={() => distributeElements('vertical')}>
                                            <AlignVerticalDistributeCenter className="h-4 w-4 text-indigo-500" />
                                        </Button>
                                    </>
                                )}
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
                                {selectedIds.length > 1 && elements.filter(e => selectedIds.includes(e.id)).every(e => e.type === 'image' || e.type === 'dynamic_image') && (
                                    <Button title="Agrupar Iconos (Group)" variant="ghost" size="icon-sm" onClick={groupElements}><LayoutGrid className="h-4 w-4 text-orange-600" /></Button>
                                )}
                                {selectedIds.length === 1 && elements.find(e => e.id === selectedIds[0])?.type === 'icon_group' && (
                                    <Button title="Desagrupar (Ungroup)" variant="ghost" size="icon-sm" onClick={ungroupElements}><Combine className="h-4 w-4 text-orange-600" /></Button>
                                )}
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

                {/* Secondary Preview Toolbar — Dedicated space for navigation controls */}
                {isPreviewMode && (
                    <div className="flex gap-2 items-center bg-indigo-50/50 p-2 px-4 rounded-xl border border-indigo-100/50 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2 pr-3 border-r border-indigo-100 mr-1">
                            <Eye className="h-3.5 w-3.5 text-indigo-500" />
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Navegación de Preview</span>
                        </div>
                        
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleBasePreview}
                            disabled={isLoadingRandom}
                            title="Volver al producto con el nombre más largo (Caso de Estrés)"
                            className="h-8 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100/50 transition-colors"
                        >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Caso Base (Nombre Largo)
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRandomPreview}
                            disabled={isLoadingRandom}
                            title="Cargar un producto aleatorio en el preview"
                            className="h-8 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100/50 transition-colors"
                        >
                            {isLoadingRandom
                                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                : <Shuffle className="mr-1.5 h-3.5 w-3.5" />}
                            Producto Aleatorio
                        </Button>

                        <div className="flex-1" />
                        <span className="text-[10px] text-indigo-300 italic hidden md:block">
                            Visualizando: {previewData?.final_name_es || 'Cargando...'}
                        </span>
                    </div>
                )}

                {/* The Canvas Area */}
                <div className="flex-1 overflow-auto bg-slate-100 p-8 rounded-xl border flex items-center justify-center relative shadow-inner min-h-[500px]">
                    <div
                        ref={canvasRef}
                        onMouseDown={handleCanvasClick}
                        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
                        className="bg-white shadow-xl relative ring-1 ring-slate-200 shrink-0 origin-center select-none overflow-hidden"
                    >
                        {/* Render elements */}
                        {elements?.filter(e => !e.groupId).map((el) => {
                            const isSelected = selectedIds.includes(el.id);

                            const renderElementInner = (childEl: TemplateElement) => (
                                <>
                                    {/* Dashed/Solid Line type */}
                                    {childEl.type === 'dashed_line' && (
                                        <div
                                            className="w-full h-full border-gray-800"
                                            style={{ borderBottomStyle: childEl.borderStyle || 'solid', borderBottomWidth: childEl.borderWidth || 2 }}
                                        />
                                    )}

                                    {/* Image type */}
                                    {childEl.type === 'image' && (
                                        <div className="w-full h-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50/50 overflow-hidden">
                                            {isPreviewMode ? (
                                                (() => {
                                                    const systemAsset = assets.find(a => a.name === childEl.content);
                                                    if (systemAsset && systemAsset.file_path) return <img src={systemAsset.file_path} className="max-w-full max-h-full object-contain pointer-events-none" />
                                                    if (childEl.content === 'logo_empresa' || childEl.content === 'Logo Firplak general') {
                                                        const logoAsset = assets.find(a => (a.name === 'Logo Firplak general') || (a.type === 'logo' && a.name.toLowerCase().includes('logo')));
                                                        if (logoAsset && logoAsset.file_path) return <img src={logoAsset.file_path} className="max-w-full max-h-full object-contain pointer-events-none" />
                                                        return <span className="text-gray-400 text-[10px] text-center">[Logo No Encontrado]</span>
                                                    }
                                                    if (childEl.content === 'Isométrico' || childEl.content === 'isometrico_placeholder' || childEl.content === 'Isométrico (Placeholder)') {
                                                        if (previewData?.isometric_path) return <img src={previewData.isometric_path} className="max-w-full max-h-full object-contain pointer-events-none" />
                                                        return <span className="text-red-500 text-[10px] font-bold text-center border border-red-200 bg-red-50 p-1 rounded">[FALTA ISOMÉTRICO]</span>
                                                    }
                                                    const asset = assets.find(a => a.id === childEl.content || a.name === childEl.content);
                                                    if (asset && asset.file_path) return <img src={asset.file_path} className="max-w-full max-h-full object-contain pointer-events-none" />
                                                    return <span className="text-gray-400 text-xs font-semibold pointer-events-none p-1 text-center bg-white/70 rounded">[{childEl.content}]</span>
                                                })()
                                            ) : <span className="text-gray-400 text-xs font-semibold pointer-events-none p-1 text-center bg-white/70 rounded">[{childEl.content}]</span>}
                                        </div>
                                    )}

                                    {/* Dynamic Image type */}
                                    {childEl.type === 'dynamic_image' && (
                                        <DynamicImageElement 
                                            el={childEl} 
                                            isPreviewMode={isPreviewMode} 
                                            previewData={enrichedData} 
                                        />
                                    )}

                                    {/* Barcode type */}
                                    {childEl.type === 'barcode' && (
                                        <div className="w-full h-full bg-slate-800 pointer-events-none text-white text-xs flex items-center justify-center opacity-70 overflow-hidden">
                                            ||| BARCODE {isPreviewMode && previewData && previewData[childEl.dataField || ''] ? `(${previewData[childEl.dataField || '']})` : ''} |||
                                        </div>
                                    )}

                                    {/* Text types */}
                                    {(childEl.type === 'dynamic_text' || childEl.type === 'text') && (
                                        <OverflowText
                                            {...(childEl as any)}
                                            text={childEl.type === 'dynamic_text' ? `{${childEl.dataField}}` : (childEl.content || '')}
                                            isPreviewMode={isPreviewMode}
                                            previewData={previewData}
                                        />
                                    )}
                                </>
                            );

                            return (
                                <div
                                    key={el.id}
                                    onMouseDown={(e) => handleMouseDownOnElement(e, el.id)}
                                    className={`absolute flex items-center justify-center cursor-move shadow-sm ${isSelected ? 'ring-1 ring-blue-500 z-10' : 'hover:ring-1 hover:ring-blue-300 border border-transparent hover:border-dashed hover:border-gray-400'}`}
                                    style={{
                                        left: el.x,
                                        top: el.y,
                                        width: el.width,
                                        height: el.height,
                                        fontSize: `${el.fontSize}pt`,
                                        fontWeight: el.fontWeight as 'normal' | 'bold' | '500',
                                        fontStyle: el.fontStyle,
                                        fontFamily: el.fontFamily === 'Montserrat' ? 'var(--font-montserrat), sans-serif' : 'inherit',
                                        color: (el as any).color,
                                        backgroundColor: el.type === 'icon_group' ? (isPreviewMode ? 'transparent' : 'rgba(238, 242, 255, 0.4)') : (el as any).backgroundColor,
                                        border: el.type === 'icon_group' && !isPreviewMode ? '1px dashed #818cf8' : undefined,
                                        textTransform: ((el as any).textTransform as any) || 'none'
                                    }}
                                >
                                    {renderResizeHandles(el)}
                                    {el.type === 'icon_group' && !isPreviewMode && elements.filter(c => c.groupId === el.id).length === 0 && (
                                        <span className="text-indigo-400 text-[10px] absolute -top-4 pointer-events-none bg-white px-1 leading-none rounded">Grupo Vacío</span>
                                    )}

                                    {el.type === 'icon_group' ? (
                                        <div 
                                            className="w-full h-full flex overflow-hidden pointer-events-none p-1"
                                            style={{
                                                gap: `${el.groupGapMM ?? 2}mm`,
                                                justifyContent: el.groupAlign || 'flex-start',
                                                flexWrap: el.groupWrap ? 'wrap' : 'nowrap',
                                                alignItems: 'center'
                                            }}
                                        >
                                            {elements.filter(child => child.groupId === el.id).map(child => {
                                                const isChildSelected = selectedIds.includes(child.id);
                                                // Pre-calculate URL to force dropping non-rendered content in flex container correctly
                                                const iconUrl = child.type === 'dynamic_image' && isPreviewMode ? enrichedData?.[`${child.dataField}_url`] : true;
                                                if (!iconUrl) return null; // Complete flexbox collapse when no URL is verified

                                                return (
                                                    <div 
                                                        key={child.id}
                                                        onMouseDown={(e) => handleMouseDownOnElement(e, child.id)}
                                                        className={`relative flex items-center justify-center pointer-events-auto cursor-pointer shrink-0 ${isChildSelected ? 'ring-2 ring-indigo-500 z-10' : 'hover:ring-1 hover:ring-indigo-300'}`}
                                                        style={{
                                                            width: child.width,
                                                            height: child.height 
                                                        }}
                                                    >
                                                        {renderElementInner(child)}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        renderElementInner(el)
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Properties Panel */}
            <div className="w-full xl:w-80 flex flex-col shrink-0 h-full">
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

                            {activeEl.type === 'icon_group' && (
                                <div className="flex flex-col gap-4 border border-indigo-100 bg-indigo-50/30 p-3 rounded-lg shadow-sm">
                                    <div>
                                        <Label className="text-xs text-slate-700 font-semibold mb-1 block">Espaciado entre Iconos (mm)</Label>
                                        <Input 
                                            type="number" 
                                            step="0.5"
                                            min="0"
                                            value={activeEl.groupGapMM ?? 2} 
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                updateSelectedElements({ groupGapMM: isNaN(val) ? 0 : Math.max(0, val) });
                                            }} 
                                            className="h-8 shadow-sm text-sm" 
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-700 font-semibold mb-1 block">Alineación Interna</Label>
                                        <select 
                                            value={activeEl.groupAlign || 'flex-start'} 
                                            onChange={(e) => updateSelectedElements({ groupAlign: e.target.value as any })}
                                            className="w-full text-sm h-8 rounded border-slate-200 outline-none"
                                        >
                                            <option value="flex-start">Izquierda</option>
                                            <option value="center">Centro</option>
                                            <option value="flex-end">Derecha</option>
                                            <option value="space-between">Nivelado a extremos</option>
                                        </select>
                                    </div>
                                    <div className="pt-2 border-t border-indigo-100">
                                        <Button variant="outline" size="sm" className="w-full text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={ungroupElements}>
                                            <Combine className="w-4 h-4 mr-2" />
                                            Desagrupar
                                        </Button>
                                    </div>
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
                                        {isExternalDataSource && datasetSchema.length > 0 ? (
                                            <optgroup label="Dataset Externo">
                                                {datasetSchema.map(f => (
                                                    <option key={f.key} value={f.key}>{f.label}</option>
                                                ))}
                                            </optgroup>
                                        ) : (
                                            CORE_VARIABLE_OPTS.map(group => (
                                                <optgroup key={group.group} label={group.group}>
                                                    {group.options.map(opt => (
                                                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))
                                        )}
                                        {/* NOTE: Icon data fields removed — use 'Icono Variable' element type instead */}
                                    </select>
                                </div>
                            )}

                            {activeEl.type === 'text' && (
                                <div>
                                    <Label className="text-xs text-slate-700 font-semibold mb-1 block">Contenido del texto libre</Label>
                                    <RichTextEditor 
                                        content={activeEl.content || ''}
                                        onChange={(val) => updateSelectedElements({ content: val })}
                                        isExternalDataSource={isExternalDataSource}
                                        datasetSchema={datasetSchema}
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
                                        <option value="Logo Firplak general">Logo Firplak general</option>
                                        <option value="Isométrico">Isométrico (Dinámico)</option>
                                        <option value="Icono RH Fijo">Icono RH Fijo</option>
                                        <option value="Icono Canto">Icono Canto</option>
                                        <option value="Icono Cierre Lento">Icono Cierre Lento</option>
                                        <option value="Icono Extensión Total">Icono Extensión Total</option>

                                        {assets.filter(a => ![
                                            'Logo Firplak general',
                                            'Isométrico',
                                            'Icono RH Fijo',
                                            'Icono Canto',
                                            'Icono Cierre Lento',
                                            'Icono Extensión Total'
                                        ].includes(a.name)).length > 0 && (
                                            <optgroup label="Assets (Base de Datos)">
                                                {assets
                                                    .filter(a => ![
                                                        'Logo Firplak general',
                                                        'Isométrico',
                                                        'Icono RH Fijo',
                                                        'Icono Canto',
                                                        'Icono Cierre Lento',
                                                        'Icono Extensión Total'
                                                    ].includes(a.name))
                                                    ?.map(a => (
                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                    ))
                                                }
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                            )}

                            {/* dynamic_image properties */}
                            {activeEl.type === 'dynamic_image' && (
                                <div className="space-y-3">
                                    <div>
                                        <Label className="text-xs text-slate-700 font-semibold mb-1 block">Icono Condicional</Label>
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            value={activeEl.dataField || 'icon_rh'}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const updates: Partial<TemplateElement> = { dataField: val };
                                                if (val === 'icon_riel') {
                                                    updates.caption = '<div>{caption_es}<br>{caption_en}</div>';
                                                } else if (val === 'icon_bisagras') {
                                                    updates.caption = '<div>{caption_es}<br>{caption_en}</div>';
                                                } else if (val === 'icon_canto') {
                                                    updates.caption = '<div>{caption_es}<br>{caption_en}</div>';
                                                } else if (val === 'icon_rh') {
                                                    updates.caption = '<div>RH<br>Resistente a la humedad</div>';
                                                }
                                                updateSelectedElements(updates);
                                            }}
                                        >
                                            <option value="icon_rh">Icono RH — Resistente a la Humedad</option>
                                            <option value="icon_canto">Icono Canto — Borde de puertas</option>
                                            <option value="icon_bisagras">Icono Bisagras — Cierre Lento</option>
                                            <option value="icon_riel">Icono Riel — Extensión / Oculto</option>
                                            {/* Additional icons will be added here in future phases */}
                                        </select>
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            El icono aparece o desaparece automáticamente según el producto. La imagen se toma del sistema de Recursos.
                                        </p>
                                    </div>

                                    <div>
                                        <Label className="text-xs text-slate-700 font-semibold mb-1 block">Caption (texto debajo del icono)</Label>
                                        <CaptionEditor
                                            content={activeEl.caption || ''}
                                            onChange={(val) => updateSelectedElements({ caption: val })}
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            Selecciona texto para aplicar formato local: peso, tamaño, interlineado, alineación.
                                        </p>
                                    </div>

                                    <div className="border-t pt-3 mt-1">
                                        <Label className="text-[11px] text-slate-700 font-bold mb-2 flex items-center gap-1">
                                            <ImageIcon className="h-3 w-3" /> Tamaño Fijo del Icono (Estandarización)
                                        </Label>
                                        
                                        <div className="grid grid-cols-3 gap-2 mb-3">
                                            {[10, 15, 20].map(mm => (
                                                <Button
                                                    key={mm}
                                                    variant="outline"
                                                    size="sm"
                                                    className={cn(
                                                        "h-7 text-[10px] px-1 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all",
                                                        ((activeEl.iconSizeMM || 15) === mm) && "bg-indigo-50 border-indigo-500 text-indigo-700 font-bold"
                                                    )}
                                                    onClick={() => updateSelectedElements({ 
                                                        iconSizeMM: mm
                                                    })}
                                                >
                                                    {mm} mm
                                                </Button>
                                            ))}
                                        </div>

                                        <div className="mb-3">
                                            <Label className="text-[10px] text-slate-500 mb-1 block">Tamaño Variable (Precisión 1mm)</Label>
                                            <div className="flex gap-2 items-center">
                                                <Input 
                                                    type="number" 
                                                    step="1"
                                                    min="1"
                                                    max="50"
                                                    className="h-8 text-sm" 
                                                    value={activeEl.iconSizeMM || 15} 
                                                    onChange={(e) => updateSelectedElements({ iconSizeMM: parseInt(e.target.value) || 15 })} 
                                                />
                                                <span className="text-[10px] text-slate-400 font-medium">mm</span>
                                            </div>
                                        </div>

                                        <div className="mb-3">
                                            <Label className="text-[10px] text-slate-500 mb-1 block">Separación con el Texto (Gap mm)</Label>
                                            <div className="flex gap-2 items-center">
                                                <Input 
                                                    type="number" 
                                                    step="0.5"
                                                    min="0"
                                                    max="20"
                                                    className="h-8 text-sm" 
                                                    value={activeEl.captionGapMM ?? 2} 
                                                    onChange={(e) => updateSelectedElements({ captionGapMM: parseFloat(e.target.value) || 0 })} 
                                                />
                                                <span className="text-[10px] text-slate-400 font-medium">mm</span>
                                            </div>
                                        </div>

                                        <div className="mb-4">
                                            <Label className="text-[11px] mb-1 block">Alineación Vertical del Bloque</Label>
                                            <div className="flex gap-1 bg-slate-100 p-1 rounded-md border border-slate-200">
                                                <Button 
                                                    title="Arriba"
                                                    size="icon" 
                                                    variant={activeEl.verticalAlign === 'top' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.verticalAlign === 'top' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ verticalAlign: 'top' })}
                                                >
                                                    <AlignVerticalJustifyStart className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    title="Centro"
                                                    size="icon" 
                                                    variant={activeEl.verticalAlign === 'middle' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.verticalAlign === 'middle' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ verticalAlign: 'middle' })}
                                                >
                                                    <AlignVerticalJustifyCenter className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    title="Abajo"
                                                    size="icon" 
                                                    variant={activeEl.verticalAlign === 'bottom' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.verticalAlign === 'bottom' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ verticalAlign: 'bottom' })}
                                                >
                                                    <AlignVerticalJustifyEnd className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 flex-1 text-[9px] text-slate-500 hover:text-indigo-600 border border-dashed border-slate-200"
                                                onClick={() => {
                                                    const max = Math.max(activeEl.width, activeEl.height)
                                                    updateSelectedElements({ width: max, height: max })
                                                }}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-2.5 h-2.5 border-2 border-current rounded-sm" />
                                                    Hacer Cuadrado el Recuadro
                                                </div>
                                            </Button>
                                        </div>
                                        <p className="text-[9.5px] text-slate-400 mt-2 italic">
                                            El icono mantendrá este tamaño fijo. Si el conjunto no cabe en el recuadro, verás una alerta de desbordamiento.
                                        </p>
                                    </div>
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


                                    <div className="grid grid-cols-1 gap-3">
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Alineación Horizontal</Label>
                                            <div className="flex gap-1 bg-slate-100 p-1 rounded-md border border-slate-200">
                                                <Button 
                                                    title="Izquierda"
                                                    size="icon" 
                                                    variant={activeEl.textAlign === 'left' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.textAlign === 'left' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ textAlign: 'left' })}
                                                >
                                                    <AlignLeft className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    title="Centro"
                                                    size="icon" 
                                                    variant={activeEl.textAlign === 'center' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.textAlign === 'center' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ textAlign: 'center' })}
                                                >
                                                    <AlignCenter className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    title="Derecha"
                                                    size="icon" 
                                                    variant={activeEl.textAlign === 'right' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.textAlign === 'right' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ textAlign: 'right' })}
                                                >
                                                    <AlignRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Alineación Vertical</Label>
                                            <div className="flex gap-1 bg-slate-100 p-1 rounded-md border border-slate-200">
                                                <Button 
                                                    title="Arriba"
                                                    size="icon" 
                                                    variant={activeEl.verticalAlign === 'top' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.verticalAlign === 'top' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ verticalAlign: 'top' })}
                                                >
                                                    <AlignVerticalJustifyStart className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    title="Centro"
                                                    size="icon" 
                                                    variant={activeEl.verticalAlign === 'middle' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.verticalAlign === 'middle' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ verticalAlign: 'middle' })}
                                                >
                                                    <AlignVerticalJustifyCenter className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    title="Abajo"
                                                    size="icon" 
                                                    variant={activeEl.verticalAlign === 'bottom' ? 'default' : 'ghost'} 
                                                    className={cn("h-7 flex-1 shadow-none transition-all", activeEl.verticalAlign === 'bottom' ? "bg-white text-indigo-600 shadow-sm hover:bg-white" : "text-slate-500 hover:bg-slate-200")} 
                                                    onClick={() => updateSelectedElements({ verticalAlign: 'bottom' })}
                                                >
                                                    <AlignVerticalJustifyEnd className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Kerning (espaciado)</Label>
                                            <div className="flex items-center gap-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    className="bg-white h-8 text-xs"
                                                    value={activeEl.letterSpacing ?? 0}
                                                    onChange={(e) => updateSelectedElements({ letterSpacing: parseFloat(e.target.value) || 0 })}
                                                />
                                                <span className="text-[10px] text-gray-400 shrink-0">em</span>
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-[11px] mb-1 block">Transformación</Label>
                                            <select
                                                className="flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                value={activeEl.textTransform || 'none'}
                                                onChange={(e) => updateSelectedElements({ textTransform: e.target.value as any })}
                                            >
                                                <option value="none">Normal</option>
                                                <option value="uppercase">MAYÚSCULAS</option>
                                                <option value="lowercase">minúsculas</option>
                                                <option value="capitalize">Tipo Título</option>
                                            </select>
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

                        <div className="space-y-4 border-t pt-4 border-slate-200">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                                    <FileEdit className="w-4 h-4 text-indigo-600" />
                                </div>
                                <h4 className="font-bold text-slate-800 text-sm">Nombre de Exportación</h4>
                            </div>

                            <div className="space-y-3">
                                <div className="flex flex-col gap-2">
                                    <Input
                                        value={exportFilenameFormat}
                                        onChange={(e) => {
                                            setExportFilenameFormat(e.target.value)
                                            setIsModified(true)
                                        }}
                                        placeholder="Ej: ETIQ_{sku_base}_{final_name_es}"
                                        className="font-mono text-sm h-10"
                                    />
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val) {
                                                setExportFilenameFormat(prev => prev + `{${val}}`)
                                                setIsModified(true)
                                                e.target.value = ""
                                            }
                                        }}
                                        value=""
                                    >
                                        <option value="" disabled>+ Insertar Variable</option>
                                        {isExternalDataSource && datasetSchema.length > 0 ? (
                                            datasetSchema.map(f => (
                                                <option key={f.key} value={f.key}>{f.label}</option>
                                            ))
                                        ) : (
                                            CORE_VARIABLE_OPTS.map(group => (
                                                <optgroup key={group.group} label={group.group}>
                                                    {group.options.map(o => (
                                                        <option key={o.key} value={o.key}>{o.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))
                                        )}
                                    </select>
                                </div>

                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="w-full h-8 text-xs font-semibold gap-2 border-slate-200 hover:bg-slate-50 transition-colors"
                                    onClick={async () => {
                                        setIsValidating(true);
                                        setValidationResult(null);
                                        try {
                                            const res = await validateExportFilenameLength(exportFilenameFormat, template.data_source);
                                            setValidationResult(res);
                                            if (res.success) {
                                                toast.success(`Validación exitosa: ${res.count} registros cumplen.`);
                                            } else {
                                                toast.error(res.error);
                                            }
                                        } finally {
                                            setIsValidating(false);
                                        }
                                    }}
                                    disabled={isValidating}
                                >
                                    {isValidating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3 text-indigo-500" />}
                                    Verificar largo del nombre
                                </Button>

                                {validationResult && (
                                    <div className={cn(
                                        "p-2 rounded-lg border flex items-start gap-2",
                                        validationResult.success ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
                                    )}>
                                        {validationResult.success ? (
                                            <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0 mt-0.5" />
                                        ) : (
                                            <AlertTriangle className="h-3 w-3 text-red-600 shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1">
                                            <p className={cn(
                                                "text-[10px] font-bold",
                                                validationResult.success ? "text-green-800" : "text-red-800"
                                            )}>
                                                {validationResult.success ? "Éxito" : "Largo excedido"}
                                            </p>
                                            <p className={cn(
                                                "text-[9px] mt-0.5",
                                                validationResult.success ? "text-green-600" : "text-red-600"
                                            )}>
                                                {validationResult.success 
                                                    ? 'Todos los nombres cumplen.' 
                                                    : validationResult.error}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    <p className="text-[9px] text-slate-500 font-medium uppercase mb-1">Previsualización:</p>
                                    <p className="text-[11px] font-mono text-indigo-600 break-all bg-white p-1 rounded border">
                                        {hydrateText(exportFilenameFormat, enrichedData || previewData || { sku_base: 'SKU123', final_name_es: 'NOMBRE_EJEMPLO' })}.pdf
                                    </p>
                                    <p className="text-[9px] text-slate-400 mt-1 italic">
                                        Longitud estimada: <b>{hydrateText(exportFilenameFormat, enrichedData || previewData || { sku_base: 'SKU123', final_name_es: 'NOMBRE_EJEMPLO' }).length}</b> caracteres.
                                    </p>
                                </div>
                            </div>

                            <Label className="font-semibold text-xs text-muted-foreground uppercase flex items-center pt-4">Configuración de Plantilla</Label>
                            
                            <div className="space-y-4 bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                                <div>
                                    <Label className="text-[11px] font-bold text-slate-500 mb-1.5 block uppercase">Nombre de Plantilla</Label>
                                    <Input 
                                        value={templateName} 
                                        onChange={(e) => {
                                            setTemplateName(e.target.value)
                                            setIsModified(true)
                                        }}
                                        className="h-9 text-sm border-indigo-50 focus:border-indigo-200"
                                    />
                                </div>

                                <div>
                                    <Label className="text-[11px] font-bold text-slate-500 mb-1.5 block uppercase">Fuente de Datos (Base de Datos)</Label>
                                    <select
                                        className="flex h-9 w-full rounded-md border border-indigo-50 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus:border-indigo-200"
                                        value={dataSource}
                                        onChange={(e) => handleDataSourceChange(e.target.value)}
                                    >
                                        <option value="core_firplak">Firplak Core (Catálogo Maestro)</option>
                                        <optgroup label="Bases de Datos Externas">
                                            {availableDatasets.map(ds => (
                                                <option key={ds.id} value={ds.id}>{ds.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
                                        Cambiar la fuente actualizará las variables disponibles y la previsualización.
                                    </p>
                                </div>
                            </div>
                            
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
