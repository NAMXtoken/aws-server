import TenantPersonaWizard from '@/components/onboarding/TenantPersonaWizard'

export default function DevOnboardPage() {
    return (
        <main className="mx-auto max-w-4xl px-4 py-10">
            <TenantPersonaWizard restrictToDev />
        </main>
    )
}
