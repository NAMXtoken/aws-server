'use client'

import type { ComponentType, SVGProps } from 'react'

import {
    BoxCubeIcon,
    GridIcon,
    HorizontaLDots,
    PieChartIcon,
    TableIcon,
    UserCircleIcon,
} from '@/icons'

export type NavSubItem = {
    name: string
    path: string
    pro?: boolean
    new?: boolean
    adminOnly?: boolean
}

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>

export type NavItem = {
    name: string
    icon: NavIcon
    path?: string
    subItems?: NavSubItem[]
}

export const MAIN_NAV_ITEMS: NavItem[] = [
    {
        icon: GridIcon,
        name: 'Dashboard',
        path: '/sales',
        subItems: [
            { name: 'Sales', path: '/sales', pro: false },
            { name: 'Tickets', path: '/tickets', pro: false },
            { name: 'Shift', path: '/shift', pro: false },
            {
                name: 'Settings',
                path: '/settings',
                pro: false,
                adminOnly: true,
            },
        ],
    },
    {
        icon: UserCircleIcon,
        name: 'Staff Management',
        path: '/staff/users',
        subItems: [
            {
                name: 'Users',
                path: '/staff/users',
                pro: false,
                adminOnly: true,
            },
            { name: 'Shifts', path: '/staff/shifts', pro: false },
            {
                name: 'Roles & Permissions',
                path: '/staff/roles-permissions',
                pro: false,
            },
        ],
    },
    {
        icon: TableIcon,
        name: 'Cash Management',
        path: '/cash/float',
        subItems: [
            { name: 'Float', path: '/cash/float', pro: false },
            { name: 'Petty Cash', path: '/cash/petty-cash', pro: false },
        ],
    },
    {
        icon: PieChartIcon,
        name: 'Reports',
        path: '/reports/sales',
        subItems: [
            { name: 'Sales', path: '/reports/sales', pro: false },
            { name: 'Inventory', path: '/reports/inventory', pro: false },
            { name: 'Shifts', path: '/reports/shifts', pro: false },
        ],
    },
    {
        icon: BoxCubeIcon,
        name: 'Inventory Management',
        path: '/inventory/set-stock',
        subItems: [
            { name: 'Set Stock', path: '/inventory/set-stock', pro: false },
            { name: 'Add Stock', path: '/inventory/add-stock', pro: false },
            { name: 'Stock Take', path: '/inventory/stock-take', pro: false },
            {
                name: 'Menu Settings',
                path: '/inventory/menu-settings',
                pro: false,
            },
        ],
    },
]

export const OTHER_NAV_ITEMS: NavItem[] = []

export const MENU_SECTION_ICON = HorizontaLDots
