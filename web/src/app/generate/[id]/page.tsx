import prisma from '@/lib/prisma'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { redirect } from 'next/navigation'
import { TemplateElement } from '@/components/templates/TemplateCanvas'
import { ExportButtons } from '@/components/export/ExportButtons'

// We simulate fetching the default template configuration here
// In reality, this would be parsed from the `template.layout_config` JSON field
const templateConfig: TemplateElement[] = [
    { id: '1', type: 'image', x: 20, y: 20, width: 200, height: 50, content: 'FIRPLAK LOGO' },
    { id: '2', type: 'dynamic_text', x: 240, y: 20, width: 500, height: 40, dataField: 'final_name_es', fontSize: 24, fontWeight: 'bold' },
    { id: '3', type: 'barcode', x: 20, y: 320, width: 300, height: 60, dataField: 'barcode_text' },
    { id: '4', type: 'dynamic_text', x: 20, y: 280, width: 300, height: 30, dataField: 'code', fontSize: 16 },
    { id: '5', type: 'dynamic_text', x: 240, y: 70, width: 500, height: 30, dataField: 'sap_description', fontSize: 14 },
]

export default async function GeneratePreviewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const product = await prisma.product.findUnique({
        where: { id }
    })

    if (!product) {
        redirect('/generate')
    }

    // Fetch active rules from DB
    const rules = await prisma.rule.findMany({ where: { enabled: true } })

    // Evaluate rules to get final names and icons
    const engineResult = await evaluateProductRules(product, rules)

    // Hydrate template variables
    const hydratedElements = templateConfig.map(el => {
        let content = el.content
        if (el.type === 'dynamic_text' && el.dataField) {
            if (el.dataField === 'final_name_es') {
                content = engineResult.finalNameEs || 'N/A'
            } else {
                content = String(product[el.dataField as keyof typeof product] || '')
            }
        }
        return { ...el, content }
    })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/generate" className="p-2 hover:bg-muted rounded-full transition-colors">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Generate: {product.code}</h1>
                        <p className="text-muted-foreground">
                            Preview and export the generated label for this product.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <Card className="p-6 bg-muted border flex items-center justify-center min-h-[500px] overflow-auto">
                        {/* HTML Preview Render */}
                        <div
                            id="label-container"
                            className="bg-white shadow-lg relative border shrink-0 scale-75 md:scale-100 origin-center"
                            style={{ width: 800, height: 400 }}
                        >
                            {hydratedElements.map((el) => (
                                <div
                                    key={el.id}
                                    className="absolute flex items-center justify-center overflow-hidden"
                                    style={{
                                        left: el.x,
                                        top: el.y,
                                        width: el.width,
                                        height: el.height,
                                        fontSize: el.fontSize,
                                        fontWeight: el.fontWeight as 'normal' | 'bold',
                                        textAlign: el.textAlign,
                                    }}
                                >
                                    {el.type === 'image' && <span className="text-gray-400 text-sm">[{el.content}]</span>}
                                    {el.type === 'barcode' && <div className="w-full h-full bg-slate-800 text-white text-xs flex items-center justify-center">|||| {product.code} ||||</div>}
                                    {(el.type === 'dynamic_text' || el.type === 'text') && (
                                        <span className="w-full text-black line-clamp-2">
                                            {el.content}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="flex flex-col gap-4">
                    <Card className="p-4 flex flex-col gap-4">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Eye className="w-5 h-5" />
                            Rule Engine Trace
                        </h3>
                        <div className="flex flex-col gap-2 text-sm max-h-[250px] overflow-auto">
                            <p><strong>Derived Name:</strong> {engineResult.finalNameEs || 'None'}</p>
                            <p><strong>Active Icons:</strong> {engineResult.activeIcons.join(', ') || 'None'}</p>
                            <div className="border-t my-2 p-2 bg-slate-50 rounded">
                                <span className="text-xs font-semibold text-slate-500 mb-2 block">Trace Logs:</span>
                                {engineResult.trace.map((t, idx) => (
                                    <div key={idx} className="mb-2">
                                        <span className="text-xs">
                                            {t.passed ? <Badge variant="default" className="bg-green-600 px-1 py-0 mr-1 text-[10px]">PASS</Badge> : <Badge variant="secondary" className="px-1 py-0 mr-1 text-[10px]">FAIL</Badge>}
                                            <code className="text-[10px]">{t.condition}</code>
                                        </span>
                                        {t.actionTaken && <div className="text-[10px] text-blue-600 mt-1 pl-4">{"->"} {t.actionTaken}: {t.payload}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>

                    <Card className="p-4 flex flex-col gap-4">
                        <h3 className="font-semibold text-lg">Export Options</h3>
                        <p className="text-sm text-muted-foreground">Select a format to download the final document via Puppeteer rendering.</p>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <ExportButtons elements={hydratedElements} product={product} />
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}
