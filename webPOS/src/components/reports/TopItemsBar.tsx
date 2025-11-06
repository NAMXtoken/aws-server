'use client'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false })

export type TopItem = { name: string; qty: number }

export default function TopItemsBar({ items }: { items: TopItem[] }) {
    const top = (items || [])
        .slice()
        .sort((a, b) => (b.qty || 0) - (a.qty || 0))
        .slice(0, 10)
    const categories = top.map((i) => i.name || 'Item')
    const series = [{ name: 'Qty', data: top.map((i) => i.qty || 0) }]
    const options: ApexOptions = {
        chart: { type: 'bar', toolbar: { show: false } },
        plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
        dataLabels: { enabled: false },
        xaxis: { categories },
        colors: ['#465fff'],
        tooltip: { y: { formatter: (v) => String(v) } },
        grid: {
            xaxis: { lines: { show: true } },
            yaxis: { lines: { show: false } },
        },
    }
    return (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                Top Items (by qty)
            </div>
            <ReactApexChart
                options={options}
                series={series}
                type="bar"
                height={360}
            />
        </div>
    )
}
