'use client'

import { UploadAssetDialog } from '@/components/assets/UploadAssetDialog'

interface AssetRow {
    id: string;
    name: string;
    type: string;
    file_path: string;
    relation_count: number;
}

interface Props {
    onUploadComplete?: (asset: AssetRow) => void;
    variant?: string;
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
