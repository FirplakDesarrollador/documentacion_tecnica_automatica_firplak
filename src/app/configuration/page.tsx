import { dbQuery } from '@/lib/supabase';
import { NomenclaturesSection } from '@/components/rules/NomenclaturesSection';
import { MassImportSettingsSection } from '@/components/rules/MassImportSettingsSection';
import { getNamingComponentsAction, getNamingModelStatusAction } from '@/app/rules/actions';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Settings, Palette, PlusCircle, DatabaseZap, Layers, BookOpen, Users, Printer, ExternalLink, Settings2, Network } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ConfigurationPage() {
  const namingComponents = await getNamingComponentsAction();
  const namingModelStatus = await getNamingModelStatusAction();

  // fetch app settings for mass import
  const settingsRows = await dbQuery(`
    SELECT key, value
    FROM public.app_settings
    WHERE key IN ('mass_import_execute_enabled','mass_import_safe_max_rows')
  `) || [];
  const sByKey = new Map<string, unknown>();
  for (const r of settingsRows) sByKey.set(String(r.key), r.value);
  const initialExecuteEnabled = !!sByKey.get('mass_import_execute_enabled');
  const initialSafeMaxRows = Number(sByKey.get('mass_import_safe_max_rows') ?? 15);

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Configuración</h1>
            <p className="text-muted-foreground">
              Centraliza herramientas administrativas del catálogo, diccionarios y reglas del sistema.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
          <Link href="/configuration/families">
            <Button variant="outline" className="w-full sm:w-auto border-slate-200 text-slate-600 hover:bg-slate-50">
              <PlusCircle className="mr-2 h-4 w-4" />
              Editor de familias
            </Button>
          </Link>
          <Link href="/configuration/reference-editor">
            <Button variant="secondary" className="w-full sm:w-auto">
              <DatabaseZap className="mr-2 h-4 w-4 text-indigo-500" />
              Editor de Referencias
            </Button>
          </Link>
          <Link href="/configuration/version-editor">
            <Button variant="secondary" className="w-full sm:w-auto">
              <Layers className="mr-2 h-4 w-4 text-orange-500" />
              Editor de Versionamiento
            </Button>
          </Link>
          <Link href="/configuration/sku-editor">
            <Button variant="secondary" className="w-full sm:w-auto">
              <DatabaseZap className="mr-2 h-4 w-4 text-emerald-500" />
              Editor de SKUs
            </Button>
          </Link>
          <Link href="/configuration/glossary">
            <Button variant="outline" className="w-full sm:w-auto border-blue-200 text-blue-600 hover:bg-blue-50">
              <BookOpen className="mr-2 h-4 w-4" />
              Glosario
            </Button>
          </Link>
          <Link href="/configuration/versions">
            <Button variant="secondary" className="w-full sm:w-auto">
              <Settings className="mr-2 h-4 w-4 text-indigo-500" />
              Editor de versiones
            </Button>
          </Link>
          <Link href="/configuration/colors">
            <Button variant="secondary" className="w-full sm:w-auto">
              <Palette className="mr-2 h-4 w-4 text-green-600" />
              Editor de colores
            </Button>
          </Link>
          <Link href="/configuration/clients">
            <Button variant="secondary" className="w-full sm:w-auto">
              <Users className="mr-2 h-4 w-4 text-slate-700" />
              Editor de clientes
            </Button>
          </Link>
        </div>
      </div>

      {/* Impresión de etiquetas - Guía de métodos disponibles */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">Impresión de etiquetas</h2>
            <p className="text-muted-foreground text-sm">
              Guía de métodos disponibles para imprimir etiquetas. La configuración se realiza desde la página de Impresión.
            </p>
          </div>
          <Link href="/print">
            <Button variant="outline" className="border-indigo-200 text-indigo-600 hover:bg-indigo-50">
              <Printer className="mr-2 h-4 w-4" />
              Ir a Impresión
              <ExternalLink className="ml-2 h-3 w-3" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Printer className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="font-semibold text-slate-800">Navegador (Ctrl+P)</h3>
            <p className="text-sm text-slate-500 leading-relaxed flex-1">
              Genera el documento (PDF o JPG) y lo abre en una nueva pestaña.
              Tú presionas Ctrl+P, seleccionas la 3nStar LTT334 y confirmas.
              No requiere instalar nada adicional.
            </p>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md w-fit">
              Listo para usar
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-semibold text-slate-800">Agente local</h3>
            <p className="text-sm text-slate-500 leading-relaxed flex-1">
              Pequeño programa que se instala en tu PC (1 vez). Corre en segundo plano
              y recibe los documentos desde el app. Los envía directo a la impresora
              sin que tengas que hacer nada. Es como un &ldquo;driver de impresi&oacute;n web&rdquo;.
            </p>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md w-fit">
              Requiere instalación
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <Network className="w-5 h-5 text-slate-600" />
            </div>
            <h3 className="font-semibold text-slate-800">IP directa (ZPL)</h3>
            <p className="text-sm text-slate-500 leading-relaxed flex-1">
              Envía comandos ZPL directamente a la impresora por TCP/IP al puerto 9100.
              No requiere software adicional. La impresora debe tener IP fija en la red.
              Ideal para impresión 100% automatizada desde el servidor.
            </p>
            <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded-md w-fit">
              En desarrollo
            </span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
          <p className="font-medium text-slate-700 mb-1">Impresora objetivo:</p>
          <p className="font-mono text-xs">3nStar LTT334 &mdash; 4&Prime; Thermal Transfer Label Printer (USB + LAN)</p>
          <p className="text-xs text-slate-400 mt-1">
            La configuración de método, formato, copias y nombre de impresora se ajusta
            desde la página de <Link href="/print" className="text-indigo-600 underline">Impresión</Link>.
          </p>
        </div>
      </div>

      <NomenclaturesSection
        namingComponents={namingComponents}
        namingModelTypes={namingModelStatus.modelTypes}
        orphanFamilyTypes={namingModelStatus.orphanFamilyTypes}
        orphanModelTypes={namingModelStatus.orphanModelTypes}
      />
      <div className="my-10 border-t border-slate-200 w-full" />
      <div className="flex flex-col gap-4 mb-12">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Configuración del Sistema</h2>
          <p className="text-muted-foreground text-sm">
            Flags y límites operativos que controlan módulos críticos.
          </p>
        </div>
        <MassImportSettingsSection
          initialExecuteEnabled={initialExecuteEnabled}
          initialSafeMaxRows={Number.isFinite(initialSafeMaxRows) ? initialSafeMaxRows : 15}
        />
      </div>
    </div>
  );
}
