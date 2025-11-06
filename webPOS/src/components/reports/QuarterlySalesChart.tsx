'use client'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false })

export default function QuarterlySalesChart({
    labels,
    data,
}: {
    labels: string[] // e.g., ['October','November','December']
    data: number[] // length should match labels
}) {
    const options: ApexOptions = {
        colors: ['#465fff'],
        chart: { type: 'bar', toolbar: { show: false }, height: 240 },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '39%',
                borderRadius: 5,
                borderRadiusApplication: 'end',
            },
        },
        dataLabels: { enabled: false },
        stroke: { show: true, width: 4, colors: ['transparent'] },
        xaxis: {
            categories: labels,
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: { labels: { formatter: (v) => String(Math.round(Number(v))) } },
        tooltip: { y: { formatter: (v) => (Number(v) || 0).toFixed(2) } },
        grid: { yaxis: { lines: { show: true } } },
        fill: { opacity: 1 },
    }
    const series = [{ name: 'Sales', data }]
    return (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                Monthly Sales
            </div>
            <ReactApexChart
                options={options}
                series={series}
                type="bar"
                height={240}
            />
        </div>
    )
}
