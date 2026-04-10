/**
 * Layout minimalista para la ruta de exportación.
 * Evita heredar la barra lateral y los estilos globales del dashboard
 * mediante posicionamiento absoluto que cubre toda la pantalla.
 */
export default function ExportLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', margin: 0, padding: 0, background: '#fff', zIndex: 999999, overflow: 'hidden' }}>
            {/* 
                Inyectamos CSS para ocultar el portal de Next.js y otros indicadores de desarrollo 
                que podrían aparecer durante el renderizado y arruinar la captura (ej. la letra 'N').
            */}
            <style dangerouslySetInnerHTML={{ __html: `
                nextjs-portal,
                #nextjs-portal,
                .__next-prerender-indicator,
                [data-nextjs-toast],
                [data-nextjs-dialog-overlay],
                [data-nextjs-dev-indicator] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
            `}} />
            {children}
        </div>
    )
}
