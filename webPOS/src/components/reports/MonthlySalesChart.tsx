'use client'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'
import { useMemo } from 'react'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false })

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
]

export default function MonthlySalesChart({
    totals,
}: {
    totals: Array<{ month: number; total: number }>
}) {
    const seriesData = useMemo(() => {
        const byMonth = new Array(12).fill(0)
        for (const m of totals || []) {
            const idx = Math.min(12, Math.max(1, m.month)) - 1
            byMonth[idx] = Number(m.total || 0)
        }
        return byMonth
    }, [totals])

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
            categories: MONTHS,
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: { labels: { formatter: (v) => String(Math.round(Number(v))) } },
        tooltip: { y: { formatter: (v) => (Number(v) || 0).toFixed(2) } },
        grid: { yaxis: { lines: { show: true } } },
        fill: { opacity: 1 },
    }

    const series = [{ name: 'Sales', data: seriesData }]

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
