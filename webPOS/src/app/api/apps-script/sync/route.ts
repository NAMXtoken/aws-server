import { NextResponse } from 'next/server'
import {
    updateProjectContent,
    type AppsScriptFile,
} from '@/lib/google/apps-script'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function POST(req: Request) {
    try {
        const url = new URL(req.url)
        const scriptId = url.searchParams.get('scriptId') || undefined
        const cwd = process.cwd()
        const codePath = path.join(cwd, 'code.gs')
        const hasCode = await fs
            .access(codePath)
            .then(() => true)
            .catch(() => false)
        if (!hasCode)
            return NextResponse.json(
                { ok: false, error: `Local code.gs not found at ${codePath}` },
                { status: 400 }
            )

        const source = await fs.readFile(codePath, 'utf8')
        const files: AppsScriptFile[] = [
            { name: 'Code', type: 'SERVER_JS', source },
        ]

        // Optional: include manifest if appsscript.json exists at project root
        const manifestPath = path.join(cwd, 'appsscript.json')
        const hasManifest = await fs
            .access(manifestPath)
            .then(() => true)
            .catch(() => false)
        if (hasManifest) {
            const manifest = await fs.readFile(manifestPath, 'utf8')
            files.push({ name: 'appsscript', type: 'JSON', source: manifest })
        }

        const data = await updateProjectContent({ scriptId, files })
        return NextResponse.json({ ok: true, data })
    } catch (e: unknown) {
        const err = e as Error
        return NextResponse.json(
            { ok: false, error: err?.message || String(e) },
            { status: 500 }
        )
    }
}
