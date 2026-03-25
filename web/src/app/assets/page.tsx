import { dbQuery } from '@/lib/supabase'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Search, Image as ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { UploadAssetButton } from '@/components/assets/UploadAssetButton'
import { EditAssetDialog } from '@/components/assets/EditAssetDialog'
import { DeleteAssetDialog } from '@/components/assets/DeleteAssetDialog'
import { ViewAssetDialog } from '@/components/assets/ViewAssetDialog'
import { IsometricAssociationDialog } from '@/components/assets/IsometricAssociationDialog'

export default async function AssetsPage() {
    const assets = await dbQuery(`SELECT * FROM public.assets ORDER BY created_at DESC`) || []

    const defaultNames = [
        'Logo Empresa Pordefecto',
        'Isométrico (Placeholder)',
        'Icono RH Fijo',
        'Icono Canto 2mm',
        'Icono Cierre Lento',
        'Icono Extensión Total',
        { name: 'Icono CARB2', type: 'image' },
    { name: 'Logo CHILEMAT', type: 'image' },
    { name: 'Logo D-ACQUA', type: 'image' },
    { name: 'Logo PROMART', type: 'image' },
    { name: 'Logo FERMETAL', type: 'image' }
]

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Recursos Multimedia</h1>
                    <p className="text-slate-500 mt-2 text-sm max-w-2xl">
                        Biblioteca centralizada de logotipos, iconos de herrajes e isométricos técnicos para la documentación.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <IsometricAssociationDialog />
                    <UploadAssetButton />
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-wrap gap-4 items-center bg-slate-50/50">
                    <div className="relative w-full max-w-sm border-none shadow-none focus-visible:ring-0">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Buscar recursos..."
                            className="w-full pl-8"
                        />
                    </div>
                </div>
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead className="w-[100px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Vista</TableHead>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Categoría</TableHead>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Identificador</TableHead>
                            <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Ruta de Archivo</TableHead>
                            <TableHead className="w-[140px] text-right uppercase tracking-wider text-[10px] font-bold text-slate-500">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {assets.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No se han subido Recursos aún.
                                </TableCell>
                            </TableRow>
                        ) : (
                            assets.map((asset: any) => {
                                const isDefault = defaultNames.includes(asset.name)
                                return (
                                    <TableRow key={asset.id}>
                                        <TableCell>
                                            <ViewAssetDialog assetName={asset.name} assetUrl={asset.file_path}>
                                                <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-500/50 hover:border-indigo-500 transition-all shadow-sm">
                                                    {asset.file_path ? (
                                                        <img 
                                                            src={asset.file_path} 
                                                            alt={asset.name} 
                                                            className="max-w-full max-h-full object-contain p-1.5"
                                                        />
                                                    ) : (
                                                        <ImageIcon className="h-5 w-5 text-slate-300" />
                                                    )}
                                                </div>
                                            </ViewAssetDialog>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className="bg-slate-50 text-slate-600 ring-1 ring-slate-600/10 hover:bg-slate-50 text-[9px] px-1.5 py-0 font-bold uppercase tracking-tight">
                                                {asset.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-medium text-slate-800">
                                            {asset.name}
                                            {isDefault && <Badge variant="secondary" className="ml-2 text-[8px] h-4">Sistema</Badge>}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]">
                                            {asset.file_path || 'Sin archivo'}
                                        </TableCell>
                                        <TableCell className="text-right flex items-center justify-end gap-1">
                                            <ViewAssetDialog assetName={asset.name} assetUrl={asset.file_path} />
                                            <EditAssetDialog 
                                                assetId={asset.id} 
                                                assetName={asset.name} 
                                                isDefault={isDefault}
                                            />
                                            {!isDefault && (
                                                <DeleteAssetDialog 
                                                    assetId={asset.id} 
                                                    assetName={asset.name} 
                                                />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
