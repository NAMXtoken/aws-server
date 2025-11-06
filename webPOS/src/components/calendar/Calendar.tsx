'use client'
import { Modal } from '@/components/ui/modal'
import { useModal } from '@/hooks/useModal'
import {
    DateSelectArg,
    DayCellContentArg,
    EventClickArg,
    EventContentArg,
    EventInput,
} from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import React, { useEffect, useRef, useState } from 'react'

interface CalendarEvent extends EventInput {
    extendedProps: {
        calendar: string
    }
}

type CalendarMode = 'scheduler' | 'date-picker'

type CalendarProps = {
    mode?: CalendarMode
    selectedDate?: Date | null
    onSelectDate?: (date: Date) => void
    // markersByDate allows rendering multiple colored dots per day
    markersByDate?: Record<string, { color: string; title?: string }[]>
}

const sameYMD = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

const Calendar: React.FC<CalendarProps> = ({
    mode = 'scheduler',
    selectedDate = null,
    onSelectDate,
    markersByDate,
}) => {
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
        null
    )
    const [eventTitle, setEventTitle] = useState('')
    const [eventStartDate, setEventStartDate] = useState('')
    const [eventEndDate, setEventEndDate] = useState('')
    const [eventLevel, setEventLevel] = useState('')
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const calendarRef = useRef<FullCalendar>(null)
    const { isOpen, openModal, closeModal } = useModal()
    const eventIdRef = useRef(0)

    const calendarsEvents = {
        Danger: 'danger',
        Success: 'success',
        Primary: 'primary',
        Warning: 'warning',
    }

    useEffect(() => {
        if (mode !== 'scheduler') return
        // Initialize with some demo events only in scheduler mode
        setEvents([
            {
                id: '1',
                title: 'Event Conf.',
                start: new Date().toISOString().split('T')[0],
                extendedProps: { calendar: 'Danger' },
            },
            {
                id: '2',
                title: 'Meeting',
                start: new Date(Date.now() + 86400000)
                    .toISOString()
                    .split('T')[0],
                extendedProps: { calendar: 'Success' },
            },
            {
                id: '3',
                title: 'Workshop',
                start: new Date(Date.now() + 172800000)
                    .toISOString()
                    .split('T')[0],
                end: new Date(Date.now() + 259200000)
                    .toISOString()
                    .split('T')[0],
                extendedProps: { calendar: 'Primary' },
            },
        ])
    }, [mode])

    // In date-picker mode, keep the view in sync with selectedDate
    useEffect(() => {
        if (mode !== 'date-picker' || !selectedDate) return
        try {
            const api = calendarRef.current?.getApi()
            api?.gotoDate(selectedDate)
        } catch {}
    }, [mode, selectedDate])

    const handleDateSelect = (selectInfo: DateSelectArg) => {
        resetModalFields()
        setEventStartDate(selectInfo.startStr)
        setEventEndDate(selectInfo.endStr || selectInfo.startStr)
        openModal()
    }

    const handleEventClick = (clickInfo: EventClickArg) => {
        const event = clickInfo.event
        setSelectedEvent(event as unknown as CalendarEvent)
        setEventTitle(event.title)
        setEventStartDate(event.start?.toISOString().split('T')[0] || '')
        setEventEndDate(event.end?.toISOString().split('T')[0] || '')
        setEventLevel(event.extendedProps.calendar)
        openModal()
    }

    const handleAddOrUpdateEvent = () => {
        if (selectedEvent) {
            // Update existing event
            setEvents((prevEvents) =>
                prevEvents.map((event) =>
                    event.id === selectedEvent.id
                        ? {
                              ...event,
                              title: eventTitle,
                              start: eventStartDate,
                              end: eventEndDate,
                              extendedProps: { calendar: eventLevel },
                          }
                        : event
                )
            )
        } else {
            // Add new event
            const nextId = (() => {
                eventIdRef.current += 1
                return `local-${eventIdRef.current}`
            })()
            const newEvent: CalendarEvent = {
                id: nextId,
                title: eventTitle,
                start: eventStartDate,
                end: eventEndDate,
                allDay: true,
                extendedProps: { calendar: eventLevel },
            }
            setEvents((prevEvents) => [...prevEvents, newEvent])
        }
        closeModal()
        resetModalFields()
    }

    const resetModalFields = () => {
        setEventTitle('')
        setEventStartDate('')
        setEventEndDate('')
        setEventLevel('')
        setSelectedEvent(null)
    }

    return (
        <div className="rounded-2xl border  border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="custom-calendar">
                <FullCalendar
                    ref={calendarRef}
                    plugins={
                        mode === 'scheduler'
                            ? [dayGridPlugin, timeGridPlugin, interactionPlugin]
                            : [dayGridPlugin, interactionPlugin]
                    }
                    initialView="dayGridMonth"
                    headerToolbar={
                        mode === 'scheduler'
                            ? {
                                  left: 'prev,next addEventButton',
                                  center: 'title',
                                  right: 'dayGridMonth,timeGridWeek,timeGridDay',
                              }
                            : {
                                  left: 'prev,next today',
                                  center: 'title',
                                  right: '',
                              }
                    }
                    events={mode === 'scheduler' ? events : []}
                    selectable={mode === 'scheduler'}
                    select={mode === 'scheduler' ? handleDateSelect : undefined}
                    eventClick={
                        mode === 'scheduler' ? handleEventClick : undefined
                    }
                    eventContent={
                        mode === 'scheduler' ? renderEventContent : undefined
                    }
                    dateClick={
                        mode === 'date-picker'
                            ? (arg) => onSelectDate && onSelectDate(arg.date)
                            : undefined
                    }
                    dayCellClassNames={
                        mode === 'date-picker' && selectedDate
                            ? (info) =>
                                  sameYMD(info.date, selectedDate as Date)
                                      ? 'ring-2 ring-brand-500 !ring-offset-0'
                                      : ''
                            : undefined
                    }
                    dayCellContent={
                        mode === 'date-picker'
                            ? (info: DayCellContentArg) => {
                                  const d = info.date
                                  const y = d.getFullYear()
                                  const m = String(d.getMonth() + 1).padStart(
                                      2,
                                      '0'
                                  )
                                  const dd = String(d.getDate()).padStart(
                                      2,
                                      '0'
                                  )
                                  const key = `${y}-${m}-${dd}`
                                  const markers = markersByDate?.[key] || []
                                  const wrap = document.createElement('div')
                                  wrap.className = 'flex flex-col h-full'
                                  // Day number row (preserve default text and a11y)
                                  const top = document.createElement('div')
                                  top.className =
                                      'flex items-start justify-end px-1 pt-1 text-xs'
                                  const number = document.createElement('span')
                                  number.className = 'fc-daygrid-day-number'
                                  number.textContent = info.dayNumberText
                                  top.appendChild(number)
                                  wrap.appendChild(top)
                                  // Marker row at bottom-left
                                  if (markers.length > 0) {
                                      const row = document.createElement('div')
                                      row.className =
                                          'mt-auto flex gap-1 px-1 pb-1'
                                      const maxDots = 6
                                      const shown = markers.slice(0, maxDots)
                                      shown.forEach((mk) => {
                                          const dot =
                                              document.createElement('span')
                                          dot.className =
                                              'inline-block h-2.5 w-2.5 rounded-full shadow-sm'
                                          dot.style.backgroundColor = mk.color
                                          if (mk.title) dot.title = mk.title
                                          row.appendChild(dot)
                                      })
                                      if (markers.length > maxDots) {
                                          const more =
                                              document.createElement('span')
                                          more.className =
                                              'ml-1 inline-flex items-center justify-center rounded bg-gray-200 px-1 text-[10px] leading-none text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                                          more.textContent = `+${markers.length - maxDots}`
                                          row.appendChild(more)
                                      }
                                      wrap.appendChild(row)
                                  }
                                  return { domNodes: [wrap] }
                              }
                            : undefined
                    }
                />
            </div>
            {mode === 'scheduler' ? (
                <Modal
                    isOpen={isOpen}
                    onClose={closeModal}
                    className="max-w-[700px] p-6 lg:p-10"
                >
                    <div className="flex flex-col px-2 overflow-y-auto custom-scrollbar">
                        <div>
                            <h5 className="mb-2 font-semibold text-gray-800 modal-title text-theme-xl dark:text-white/90 lg:text-2xl">
                                {selectedEvent ? 'Edit Event' : 'Add Event'}
                            </h5>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Plan your next big moment: schedule or edit an
                                event to stay on track
                            </p>
                        </div>
                        <div className="mt-8">
                            <div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                                        Event Title
                                    </label>
                                    <input
                                        id="event-title"
                                        type="text"
                                        value={eventTitle}
                                        onChange={(e) =>
                                            setEventTitle(e.target.value)
                                        }
                                        className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                                    />
                                </div>
                            </div>
                            <div className="mt-6">
                                <label className="block mb-4 text-sm font-medium text-gray-700 dark:text-gray-400">
                                    Event Color
                                </label>
                                <div className="flex flex-wrap items-center gap-4 sm:gap-5">
                                    {Object.entries(calendarsEvents).map(
                                        ([key, value]) => (
                                            <div key={key} className="n-chk">
                                                <div
                                                    className={`form-check form-check-${value} form-check-inline`}
                                                >
                                                    <label
                                                        className="flex items-center text-sm text-gray-700 form-check-label dark:text-gray-400"
                                                        htmlFor={`modal${key}`}
                                                    >
                                                        <span className="relative">
                                                            <input
                                                                className="sr-only form-check-input"
                                                                type="radio"
                                                                name="event-level"
                                                                value={key}
                                                                id={`modal${key}`}
                                                                checked={
                                                                    eventLevel ===
                                                                    key
                                                                }
                                                                onChange={() =>
                                                                    setEventLevel(
                                                                        key
                                                                    )
                                                                }
                                                            />
                                                            <span className="flex items-center justify-center w-5 h-5 mr-2 border border-gray-300 rounded-full box dark:border-gray-700">
                                                                <span
                                                                    className={`h-2 w-2 rounded-full bg-white ${
                                                                        eventLevel ===
                                                                        key
                                                                            ? 'block'
                                                                            : 'hidden'
                                                                    }`}
                                                                ></span>
                                                            </span>
                                                        </span>
                                                        {key}
                                                    </label>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>

                            <div className="mt-6">
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                                    Enter Start Date
                                </label>
                                <div className="relative">
                                    <input
                                        id="event-start-date"
                                        type="date"
                                        value={eventStartDate}
                                        onChange={(e) =>
                                            setEventStartDate(e.target.value)
                                        }
                                        className="dark:bg-dark-900 h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent bg-none px-4 py-2.5 pl-4 pr-11 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                                    />
                                </div>
                            </div>

                            <div className="mt-6">
                                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                                    Enter End Date
                                </label>
                                <div className="relative">
                                    <input
                                        id="event-end-date"
                                        type="date"
                                        value={eventEndDate}
                                        onChange={(e) =>
                                            setEventEndDate(e.target.value)
                                        }
                                        className="dark:bg-dark-900 h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent bg-none px-4 py-2.5 pl-4 pr-11 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mt-6 modal-footer sm:justify-end">
                            <button
                                onClick={closeModal}
                                type="button"
                                className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleAddOrUpdateEvent}
                                type="button"
                                className="btn btn-success btn-update-event flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto"
                            >
                                {selectedEvent ? 'Update Changes' : 'Add Event'}
                            </button>
                        </div>
                    </div>
                </Modal>
            ) : null}
        </div>
    )
}

const renderEventContent = (eventInfo: EventContentArg) => {
    const colorClass = `fc-bg-${eventInfo.event.extendedProps.calendar.toLowerCase()}`
    return (
        <div
            className={`event-fc-color flex fc-event-main ${colorClass} p-1 rounded-sm`}
        >
            <div className="fc-daygrid-event-dot"></div>
            <div className="fc-event-time">{eventInfo.timeText}</div>
            <div className="fc-event-title">{eventInfo.event.title}</div>
        </div>
    )
}

export default Calendar
