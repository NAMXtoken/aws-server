'use client'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false })

export default function LowStockBar({
    labels,
    values,
    title = 'Low Stock',
    valueFormatter,
}: {
    labels: string[]
    values: number[]
    title?: string
    valueFormatter?: (value: number) => string
}) {
    const series = [{ name: 'Qty', data: values }]
    const options: ApexOptions = {
        chart: { type: 'bar', toolbar: { show: false } },
        plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
        dataLabels: { enabled: false },
        xaxis: { categories: labels },
        colors: ['#ef4444'],
        tooltip: {
            y: {
                formatter: (v) =>
                    valueFormatter ? valueFormatter(Number(v)) : String(v),
            },
        },
    }
    return (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                {title}
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
