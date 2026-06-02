'use client'

import { UploadAssetDialog } from '@/components/assets/UploadAssetDialog'

interface Asset {
    id: string;
}

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'

interface Props {
    onUploadComplete?: (asset: Asset) => void;
    variant?: ButtonVariant;
    className?: string;
    label?: string;
    type?: string;
}

export function UploadAssetButton({ onUploadComplete, variant, className, label }: Props) {
    return (
        <UploadAssetDialog
            onUploadComplete={onUploadComplete}
            variant={variant}
            className={className}
            label={label}
        />
    )
}
