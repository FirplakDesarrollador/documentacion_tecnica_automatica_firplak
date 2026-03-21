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
import { IsometricAssociationDialog } from '@/components/assets/IsometricAssociationDialog'

export default async function AssetsPage() {
    const assets = await dbQuery(`SELECT * FROM public.assets ORDER BY created_at DESC`) || []

    const defaultNames = [
        'Logo Empresa Pordefecto',
        'Isométrico (Placeholder)',
        'Icono RH Fijo',
        'Icono Canto 2mm',
        'Icono Cierre Lento',
        'Icono Extensión Total'
    ]

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Recursos</h1>
                    <p className="text-muted-foreground">
                        Administra tus logotipos, íconos y símbolos de manejo.
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
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">Vista Previa</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Ruta</TableHead>
                            <TableHead className="w-[140px] text-right">Acciones</TableHead>
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
                                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden border">
                                                {asset.file_path ? (
                                                    <img 
                                                        src={asset.file_path} 
                                                        alt={asset.name} 
                                                        className="max-w-full max-h-full object-contain p-1"
                                                    />
                                                ) : (
                                                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize">
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
