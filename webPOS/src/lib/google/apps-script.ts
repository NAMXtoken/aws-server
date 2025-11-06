import 'server-only'
import { google } from 'googleapis'
import {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_IMPERSONATE_SUBJECT,
    GOOGLE_OAUTH_REFRESH_TOKEN,
    GOOGLE_REDIRECT_URI,
    GOOGLE_SCRIPT_ID,
    GOOGLE_SERVICE_ACCOUNT_JSON,
    isOAuthConfigured,
    isServiceAccountConfigured,
} from '@/lib/env-server'

// Core scopes for Apps Script Admin + Execution APIs
export const APPS_SCRIPT_SCOPES = [
    'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.projects.readonly',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.processes',
]

function asServiceAccount(scopes: string[]) {
    const svc = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON)
    const client = new google.auth.JWT({
        email: svc.client_email,
        key: svc.private_key,
        scopes,
        subject: GOOGLE_IMPERSONATE_SUBJECT || undefined,
    })
    return client
}

function asOAuth2(scopes: string[]) {
    const oAuth2Client = new google.auth.OAuth2({
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        redirectUri: GOOGLE_REDIRECT_URI,
    })
    oAuth2Client.setCredentials({
        refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN,
        scope: scopes.join(' '),
    })
    return oAuth2Client
}

type AuthClient =
    | ReturnType<typeof asServiceAccount>
    | ReturnType<typeof asOAuth2>

export function getAuth(scopes: string[] = APPS_SCRIPT_SCOPES): AuthClient {
    if (isServiceAccountConfigured()) return asServiceAccount(scopes)
    if (isOAuthConfigured()) return asOAuth2(scopes)
    throw new Error(
        'Google auth not configured. Set service account JSON or OAuth2 envs.'
    )
}

export function getScriptApi(auth: AuthClient = getAuth()) {
    return google.script({ version: 'v1', auth: auth as any })
}

// Convenience wrappers
export async function runScript({
    scriptId = GOOGLE_SCRIPT_ID,
    functionName,
    parameters = [],
    devMode = false,
}: {
    scriptId?: string
    functionName: string
    parameters?: any[]
    devMode?: boolean
}) {
    if (!scriptId) throw new Error('GOOGLE_SCRIPT_ID is required')
    const script = getScriptApi()
    const res = await script.scripts.run({
        scriptId,
        requestBody: { function: functionName, parameters, devMode },
    })
    return res.data
}

export async function createVersion({
    scriptId = GOOGLE_SCRIPT_ID,
    description = 'Automated version',
}: {
    scriptId?: string
    description?: string
}) {
    const script = getScriptApi()
    const res = await script.projects.versions.create({
        scriptId,
        requestBody: { description },
    })
    return res.data
}

export async function listDeployments({
    scriptId = GOOGLE_SCRIPT_ID,
}: {
    scriptId?: string
}) {
    const script = getScriptApi()
    const res = await script.projects.deployments.list({ scriptId })
    return res.data
}

export async function createDeployment({
    scriptId = GOOGLE_SCRIPT_ID,
    versionNumber,
    description = 'Automated deployment',
}: {
    scriptId?: string
    versionNumber: number
    description?: string
}) {
    const script = getScriptApi()
    // The schema types in googleapis can vary; cast request to any to avoid overly strict checks.
    const res = (await script.projects.deployments.create({
        scriptId,
        requestBody: { versionNumber, description } as unknown as any,
    } as any)) as any
    return res.data
}

export async function updateDeployment({
    scriptId = GOOGLE_SCRIPT_ID,
    deploymentId,
    versionNumber,
    description,
}: {
    scriptId?: string
    deploymentId: string
    versionNumber: number
    description?: string
}) {
    const script = getScriptApi()
    const res = (await script.projects.deployments.update({
        scriptId,
        deploymentId,
        requestBody: { versionNumber, description } as unknown as any,
    } as any)) as any
    return res.data
}

export async function deleteDeployment({
    scriptId = GOOGLE_SCRIPT_ID,
    deploymentId,
}: {
    scriptId?: string
    deploymentId: string
}) {
    const script = getScriptApi()
    const res = await script.projects.deployments.delete({
        scriptId,
        deploymentId,
    })
    return res.data
}

// Project content helpers
export async function getProjectContent({
    scriptId = GOOGLE_SCRIPT_ID,
}: {
    scriptId?: string
}) {
    if (!scriptId) throw new Error('GOOGLE_SCRIPT_ID is required')
    const script = getScriptApi()
    const res = await script.projects.getContent({ scriptId } as any)
    return res.data
}

export type AppsScriptFile = {
    name: string
    type: 'SERVER_JS' | 'HTML' | 'JSON'
    source: string
}

export async function updateProjectContent({
    scriptId = GOOGLE_SCRIPT_ID,
    files,
}: {
    scriptId?: string
    files: AppsScriptFile[]
}) {
    if (!scriptId) throw new Error('GOOGLE_SCRIPT_ID is required')
    const script = getScriptApi()
    const res = (await script.projects.updateContent({
        scriptId,
        requestBody: { files } as unknown as any,
    } as any)) as any
    return res.data
}

export async function listProcesses(params: {
    pageSize?: number
    pageToken?: string
    userProcessFilter?: {
        scriptId?: string
        projectName?: string
        functionName?: string
        startTime?: string
        endTime?: string
        types?: string[]
        deploymentId?: string
        statuses?: string[]
    }
}) {
    const script = getScriptApi()
    const res = await script.processes.list(params as any)
    return res.data
}
