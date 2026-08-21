export const RESOURCE_TYPES = [
  'isometric',
  'instruction_pdf',
  'front_view_dimensioned',
  'side_view_dimensioned',
  'top_view_dimensioned',
  'exploded_view',
  'assembly_step',
] as const

export type ResourceType = (typeof RESOURCE_TYPES)[number]
export type NonIsometricResourceType = Exclude<ResourceType, 'isometric'>

type ResourceTypeDefinition = {
  label: string
  expectedFilenameSuffix: string
  groupByIsometricAsset: boolean
}

export const RESOURCE_TYPE_DEFINITIONS: Record<ResourceType, ResourceTypeDefinition> = {
  isometric: {
    label: 'Isométrico',
    expectedFilenameSuffix: '',
    groupByIsometricAsset: false,
  },
  instruction_pdf: {
    label: 'Instructivo PDF',
    expectedFilenameSuffix: 'INSTRUCTIVO',
    groupByIsometricAsset: false,
  },
  front_view_dimensioned: {
    label: 'Vista frontal acotada',
    expectedFilenameSuffix: 'VISTA FRONTAL ACOTADA',
    groupByIsometricAsset: true,
  },
  side_view_dimensioned: {
    label: 'Vista lateral acotada',
    expectedFilenameSuffix: 'VISTA LATERAL ACOTADA',
    groupByIsometricAsset: true,
  },
  top_view_dimensioned: {
    label: 'Vista superior acotada',
    expectedFilenameSuffix: 'VISTA SUPERIOR ACOTADA',
    groupByIsometricAsset: true,
  },
  exploded_view: {
    label: 'Despiece',
    expectedFilenameSuffix: 'DESPIECE',
    groupByIsometricAsset: false,
  },
  assembly_step: {
    label: 'Paso de armado',
    expectedFilenameSuffix: 'PASO DE ARMADO',
    groupByIsometricAsset: false,
  },
}

export function isResourceType(value: unknown): value is ResourceType {
  return RESOURCE_TYPES.includes(String(value || '').trim().toLowerCase() as ResourceType)
}

export function getResourceType(value: unknown): ResourceType | null {
  const normalized = String(value || '').trim().toLowerCase()
  return isResourceType(normalized) ? normalized : null
}
