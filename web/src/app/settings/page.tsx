import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
    return (
        <div className="flex flex-col gap-8 max-w-4xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
                    <p className="text-muted-foreground">
                        Administra las configuraciones de tu proyecto y las claves API.
                    </p>
                </div>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Configuración del Asistente IA</CardTitle>
                        <CardDescription>Configura la integración con Google Gemini.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form className="flex flex-col gap-4">
                            <div className="grid gap-2">
                                <Label>Clave API de Gemini</Label>
                                <Input type="password" placeholder="AIzaSyB..." defaultValue="*******************" disabled />
                                <p className="text-xs text-muted-foreground">Actualmente esto se carga desde tu archivo .env (`GEMINI_API_KEY`).</p>
                            </div>
                            <div>
                                <Button disabled>Guardar Cambios</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Servicio de Exportación Puppeteer</CardTitle>
                        <CardDescription>Configuración para el motor de renderizado de PDF/Imágenes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form className="flex flex-col gap-4">
                            <div className="grid gap-2">
                                <Label>Tiempo de espera de renderizado (ms)</Label>
                                <Input type="number" defaultValue={30000} disabled />
                            </div>
                            <div className="grid gap-2">
                                <Label>Resolución de Impresión por defecto (DPI)</Label>
                                <Input type="number" defaultValue={300} disabled />
                            </div>
                            <div>
                                <Button disabled>Guardar Cambios</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
