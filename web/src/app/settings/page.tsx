import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
    return (
        <div className="flex flex-col gap-8 max-w-4xl">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Configuración del Sistema</h1>
                    <p className="text-slate-500 text-sm max-w-2xl leading-relaxed">
                        Gestiona las credenciales de servicios externos, parámetros de renderizado y preferencias globales de la plataforma.
                    </p>
                </div>
            </div>

            <div className="grid gap-6">
                <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-900">Inteligencia Artificial</CardTitle>
                        <CardDescription className="text-xs text-slate-500">Configuración del motor Google Gemini Pro.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        <form className="flex flex-col gap-6">
                            <div className="grid gap-2.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Gemini API Key</Label>
                                <Input type="password" placeholder="AIzaSyB..." defaultValue="*******************" disabled className="bg-slate-50/50 border-slate-200 text-slate-400 font-mono text-xs" />
                                <p className="text-[10px] text-indigo-600 font-medium">✨ Cargada automáticamente desde el entorno seguro (.env)</p>
                            </div>
                            <div className="pt-2">
                                <Button disabled className="bg-slate-100 text-slate-400 border-none shadow-none text-xs font-bold uppercase tracking-wider">Guardar Preferencias</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/60 shadow-sm rounded-xl overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-900">Motor de Renderizado</CardTitle>
                        <CardDescription className="text-xs text-slate-500">Parámetros de exportación Puppeteer / PDF.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        <form className="flex flex-col gap-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="grid gap-2.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Timeout de Renderizado (ms)</Label>
                                    <Input type="number" defaultValue={30000} disabled className="bg-slate-50/50 border-slate-200 text-slate-600 font-mono text-xs" />
                                </div>
                                <div className="grid gap-2.5">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Resolución DPI Estándar</Label>
                                    <Input type="number" defaultValue={300} disabled className="bg-slate-50/50 border-slate-200 text-slate-600 font-mono text-xs" />
                                </div>
                            </div>
                            <div className="pt-2">
                                <Button disabled className="bg-slate-100 text-slate-400 border-none shadow-none text-xs font-bold uppercase tracking-wider">Actualizar Motor</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
