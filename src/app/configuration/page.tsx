import { dbQuery } from '@/lib/supabase';
import { NomenclaturesSection } from '@/components/rules/NomenclaturesSection';
import { MassImportSettingsSection } from '@/components/rules/MassImportSettingsSection';
import { PrintSettingsSection } from '@/components/configuration/PrintSettingsSection';
import { getNamingComponentsAction, getNamingModelStatusAction } from '@/app/rules/actions';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Settings, Palette, PlusCircle, DatabaseZap, Layers, BookOpen, Users } from 'lucide-react';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (settingsRows as any[])) sByKey.set(String(r.key), r.value);
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
        <PrintSettingsSection />
        <MassImportSettingsSection
          initialExecuteEnabled={initialExecuteEnabled}
          initialSafeMaxRows={Number.isFinite(initialSafeMaxRows) ? initialSafeMaxRows : 15}
        />
      </div>
    </div>
  );
}
