export interface TenantMetadata {
    bootstrapComplete?: boolean
    [key: string]: unknown
}

export interface TenantConfig {
    tenantId: string
    accountEmail: string
    settingsSpreadsheetId: string
    menuSpreadsheetId?: string | null
    driveFolderId?: string | null
    metadata?: TenantMetadata | null
    createdAt: number
    updatedAt: number
}

export interface TenantConfigUpdate {
    tenantId: string
    accountEmail: string
    settingsSpreadsheetId: string
    menuSpreadsheetId?: string | null
    driveFolderId?: string | null
    metadata?: TenantMetadata | null
    createdAt: number
    updatedAt: number
}
