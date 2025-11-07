'use client'
import type { ApexOptions } from 'apexcharts'
import dynamic from 'next/dynamic'
import { useMemo } from 'react'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false })

export default function DailySalesChart({
    year,
    month,
    days,
    customDates,
    title = 'Daily Sales',
}: {
    year?: number
    month?: number // 1..12
    days?: Array<{ date: string; total: number }>
    customDates?: Array<{ date: string; total: number; label?: string }>
    title?: string
}) {
    const { categories, seriesData } = useMemo(() => {
        // If customDates is provided, we are in a custom/weekly mode.
        // Avoid falling back to month-day categories when the array is temporarily empty,
        // which caused flicker between 31-day labels and weekday labels.
        if (customDates) {
            if (customDates.length > 0) {
                const cats = customDates.map(
                    (d) => d.label ?? String(d.date).slice(5)
                )
                const vals = customDates.map((d) => Number(d.total || 0))
                return { categories: cats, seriesData: vals }
            }
            // Weekly default placeholders (Mon..Sun) with zero values
            const weeklyCats = [
                'Mon',
                'Tues',
                'Wed',
                'Thu',
                'Fri',
                'Sat',
                'Sun',
            ]
            return { categories: weeklyCats, seriesData: new Array(7).fill(0) }
        }
        const y = year || new Date().getFullYear()
        const m = month || new Date().getMonth() + 1
        const daysInMonth = new Date(y, m, 0).getDate()
        const data = new Array(daysInMonth).fill(0)
        for (const d of days || []) {
            const day = Number(String(d.date).substring(8, 10))
            if (day >= 1 && day <= daysInMonth)
                data[day - 1] = Number(d.total || 0)
        }
        const cats = Array.from({ length: daysInMonth }, (_, i) =>
            String(i + 1)
        )
        return { categories: cats, seriesData: data }
    }, [year, month, days, customDates])

    const options: ApexOptions = {
        colors: ['#465fff'],
        chart: { type: 'bar', toolbar: { show: false }, height: 240 },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '60%',
                borderRadius: 1,
                borderRadiusApplication: 'end',
            },
        },
        dataLabels: { enabled: false },
        stroke: { show: true, width: 1, colors: ['transparent'] },
        xaxis: {
            categories,
            axisBorder: { show: false },
            axisTicks: { show: false },
            labels: {
                formatter: (value) => {
                    const numeric = Number(value)
                    if (!Number.isFinite(numeric)) return String(value)
                    return numeric % 2 === 0 ? String(value) : ''
                },
            },
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
                {title}
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
