export async function jsonFetcher<T = any>(url: string): Promise<T> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}
