'use client'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false })

type PaymentDonutProps = {
    cash: number
    card: number
    prompt: number
    percentages?: {
        cash: number
        card: number
        promptPay: number
    }
}

const formatAmount = (value: number) =>
    Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

const formatPercent = (value: number) =>
    `${Number(value || 0)
        .toFixed(1)
        .replace(/\.0$/, '')}%`

export default function PaymentDonut({
    cash,
    card,
    prompt,
    percentages,
}: PaymentDonutProps) {
    const labels = ['Cash', 'Card', 'PromptPay']
    const series = [cash || 0, card || 0, prompt || 0]
    const total = series.reduce((a, b) => a + b, 0)
    const percentFallback =
        total > 0
            ? {
                  cash: (cash / total) * 100,
                  card: (card / total) * 100,
                  promptPay: (prompt / total) * 100,
              }
            : { cash: 0, card: 0, promptPay: 0 }
    const percentBreakdown = percentages || percentFallback
    const options: ApexOptions = {
        labels,
        legend: { position: 'bottom' },
        chart: { type: 'donut' },
        dataLabels: { enabled: false },
        colors: ['#16a34a', '#2563eb', '#f59e0b'],
        stroke: { width: 1 },
        tooltip: {
            y: { formatter: (v) => (Number(v) || 0).toFixed(2) },
        },
    }
    return (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                Payment Breakdown
            </div>
            {total > 0 ? (
                <ReactApexChart
                    options={options}
                    series={series}
                    type="donut"
                    height={260}
                />
            ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    No payments recorded yet
                </div>
            )}
            {total > 0 && (
                <div className="mt-4 space-y-2 text-sm">
                    <PaymentRow
                        label="Cash"
                        amount={cash}
                        percent={percentBreakdown.cash}
                    />
                    <PaymentRow
                        label="Card"
                        amount={card}
                        percent={percentBreakdown.card}
                    />
                    <PaymentRow
                        label="PromptPay"
                        amount={prompt}
                        percent={percentBreakdown.promptPay}
                    />
                </div>
            )}
        </div>
    )
}

function PaymentRow({
    label,
    amount,
    percent,
}: {
    label: string
    amount: number
    percent: number
}) {
    return (
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
            <span>{label}</span>
            <span className="font-medium text-gray-900 dark:text-white">
                {formatAmount(amount)}{' '}
                <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    {formatPercent(percent)}
                </span>
            </span>
        </div>
    )
}
