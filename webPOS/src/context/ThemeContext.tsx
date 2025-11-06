'use client'

import type React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

type ThemeContextType = {
    theme: Theme
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'light'
        const savedTheme = localStorage.getItem('theme') as Theme | null
        return savedTheme ?? 'light'
    })

    useEffect(() => {
        if (typeof window === 'undefined') return
        localStorage.setItem('theme', theme)
        const root = document.documentElement
        if (theme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }

        const themeColor = theme === 'dark' ? '#101828' : '#ffffff'
        const themeMeta = document.querySelector<HTMLMetaElement>(
            'meta[name="theme-color"]'
        )
        if (themeMeta) themeMeta.content = themeColor

        const appleStatusMeta = document.querySelector<HTMLMetaElement>(
            'meta[name="apple-mobile-web-app-status-bar-style"]'
        )
        if (appleStatusMeta) {
            appleStatusMeta.content = theme === 'dark' ? 'black' : 'default'
        }
    }, [theme])

    const toggleTheme = () => {
        setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'))
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
