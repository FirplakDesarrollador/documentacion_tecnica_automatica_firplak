'use client'

import { UploadAssetDialog } from '@/components/assets/UploadAssetDialog'

interface Props {
    onUploadComplete?: (asset: any) => void;
    variant?: string;
    className?: string;
    label?: string;
    type?: string;
}

export function UploadAssetButton({ onUploadComplete, variant, className, label, type: _type }: Props) {
    return (
        <UploadAssetDialog
            onUploadComplete={onUploadComplete}
            variant={variant}
            className={className}
            label={label}
        />
    )
}
