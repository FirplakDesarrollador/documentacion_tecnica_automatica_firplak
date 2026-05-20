import { dbQuery } from '@/lib/supabase';
import { RulesTable } from '@/components/rules/RulesTable';
import { NomenclaturesSection } from '@/components/rules/NomenclaturesSection';
import { MassImportSettingsSection } from '@/components/rules/MassImportSettingsSection';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Settings, Palette } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  // fetch all rules
  const rules = await dbQuery(`SELECT * FROM public.rules ORDER BY rule_type ASC, priority ASC`) || [];
  const namingRules = rules.filter((r: any) => r.rule_type === 'name_component');

  // fetch app settings for mass import
  const settingsRows = await dbQuery(`
    SELECT key, value
    FROM public.app_settings
    WHERE key IN ('mass_import_execute_enabled','mass_import_safe_max_rows')
  `) || [];
  const sByKey = new Map<string, any>();
  for (const r of settingsRows) sByKey.set(String(r.key), r.value);
  const initialExecuteEnabled = !!sByKey.get('mass_import_execute_enabled');
  const initialSafeMaxRows = Number(sByKey.get('mass_import_safe_max_rows') ?? 15);

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Configuración de Reglas</h1>
          <p className="text-muted-foreground">
            Administra cómo se estructuran los nombres de tus productos y centraliza la inteligencia del negocio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rules/versions">
            <Button variant="outline" className="h-10 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold uppercase text-xs shadow-sm shadow-indigo-100">
              <Settings className="w-4 h-4 mr-2" />
              Diccionario Versiones
            </Button>
          </Link>
          <Link href="/rules/colors">
            <Button variant="outline" className="h-10 border-green-200 text-green-700 hover:bg-green-50 font-bold uppercase text-xs shadow-sm shadow-green-100">
              <Palette className="w-4 h-4 mr-2" />
              Edición colores
            </Button>
          </Link>
        </div>
      </div>

      <NomenclaturesSection namingRules={namingRules} />
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
      <div className="my-10 border-t border-slate-200 w-full" />
      <RulesTable initialRules={rules} />
    </div>
  );
}
