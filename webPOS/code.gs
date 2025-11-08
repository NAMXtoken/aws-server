// Google Apps Script backend for Bynd POS
// Creates/ensures Drive folders, Spreadsheets, and daily Sheets on shift open.

const ROOT_FOLDER_NAME = 'byndPOS'
const MONTH_TEMPLATE_SPREADSHEET_ID =
    '1K6TR3wN4l6fvoKtEHGnotCCYE2Iq0UzKWKw-RZDGicI'
const SETTINGS_SPREADSHEET_NAME = 'Settings'
const SETTINGS_SHEETS = [
    'Users',
    'Menu',
    'Stock',
    'Financial',
    'Shifts',
    'Roles&Permission',
    'Ingredients',
]
const HEADER_ROW_INDEX = 10
const DATA_START_ROW_INDEX = HEADER_ROW_INDEX + 1
const INVENTORY_SHEET_NAME = 'Inventory'
const INVENTORY_BASE_COLUMN = 13 // Column M (name)
const INVENTORY_HEADERS = [
    'name', // column M
    'package', // column N
    'packageVolume', // column O
    'packageUnits', // column P
    'addedStock', // column Q
    'totalVolume', // column R
]
const RESTOCK_HEADERS = [
    'id',
    'itemId',
    'itemName',
    'timestamp',
    'unit',
    'package',
    'unitsPerPackage',
    'packages',
    'extraUnits',
    'totalUnits',
    'actor',
    'notes',
]
const TENANT_HEADERS = [
    'tenantId',
    'accountEmail',
    'settingsSpreadsheetId',
    'menuSpreadsheetId',
    'driveFolderId',
    'metadataJson',
    'createdAt',
    'updatedAt',
]
const USERS_SHEET_HEADERS = [
    'pin',
    'role',
    'name',
    'email',
    'phone',
    'notes',
    'createdAt',
    'updatedAt',
]
const MENU_SHEET_HEADERS = [
    'id',
    'name',
    'description',
    'price',
    'image',
    'category',
    'purchasePrice',
    'warehouseName',
    'shelf-life',
    'purchaseUnit',
    'consumeUnit',
    'volume',
    'lowStockWarning',
    'ingredients',
    'options',
    'updatedAt',
    'unitsUpdatedAt',
]
const CATEGORIES_SHEET_HEADERS = ['id', 'label', 'icon', 'value']
const POS_SETTINGS_HEADERS = [
    'storeName',
    'storeTagline',
    'timeZone',
    'locale',
    'currencyCode',
    'currencySymbol',
    'contactEmail',
    'contactPhone',
    'defaultTaxRate',
    'receiptFooter',
    'updatedAt',
]
const INGREDIENTS_SHEET_HEADERS = [
    'name',
    'package',
    'packageVolume',
    'packageUnits',
    'addedStock',
    'packagesStock',
    'totalVolume',
]
const PAGER_HEADERS = [
    'id',
    'tenantId',
    'targetPin',
    'targetRole',
    'message',
    'createdAt',
    'sender',
    'origin',
    'ackAt',
    'ackBy',
    'metadataJson',
]
const PUSH_SUBSCRIPTION_HEADERS = [
    'id',
    'tenantId',
    'userId',
    'channel',
    'endpoint',
    'token',
    'p256dh',
    'auth',
    'createdAt',
    'lastSeen',
    'userAgent',
    'actor',
    'platform',
]
const OPEN_TICKETS_STATE_FOLDER = 'state'
const OPEN_TICKETS_FILE_NAME = 'openTickets.json'

function normalizeSubscriptionRow_(row) {
    const normalized = {
        id: String(row[0] || '').trim(),
        tenantId: String(row[1] || '').trim(),
        userId: String(row[2] || '').trim(),
        channel: 'webpush',
        endpoint: '',
        token: '',
        p256dh: '',
        auth: '',
        createdAt: 0,
        lastSeen: 0,
        userAgent: '',
        actor: '',
        platform: '',
    }
    const channelRaw = String(row[3] || '').trim()
    const channelLower = channelRaw.toLowerCase()
    if (channelLower === 'webpush' || channelLower === 'fcm') {
        normalized.channel = channelLower || 'webpush'
        normalized.endpoint = String(row[4] || '').trim()
        normalized.token = String(row[5] || '').trim()
        normalized.p256dh = String(row[6] || '').trim()
        normalized.auth = String(row[7] || '').trim()
        normalized.createdAt = Number(row[8] || 0) || 0
        normalized.lastSeen = Number(row[9] || 0) || 0
        normalized.userAgent = row[10] || ''
        normalized.actor = row[11] || ''
        normalized.platform = row[12] || ''
    } else {
        // Legacy layout (pre-channel column)
        normalized.channel = 'webpush'
        normalized.endpoint = String(row[3] || '').trim()
        normalized.token = ''
        normalized.p256dh = String(row[4] || '').trim()
        normalized.auth = String(row[5] || '').trim()
        normalized.createdAt = Number(row[6] || 0) || 0
        normalized.lastSeen = Number(row[7] || 0) || 0
        normalized.userAgent = row[8] || ''
        normalized.actor = row[9] || ''
        normalized.platform = ''
    }
    return normalized
}

function subscriptionRowToArray_(data, width) {
    const targetWidth = Math.max(width || 0, PUSH_SUBSCRIPTION_HEADERS.length)
    const row = new Array(targetWidth).fill('')
    row[0] = data.id || Utilities.getUuid()
    row[1] = data.tenantId || ''
    row[2] = data.userId || ''
    row[3] = data.channel || 'webpush'
    row[4] = data.endpoint || ''
    row[5] = data.token || ''
    row[6] = data.p256dh || ''
    row[7] = data.auth || ''
    row[8] = data.createdAt || 0
    row[9] = data.lastSeen || 0
    row[10] = data.userAgent || ''
    row[11] = data.actor || ''
    row[12] = data.platform || ''
    return row
}
// Unified daily event log headers (A1:...)
const EVENT_HEADERS = [
    'id',
    'ts',
    'timeBlock',
    'action',
    'actor',
    'shiftId',
    'ticketId',
    'ticketName',
    'itemId',
    'itemName',
    'category',
    'qty',
    'unitPrice',
    'amount',
    'method',
    'inventoryDelta',
    'status',
    'note',
    'metaJson',
    'Day',
    'DayOfWeek',
    'ShiftId',
    'ManagerOnDuty',
    'StaffCount',
    'GrossSales',
    'NetSales',
    'TaxCollected',
    'Tips',
    'Surcharges',
    'RefundAmount',
    'VoidedAmount',
    'TicketsCount',
    'CompletedTickets',
    'AverageTicketValue',
    'AverageItemsPerTicket',
    'PeakHour',
    'CashSales',
    'CardSales',
    'PromptPaySales',
    'OtherSales',
    'CashDeposited',
    'CardPayoutExpected',
    'COGS',
    'ItemsSold',
    'InventoryAdjustments',
    'WasteCount',
    'RestockCost',
    'EndingInventoryValue',
    'TopCategory',
    'TopItem',
    'TopItemQty',
    'LowStockAlerts',
    'OOSItems',
    'ShiftOpenBy',
    'ShiftCloseBy',
    'HoursOpen',
    'CashDrawerStart',
    'CashDrawerEnd',
    'CashVariance',
]
const SHIFT_HEADERS = [
    'shiftId',
    'openedAt',
    'openedBy',
    'closedAt',
    'closedBy',
    'status',
    'cashSales',
    'cardSales',
    'promptPaySales',
    'ticketsCount',
    'itemsSoldJson',
    'notes',
]
const REPORTS_SHEET_NAME = 'reports'
const REPORTS_HEADERS = [
    'Day',
    'DayOfWeek',
    'ShiftId',
    'ManagerOnDuty',
    'StaffCount',
    'GrossSales',
    'NetSales',
    'TaxCollected',
    'Tips',
    'Surcharges',
    'RefundAmount',
    'VoidedAmount',
    'TicketsCount',
    'CompletedTickets',
    'AverageTicketValue',
    'AverageItemsPerTicket',
    'PeakHour',
    'CashSales',
    'CardSales',
    'PromptPaySales',
    'OtherSales',
    'CashDeposited',
    'CardPayoutExpected',
    'COGS',
    'ItemsSold',
    'InventoryAdjustments',
    'WasteCount',
    'RestockCost',
    'EndingInventoryValue',
    'TopCategory',
    'TopItem',
    'TopItemQty',
    'LowStockAlerts',
    'OOSItems',
    'ShiftOpenBy',
    'ShiftCloseBy',
    'HoursOpen',
    'CashDrawerStart',
    'CashDrawerEnd',
    'CashVariance',
]
const DAY_TEMPLATE_SHEET_NAME = 'dayTemplate'
const LEGACY_DAY_TEMPLATE_SHEET_NAME = 'dailyTemplate'
const INVENTORY_UNITS_HEADERS = [
    'id',
    'unit',
    'package',
    'unitsPerPackage',
    'updatedAt',
]
const TICKET_ITEMS_HEADERS = [
    'ticketId',
    'itemName',
    'qty',
    'price',
    'lineTotal',
]
const TICKETS_SHEET_HEADERS = [
    'ticketId',
    'ticketName',
    'openedBy',
    'openedAt',
    'status',
    'price',
    'date',
    'pay',
    'closedAt',
]
const AUDIT_LOG_HEADERS = [
    'Timestamp',
    'Action',
    'Actor',
    'Entity',
    'EntityId',
    'DetailsJSON',
]
const INVENTORY_SHEET_HEADERS_SETTINGS = [
    'item',
    'price',
    'openingStock',
    'deliveries',
    'sales',
    'netChange',
    'closingStock',
    'stockTake',
    'difference',
    'id',
]
const SETTINGS_SHEET_DEFINITIONS = [
    { name: 'Users', headers: USERS_SHEET_HEADERS },
    { name: 'Menu', headers: MENU_SHEET_HEADERS },
    { name: 'Categories', headers: CATEGORIES_SHEET_HEADERS },
    { name: 'Ingredients', headers: INGREDIENTS_SHEET_HEADERS },
    { name: 'Units', headers: INVENTORY_UNITS_HEADERS },
    { name: 'Restocks', headers: RESTOCK_HEADERS },
    { name: 'Shifts', headers: SHIFT_HEADERS },
    { name: 'Tickets', headers: TICKETS_SHEET_HEADERS },
    { name: 'Items', headers: TICKET_ITEMS_HEADERS },
    { name: 'AuditLog', headers: AUDIT_LOG_HEADERS },
    { name: 'Inventory', headers: INVENTORY_SHEET_HEADERS_SETTINGS },
    { name: 'POS Settings', headers: POS_SETTINGS_HEADERS },
]
var SETTINGS_HEADERS_BY_SHEET = (function () {
    var map = {}
    for (var i = 0; i < SETTINGS_SHEET_DEFINITIONS.length; i++) {
        var def = SETTINGS_SHEET_DEFINITIONS[i]
        map[def.name] = def.headers
    }
    return map
})()

function ensureSettingsSheets_(spreadsheet) {
    if (!spreadsheet) return
    for (var i = 0; i < SETTINGS_SHEET_DEFINITIONS.length; i++) {
        var def = SETTINGS_SHEET_DEFINITIONS[i]
        var sheet = spreadsheet.getSheetByName(def.name)
        if (!sheet) sheet = getOrCreateSheet_(spreadsheet, def.name)
        if (def.name === 'POS Settings') ensurePosSettingsHeaders_(sheet)
        else ensureHeadersRow_(sheet, def.headers)
    }
}

function normalizeEmail_(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
}

function slugifyEmail_(email) {
    const normalized = normalizeEmail_(email)
    if (!normalized) return ''
    return normalized
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
}

function deriveTenantIdFromEmail_(email) {
    const slug = slugifyEmail_(email)
    return slug ? 'tenant-' + slug : ''
}

function deriveUserIdFromEmail_(email) {
    const slug = slugifyEmail_(email)
    return slug ? 'user-' + slug : ''
}

function canonicalTenantId_(tenantId, accountEmail) {
    const byEmail = deriveTenantIdFromEmail_(accountEmail)
    if (byEmail) return byEmail
    const trimmed = String(tenantId || '').trim()
    return trimmed || Utilities.getUuid()
}

var ACTIVE_TENANT_CONTEXT = null

/**
 * Web App entry for POST requests.
 * Expects JSON body: { action: 'openShift' }
 */
function doPost(e) {
    try {
        const payload =
            e && e.postData && e.postData.contents
                ? JSON.parse(e.postData.contents)
                : {}
        const tenantId =
            payload && payload.tenantId != null
                ? String(payload.tenantId || '').trim()
                : e && e.parameter && e.parameter.tenantId
                  ? String(e.parameter.tenantId || '').trim()
                  : ''
        const accountEmail =
            payload && payload.accountEmail != null
                ? String(payload.accountEmail || '').trim()
                : e && e.parameter && e.parameter.accountEmail
                  ? String(e.parameter.accountEmail || '').trim()
                  : ''

        return withTenantContext_(tenantId, accountEmail, function () {
            const action =
                (payload && payload.action) ||
                (e && e.parameter && e.parameter.action)

            if (action === 'openShift') {
                const result = openShift(payload && payload.actor)
                return jsonResponse_(Object.assign({ ok: true }, result))
            }

            if (action === 'recordTicket') {
                const result = recordTicket_(payload)
                return jsonResponse_(result)
            }
            if (action === 'recordShift') {
                const result = recordShift_(payload)
                return jsonResponse_(result)
            }
            if (action === 'saveUser') {
                const result = saveUser_(payload)
                return jsonResponse_(result)
            }
            if (action === 'changePin') {
                const result = changePin_(payload)
                return jsonResponse_(result)
            }
            if (action === 'uploadExport') {
                const result = uploadExport_(payload)
                return jsonResponse_(result)
            }
            if (action === 'uploadReceipt') {
                const result = uploadReceipt_(payload)
                return jsonResponse_(result)
            }
            if (action === 'savePosSettings') {
                const result = savePosSettings_(
                    payload && payload.settings ? payload.settings : payload
                )
                return jsonResponse_(result)
            }
            if (action === 'saveMenuItem') {
                const result = saveMenuItem_(payload)
                return jsonResponse_(result)
            }
            if (action === 'saveCategory') {
                const result = saveCategory_(payload)
                return jsonResponse_(result)
            }
            if (action === 'setMenuImage') {
                const result = setMenuImage_(payload)
                return jsonResponse_(result)
            }
            if (action === 'addIngredientStock') {
                const result = addIngredientStock_(payload)
                return jsonResponse_(result)
            }
            if (action === 'consumeIngredient') {
                const result = consumeIngredient_(payload)
                return jsonResponse_(result)
            }
            if (action === 'recordRestock') {
                const result = recordRestock_(payload)
                return jsonResponse_(result)
            }
            if (action === 'saveTenantConfig') {
                const result = saveTenantConfig_(payload)
                return jsonResponse_(result)
            }
            if (action === 'saveOpenTicketsSnapshot') {
                const result = saveOpenTicketsSnapshot_(payload || {})
                const status = result.ok ? 200 : 400
                return jsonResponse_(result, status)
            }
            if (action === 'clockPunch') {
                const result = recordClockPunch_(payload)
                const status = result.ok
                    ? 200
                    : result.status
                      ? result.status
                      : 400
                return jsonResponse_(result, status)
            }
            if (action === 'pageUser') {
                const result = recordPager_(
                    tenantId,
                    Object.assign({}, payload, {
                        sender:
                            (payload && payload.actor) ||
                            (payload && payload.sender) ||
                            '',
                    })
                )
                return jsonResponse_(result)
            }
            if (action === 'ackPager') {
                const pagerId = payload && payload.id
                if (!pagerId) {
                    return jsonResponse_(
                        { ok: false, error: 'id required' },
                        400
                    )
                }
                const result = ackPager_(
                    tenantId,
                    pagerId,
                    (payload && payload.ackBy) ||
                        (payload && payload.actor) ||
                        ''
                )
                const status = result.ok ? 200 : 404
                return jsonResponse_(result, status)
            }
            if (action === 'registerPushSubscription') {
                const result = registerPushSubscription_(
                    tenantId,
                    payload || {}
                )
                const status = result.ok ? 200 : 400
                return jsonResponse_(result, status)
            }
            if (action === 'unregisterPushSubscription') {
                const identifier =
                    payload &&
                    typeof payload === 'object' &&
                    Object.keys(payload).length
                        ? payload
                        : payload && typeof payload === 'string'
                          ? payload
                          : ''
                const result = unregisterPushSubscription_(tenantId, identifier)
                const status = result.ok
                    ? 200
                    : result.error === 'identifier required'
                      ? 400
                      : 404
                return jsonResponse_(result, status)
            }

            return jsonResponse_(
                {
                    ok: false,
                    error: 'Unknown or disabled action',
                    action,
                },
                400
            )
        })
    } catch (err) {
        return jsonResponse_(
            {
                success: false,
                error: String(err && err.message ? err.message : err),
            },
            500
        )
    }
}
function doGet(e) {
    try {
        const params = (e && e.parameter) || {}
        const action = (params && params.action) || ''
        if (action === 'listTenants') {
            const tenants = listTenants_()
            return jsonResponse_({ ok: true, tenants: tenants })
        }
        const tenantId = params.tenantId
            ? String(params.tenantId || '').trim()
            : ''
        const accountEmail = params.accountEmail
            ? String(params.accountEmail || '').trim()
            : ''

        return withTenantContext_(tenantId, accountEmail, function () {
            if (action === 'openShift') {
                const result = openShift()
                return jsonResponse_(Object.assign({ ok: true }, result))
            }
            if (action === 'menu') {
                const items = listMenu_()
                return jsonResponse_({ ok: true, items })
            }
            if (action === 'categories') {
                const cats = listCategories_()
                return jsonResponse_({ ok: true, items: cats })
            }
            if (action === 'dailySalesSummary') {
                const result = listDailySalesSummary_(params)
                return jsonResponse_(result)
            }
            if (action === 'inventorySnapshot') {
                const result = getInventorySnapshot_(params)
                return jsonResponse_(result)
            }
            if (action === 'listUsers') {
                const users = listUsers_()
                return jsonResponse_({ ok: true, users })
            }
            if (action === 'getPosSettings') {
                const res = getPosSettings_()
                return jsonResponse_(res)
            }
            if (action === 'getUser') {
                const pin = params.pin || ''
                const result = getUser_(pin)
                return jsonResponse_(result)
            }
            if (action === 'ingredients') {
                const items = listIngredients_()
                return jsonResponse_({ ok: true, items })
            }
            if (action === 'restocks') {
                const items = listRestocks_()
                return jsonResponse_({ ok: true, items })
            }
            if (action === 'inventoryUnits') {
                const items = listInventoryUnits_()
                return jsonResponse_({ ok: true, items })
            }
            if (action === 'tenantConfig') {
                const result = getTenantConfig_(tenantId, accountEmail)
                return jsonResponse_(result)
            }
            if (action === 'listPagers') {
                const events = listPagerEvents_(
                    tenantId,
                    params.targetPin || '',
                    params.includeAcked === '1'
                ).map(function (row) {
                    var metadata = null
                    if (row.metadataJson && row.metadataJson.length) {
                        try {
                            metadata = JSON.parse(row.metadataJson)
                        } catch (err) {
                            metadata = null
                        }
                    }
                    return {
                        id: row.id,
                        tenantId: row.tenantId,
                        targetPin: row.targetPin,
                        targetRole: row.targetRole,
                        message: row.message,
                        createdAt: row.createdAt,
                        sender: row.sender,
                        origin: row.origin,
                        ackAt: row.ackAt,
                        ackBy: row.ackBy,
                        metadata: metadata,
                    }
                })
                return jsonResponse_({ ok: true, events: events })
            }
            if (action === 'listPushSubscriptions') {
                const events = listPushSubscriptions_(
                    tenantId,
                    params.targetUserId || params.userId || ''
                )
                return jsonResponse_({ ok: true, subscriptions: events })
            }
            if (action === 'listOpenTickets') {
                const result = listOpenTickets_()
                return jsonResponse_(result, result.ok ? 200 : 500)
            }
            if (action === 'recordTicket') {
                const p = {
                    ticketId: params.ticketId,
                    ticketName: params.ticketName,
                    openedBy: params.openedBy,
                    openedAt: params.openedAt,
                    status: params.status,
                    price: params.price,
                    date: params.date,
                    pay: params.pay,
                    closedAt: params.closedAt,
                }
                const result = recordTicket_(p)
                return jsonResponse_(result)
            }
            if (action === 'recordShift') {
                const p = {
                    shiftId: params.shiftId,
                    openedAt: params.openedAt,
                    openedBy: params.openedBy,
                    closedAt: params.closedAt,
                    closedBy: params.closedBy,
                    status: params.status,
                    cashSales: params.cashSales,
                    cardSales: params.cardSales,
                    promptPaySales: params.promptPaySales,
                    ticketsCount: params.ticketsCount,
                    itemsSoldJson: params.itemsSoldJson,
                    notes: params.notes,
                }
                const result = recordShift_(p)
                return jsonResponse_(result)
            }
            if (action === 'uploadExport') {
                const p = {
                    fileName: params.fileName,
                    contentBase64: params.contentBase64,
                    actor: params.actor,
                }
                const result = uploadExport_(p)
                return jsonResponse_(result)
            }
            return jsonResponse_({
                ok: true,
                message: 'Bynd POS GAS backend is running',
            })
        })
    } catch (err) {
        return jsonResponse_(
            {
                success: false,
                error: String(err && err.message ? err.message : err),
            },
            500
        )
    }
}
function listMenu_() {
    try {
        const sh = getSettingsSheet_('Menu')
        const last = sh.getLastRow()
        if (last < HEADER_ROW_INDEX) return []
        const lastCol = Math.min(sh.getLastColumn(), 24)
        const headers = sh
            .getRange(HEADER_ROW_INDEX, 1, 1, lastCol)
            .getValues()[0]
            .map(function (h) {
                return String(h || '')
                    .trim()
                    .toLowerCase()
            })
        const dataRowCount = last - HEADER_ROW_INDEX
        if (dataRowCount <= 0) return []
        function idx(name) {
            const i = headers.indexOf(name)
            return i >= 0 ? i : -1
        }
        const ID = idx('id'),
            NAME = idx('name'),
            DESC = idx('description'),
            PRICE = idx('price'),
            IMG = idx('image'),
            CAT = idx('category')
        const PPRICE = idx('purchaseprice'),
            WNAME = idx('warehousename'),
            SHELF = idx('shelf-life')
        const PUNIT = idx('purchaseunit'),
            CUNIT = idx('consumeunit'),
            VOL = idx('volume'),
            LOW = idx('lowstockwarning')
        const INGREDIENTS = idx('ingredients'),
            OPTIONS = idx('options'),
            UPDATED = idx('updatedat'),
            UNITSUPDATED = idx('unitsupdatedat')
        const rows = sh
            .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, lastCol)
            .getValues()
        const out = []
        for (var r = 0; r < rows.length; r++) {
            const row = rows[r]
            const id = String(row[ID >= 0 ? ID : 0] || '').trim()
            const name = String(row[NAME >= 0 ? NAME : 1] || '').trim()
            const description = String(row[DESC >= 0 ? DESC : 2] || '').trim()
            const price = Number(row[PRICE >= 0 ? PRICE : 3] || 0)
            const image = String(row[IMG >= 0 ? IMG : 4] || '').trim()
            const category = String(row[CAT >= 0 ? CAT : 5] || '').trim()
            const purchasePrice = Number(row[PPRICE >= 0 ? PPRICE : 6] || 0)
            const warehouseName = String(
                row[WNAME >= 0 ? WNAME : 7] || ''
            ).trim()
            const shelfLifeDays = Number(row[SHELF >= 0 ? SHELF : 8] || 0)
            const purchasedUnit = String(
                row[PUNIT >= 0 ? PUNIT : 9] || ''
            ).trim()
            const consumeUnit = String(
                row[CUNIT >= 0 ? CUNIT : 10] || ''
            ).trim()
            const volume = Number(row[VOL >= 0 ? VOL : 11] || 0)
            const lowStockQty = Number(row[LOW >= 0 ? LOW : 12] || 0)
            const ingredientsJson = String(
                row[INGREDIENTS >= 0 ? INGREDIENTS : 13] || ''
            ).trim()
            if (!name) continue
            out.push({
                id: id || name + '_' + r,
                name: name,
                description: description,
                price: isNaN(price) ? 0 : price,
                image: image,
                category: category,
                purchasePrice: isNaN(purchasePrice) ? 0 : purchasePrice,
                warehouseName: warehouseName,
                shelfLifeDays: isNaN(shelfLifeDays) ? 0 : shelfLifeDays,
                purchasedUnit: purchasedUnit,
                consumeUnit: consumeUnit,
                volume: isNaN(volume) ? 0 : volume,
                lowStockQty: isNaN(lowStockQty) ? 0 : lowStockQty,
                ingredients: ingredientsJson,
                options: String(row[OPTIONS >= 0 ? OPTIONS : 14] || '').trim(),
                updatedAt: Number(row[UPDATED >= 0 ? UPDATED : 15] || 0) || 0,
                unitsUpdatedAt:
                    Number(row[UNITSUPDATED >= 0 ? UNITSUPDATED : 16] || 0) ||
                    0,
            })
        }
        return out
    } catch (e) {
        return []
    }
}

function listCategories_() {
    try {
        const sh = getSettingsSheet_('Categories')
        const last = sh.getLastRow()
        if (last < HEADER_ROW_INDEX) return []
        const lastCol = Math.min(sh.getLastColumn(), 10)
        const headers = sh
            .getRange(HEADER_ROW_INDEX, 1, 1, lastCol)
            .getValues()[0]
            .map(function (h) {
                return String(h || '')
                    .trim()
                    .toLowerCase()
            })
        const dataRowCount = last - HEADER_ROW_INDEX
        if (dataRowCount <= 0) return []
        function idx(name) {
            const i = headers.indexOf(name)
            return i >= 0 ? i : -1
        }
        const ID = idx('id'),
            LABEL = idx('label'),
            ICON = idx('icon'),
            VALUE = idx('value')
        const rows = sh
            .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, lastCol)
            .getValues()
        const out = []
        for (var r = 0; r < rows.length; r++) {
            const row = rows[r]
            const id = String(row[ID >= 0 ? ID : 0] || '').trim()
            const label = String(row[LABEL >= 0 ? LABEL : 1] || '').trim()
            const icon = String(row[ICON >= 0 ? ICON : 2] || '').trim()
            const value =
                String(row[VALUE >= 0 ? VALUE : 3] || '').trim() || label || id
            if (!id && !label) continue
            out.push({
                id: id || value,
                label: label || id,
                icon: icon,
                value: value,
            })
        }
        return out
    } catch (e) {
        return []
    }
}

function listDailySalesSummary_(params) {
    try {
        const yearParam = params && params.year
        const monthParam = params && params.month
        const ctx = getMonthContextByParams_(yearParam, monthParam, false)
        const tz =
            ctx && ctx.tz ? ctx.tz : Session.getScriptTimeZone() || 'Etc/GMT'
        const yearNumber =
            ctx && ctx.yearNumber != null
                ? ctx.yearNumber
                : new Date().getFullYear()
        const monthNumber =
            ctx && ctx.monthNumber != null
                ? ctx.monthNumber
                : new Date().getMonth() + 1
        const monthLabel = Utilities.formatDate(
            new Date(yearNumber, monthNumber - 1, 1),
            tz,
            'MMMM'
        )
        if (!ctx || !ctx.monthSS) {
            return {
                ok: true,
                year: yearNumber,
                month: monthNumber,
                monthName: monthLabel,
                days: [],
            }
        }
        const daysInMonth = new Date(yearNumber, monthNumber, 0).getDate()
        const days = []
        for (var day = 1; day <= daysInMonth; day++) {
            const sheetName = pad2_(day)
            const sheet = ctx.monthSS.getSheetByName(sheetName)
            if (!sheet) continue
            const summary = extractDailySheetSummary_(sheet)
            if (!summary) continue
            const dateObj = new Date(yearNumber, monthNumber - 1, day)
            const isoDate = Utilities.formatDate(dateObj, tz, 'yyyy-MM-dd')
            const weekday = Utilities.formatDate(dateObj, tz, 'EEE')
            days.push(
                Object.assign(
                    {
                        day: day,
                        sheet: sheetName,
                        date: isoDate,
                        weekday: weekday,
                    },
                    summary
                )
            )
        }
        return {
            ok: true,
            year: yearNumber,
            month: monthNumber,
            monthName: monthLabel,
            days: days,
        }
    } catch (err) {
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function getInventorySnapshot_(params) {
    try {
        const yearParam = params && params.year
        const monthParam = params && params.month
        var rows = []
        var inventoryMap = {}
        if (yearParam || monthParam) {
            const ctx = getMonthContextByParams_(yearParam, monthParam, false)
            if (ctx && ctx.monthSS) {
                const sheet = ctx.monthSS.getSheetByName(INVENTORY_SHEET_NAME)
                if (sheet) {
                    const last = sheet.getLastRow()
                    if (last >= DATA_START_ROW_INDEX) {
                        const dataRowCount = last - HEADER_ROW_INDEX
                        const values = sheet
                            .getRange(
                                DATA_START_ROW_INDEX,
                                INVENTORY_BASE_COLUMN,
                                dataRowCount,
                                INVENTORY_HEADERS.length
                            )
                            .getValues()
                        for (var i = 0; i < values.length; i++) {
                            const row = values[i]
                            const name = String(row[0] || '').trim()
                            if (!name) continue
                            const closingStockNumber = Number(row[5] || 0) || 0
                            inventoryMap[name.toLowerCase()] =
                                closingStockNumber
                            rows.push({
                                id: name,
                                package: String(row[1] || '').trim(),
                                packageVolume: Number(row[2] || 0) || 0,
                                packageUnits: String(row[3] || '').trim(),
                                addedStock: Number(row[4] || 0) || 0,
                                closingStock: closingStockNumber,
                            })
                        }
                    }
                }
            }
        }
        if (!rows.length) {
            const ingredients = readInventoryIngredients_()
            rows = ingredients.map(function (ing) {
                const closingStockNumber = Number(ing.totalVolume || 0) || 0
                inventoryMap[
                    String(ing.name || '')
                        .trim()
                        .toLowerCase()
                ] = closingStockNumber
                return {
                    id: ing.name,
                    package: ing.package,
                    packageVolume: ing.packageVolume,
                    packageUnits: ing.packageUnits,
                    addedStock: ing.addedStock,
                    closingStock: closingStockNumber,
                }
            })
        }
        const menuAvailability = []
        try {
            const menuItems = listMenu_()
            if (menuItems && menuItems.length) {
                for (var m = 0; m < menuItems.length; m++) {
                    const item = menuItems[m] || {}
                    const rawIngredients = String(item.ingredients || '').trim()
                    if (!rawIngredients) continue
                    var parsedIngredients = null
                    try {
                        parsedIngredients = JSON.parse(rawIngredients)
                    } catch (parseErr) {
                        continue
                    }
                    if (
                        !parsedIngredients ||
                        !Array.isArray(parsedIngredients) ||
                        !parsedIngredients.length
                    )
                        continue
                    var limiting = ''
                    var minAvailable = Infinity
                    var ingredientDetails = []
                    for (var j = 0; j < parsedIngredients.length; j++) {
                        const ing = parsedIngredients[j] || {}
                        const rawName = String(
                            ing.name || ing.ingredient || ''
                        ).trim()
                        if (!rawName) continue
                        const required = Number(
                            ing.qty ??
                                ing.quantity ??
                                ing.amount ??
                                ing.units ??
                                0
                        )
                        if (!required || required <= 0) continue
                        const key = rawName.toLowerCase()
                        const availableVolume = Number(inventoryMap[key] || 0)
                        const availableCount =
                            availableVolume > 0
                                ? Math.floor(availableVolume / required)
                                : 0
                        if (availableCount < minAvailable) {
                            minAvailable = availableCount
                            limiting = rawName
                        }
                        ingredientDetails.push({
                            name: rawName,
                            required: required,
                            available: availableCount,
                            stock: availableVolume,
                        })
                    }
                    if (!ingredientDetails.length) continue
                    if (!isFinite(minAvailable) || minAvailable < 0)
                        minAvailable = 0
                    menuAvailability.push({
                        id: String(item.id || item.name || ''),
                        name: String(item.name || '').trim(),
                        available: minAvailable,
                        limitingIngredient: limiting || null,
                        ingredients: ingredientDetails,
                    })
                }
            }
        } catch (availabilityErr) {
            Logger.log(
                'getInventorySnapshot_: failed to compute menu availability: ' +
                    availabilityErr
            )
        }
        return {
            ok: true,
            rows: rows,
            menuAvailability: menuAvailability,
        }
    } catch (err) {
        Logger.log('getInventorySnapshot_ error: ' + err)
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
            rows: [],
            menuAvailability: [],
        }
    }
}

function extractShiftCloseRows_(sheet) {
    if (!sheet) return []
    try {
        ensureHeadersRow_(sheet, EVENT_HEADERS)
        const last = sheet.getLastRow()
        if (last < DATA_START_ROW_INDEX) return []
        const width = Math.max(sheet.getLastColumn(), EVENT_HEADERS.length)
        const dataRowCount = last - HEADER_ROW_INDEX
        if (dataRowCount <= 0) return []
        const values = sheet
            .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, width)
            .getValues()
        const actionIndex = EVENT_HEADERS.indexOf('action')
        if (actionIndex === -1) return []
        const tz =
            (typeof Session !== 'undefined' &&
                Session &&
                typeof Session.getScriptTimeZone === 'function' &&
                Session.getScriptTimeZone()) ||
            'Etc/GMT'
        const results = []
        for (var i = 0; i < values.length; i++) {
            const row = values[i]
            const actionRaw = row[actionIndex]
            const actionValue = String(actionRaw || '')
                .trim()
                .toLowerCase()
            if (actionValue !== 'shift.close') continue

            function pickValue(key) {
                const idx = EVENT_HEADERS.indexOf(key)
                if (idx === -1) return ''
                const value = row[idx]
                return value === undefined || value === null ? '' : value
            }
            function pickString(key) {
                const raw = pickValue(key)
                if (raw === null || raw === undefined) return ''
                return String(raw).trim()
            }
            function pickNumber(key) {
                const idx = EVENT_HEADERS.indexOf(key)
                if (idx === -1) return null
                const raw = row[idx]
                if (raw === null || raw === undefined) return null
                if (typeof raw === 'string' && raw.trim() === '') return null
                const parsed = parseReportNumber_(raw)
                return isNaN(parsed) || !isFinite(parsed) ? null : parsed
            }

            const rawTs = pickValue('ts')
            let closedAt = ''
            if (rawTs instanceof Date) {
                try {
                    closedAt = Utilities.formatDate(
                        rawTs,
                        tz,
                        'yyyy-MM-dd HH:mm:ss'
                    )
                } catch (err) {
                    closedAt = rawTs.toISOString()
                }
            } else {
                closedAt = pickString('ts')
            }

            results.push({
                rowNumber: i + DATA_START_ROW_INDEX,
                shiftId:
                    pickString('ShiftId') ||
                    pickString('shiftId') ||
                    pickString('ticketId'),
                closedAt: closedAt,
                managerOnDuty: pickString('ManagerOnDuty'),
                staffCount: pickNumber('StaffCount'),
                grossSales: pickNumber('GrossSales'),
                netSales: pickNumber('NetSales'),
                taxCollected: pickNumber('TaxCollected'),
                voidedAmount: pickNumber('VoidedAmount'),
                ticketsCount: pickNumber('TicketsCount'),
                completedTickets: pickNumber('CompletedTickets'),
                averageTicketValue: pickNumber('AverageTicketValue'),
                averageItemsPerTicket: pickNumber('AverageItemsPerTicket'),
                cashSales: pickNumber('CashSales'),
                cardSales: pickNumber('CardSales'),
                promptPaySales: pickNumber('PromptPaySales'),
                otherSales: pickNumber('OtherSales'),
                hoursOpen: pickNumber('HoursOpen'),
                cashDrawerStart: pickNumber('CashDrawerStart'),
                cashDrawerEnd: pickNumber('CashDrawerEnd'),
                cashVariance: pickNumber('CashVariance'),
            })
        }
        return results
    } catch (err) {
        Logger.log('extractShiftCloseRows_ failed: ' + err)
        return []
    }
}

function extractDailySheetSummary_(sheet) {
    if (!sheet) return null
    try {
        const values = sheet.getRange(2, 2, 7, 7).getValues()
        const get = function (row, col) {
            return values && values[row] ? values[row][col] : ''
        }
        const grossSales = parseReportNumber_(get(0, 0))
        const netSales = parseReportNumber_(get(1, 0))
        const taxCollected = parseReportNumber_(get(2, 0))
        const itemsSold = parseReportNumber_(get(3, 0))
        const averageItemPrice = parseReportNumber_(get(4, 0))
        const tickets = parseReportNumber_(get(5, 0))
        const averageTicketValue = parseReportNumber_(get(6, 0))
        const cashSales = parseReportNumber_(get(0, 2))
        const cardSales = parseReportNumber_(get(1, 2))
        const promptPaySales = parseReportNumber_(get(2, 2))
        const cardPercent = parseReportNumber_(get(0, 4))
        const cashPercent = parseReportNumber_(get(1, 4))
        const promptPayPercent = parseReportNumber_(get(2, 4))
        const employees = []
        for (var idx = 0; idx < 3; idx++) {
            const amount = parseReportNumber_(get(idx, 6))
            const labelCandidate = String(get(idx, 5) || '').trim()
            const name = labelCandidate || 'Employee ' + (idx + 1)
            if (amount || labelCandidate) {
                employees.push({
                    name: name,
                    total: amount,
                })
            }
        }
        return {
            grossSales: grossSales,
            netSales: netSales,
            taxCollected: taxCollected,
            itemsSold: itemsSold,
            averageItemPrice: averageItemPrice,
            tickets: tickets,
            averageTicketValue: averageTicketValue,
            payments: {
                cash: cashSales,
                card: cardSales,
                promptPay: promptPaySales,
            },
            paymentPercentages: {
                card: cardPercent,
                cash: cashPercent,
                promptPay: promptPayPercent,
            },
            employees: employees,
            shiftClosures: extractShiftCloseRows_(sheet),
        }
    } catch (err) {
        Logger.log('extractDailySheetSummary_ failed: ' + err)
        return null
    }
}

function saveCategory_(payload) {
    try {
        const sheet = getSettingsSheet_('Categories')
        const headersRangeWidth = Math.max(
            sheet.getLastColumn(),
            CATEGORIES_SHEET_HEADERS.length
        )
        const headerRow = sheet
            .getRange(HEADER_ROW_INDEX, 1, 1, headersRangeWidth)
            .getValues()[0]
            .map(function (value) {
                return String(value || '')
                    .trim()
                    .toLowerCase()
            })
        function idx(name) {
            const i = headerRow.indexOf(name)
            return i >= 0 ? i : -1
        }
        const ID = idx('id')
        const LABEL = idx('label')
        const ICON = idx('icon')
        const VALUE = idx('value')

        const rawLabel = String(
            (payload && (payload.label || payload.name)) || ''
        ).trim()
        if (!rawLabel) return { ok: false, error: 'label required' }
        const rawValue = String(
            (payload && (payload.value || payload.slug)) || rawLabel
        )
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        const value = rawValue || rawLabel
        const icon = String((payload && payload.icon) || '').trim()
        const providedId = String((payload && payload.id) || '').trim()
        const id = providedId || Utilities.getUuid()

        const width = Math.max(headersRangeWidth, 4)
        const last = sheet.getLastRow()
        const norm = function (input) {
            return String(input || '')
                .trim()
                .toLowerCase()
        }
        if (last >= DATA_START_ROW_INDEX) {
            const rows = sheet
                .getRange(
                    DATA_START_ROW_INDEX,
                    1,
                    last - HEADER_ROW_INDEX,
                    width
                )
                .getValues()
            for (var r = 0; r < rows.length; r++) {
                const row = rows[r]
                const rowId = row[ID >= 0 ? ID : 0]
                const rowLabel = row[LABEL >= 0 ? LABEL : 1]
                const rowValue = row[VALUE >= 0 ? VALUE : 3]
                if (
                    norm(rowId) === norm(id) ||
                    (rawLabel && norm(rowLabel) === norm(rawLabel)) ||
                    (value && norm(rowValue) === norm(value))
                ) {
                    const targetRow = r + DATA_START_ROW_INDEX
                    if (ID >= 0) sheet.getRange(targetRow, ID + 1).setValue(id)
                    if (LABEL >= 0)
                        sheet.getRange(targetRow, LABEL + 1).setValue(rawLabel)
                    if (ICON >= 0)
                        sheet.getRange(targetRow, ICON + 1).setValue(icon)
                    if (VALUE >= 0)
                        sheet.getRange(targetRow, VALUE + 1).setValue(value)
                    return {
                        ok: true,
                        updated: true,
                        category: {
                            id: id,
                            label: rawLabel,
                            value: value,
                            icon: icon,
                        },
                    }
                }
            }
        }
        const rowValues = new Array(width).fill('')
        if (ID >= 0) rowValues[ID] = id
        if (LABEL >= 0) rowValues[LABEL] = rawLabel
        if (ICON >= 0) rowValues[ICON] = icon
        if (VALUE >= 0) rowValues[VALUE] = value
        appendRowWithinWidth_(sheet, width, rowValues)
        return {
            ok: true,
            inserted: true,
            category: { id: id, label: rawLabel, value: value, icon: icon },
        }
    } catch (err) {
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function uploadReceipt_(payload) {
    try {
        var rawName = String(
            (payload && (payload.filename || payload.fileName)) || 'upload.bin'
        )
        var safeName = sanitizeDriveName_(rawName, 'upload.bin')
        var mime = String(
            (payload && payload.mimeType) || 'application/octet-stream'
        )
        var base64 = String(
            (payload && (payload.dataBase64 || payload.contentBase64)) || ''
        )
        if (!base64) {
            return { ok: false, error: 'dataBase64 required' }
        }
        var bytes = Utilities.base64Decode(base64)
        var blob = Utilities.newBlob(bytes, mime, safeName)
        var hint = String((payload && payload.folderHint) || '').trim()
        var folder = resolveTenantUploadFolder_(hint)
        var file = folder.createFile(blob)
        try {
            file.setSharing(
                DriveApp.Access.ANYONE_WITH_LINK,
                DriveApp.Permission.VIEW
            )
        } catch (err) {}
        var fileId = file.getId()
        var publicUrl =
            'https://drive.google.com/file/d/' + fileId + '/view?usp=drive_link'
        return {
            ok: true,
            fileId: fileId,
            url: publicUrl,
            webViewLink: publicUrl,
            webContentLink: publicUrl,
            folderId: folder.getId(),
        }
    } catch (err) {
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function getMonthContextByParams_(yearInput, monthInput, createIfMissing) {
    const tz = Session.getScriptTimeZone() || 'Etc/GMT'
    const now = new Date()
    var yearNumber = Number(yearInput)
    if (!yearNumber || !isFinite(yearNumber)) {
        yearNumber = Number(Utilities.formatDate(now, tz, 'yyyy'))
    }
    var monthNumber = Number(monthInput)
    if (
        !monthNumber ||
        !isFinite(monthNumber) ||
        monthNumber < 1 ||
        monthNumber > 12
    ) {
        monthNumber = Number(Utilities.formatDate(now, tz, 'M'))
    }
    const reference = new Date(yearNumber, monthNumber - 1, 1)
    const yearName = Utilities.formatDate(reference, tz, 'yyyy')
    const monthName = Utilities.formatDate(reference, tz, 'MMMM')
    const root = getOrCreateRootFolder_()
    var yearFolder = null
    if (createIfMissing) {
        yearFolder = getOrCreateFolder_(root, yearName)
    } else {
        yearFolder = findFolderByName_(root, yearName)
        if (!yearFolder) {
            return {
                tz: tz,
                yearNumber: yearNumber,
                monthNumber: monthNumber,
                yearName: yearName,
                monthName: monthName,
                root: root,
                yearFolder: null,
                monthSS: null,
                exists: false,
            }
        }
    }
    var monthSS = null
    if (createIfMissing) {
        monthSS = getOrCreateSpreadsheetInFolder_(yearFolder, monthName)
    } else if (yearFolder) {
        monthSS = findSpreadsheetInFolder_(yearFolder, monthName)
    }
    if (!monthSS) {
        return {
            tz: tz,
            yearNumber: yearNumber,
            monthNumber: monthNumber,
            yearName: yearName,
            monthName: monthName,
            root: root,
            yearFolder: yearFolder,
            monthSS: null,
            exists: false,
        }
    }
    if (createIfMissing) ensureReportsSheet_(monthSS)
    return {
        tz: tz,
        yearNumber: yearNumber,
        monthNumber: monthNumber,
        yearName: yearName,
        monthName: monthName,
        root: root,
        yearFolder: yearFolder,
        monthSS: monthSS,
        exists: true,
    }
}

function openShift(actor) {
    const ctx = getCurrentMonthContext_()
    const settingsSS = getSettingsSpreadsheet_()
    if (settingsSS) ensureSettingsSheets_(settingsSS)
    const daySheet = getOrCreateSheet_(ctx.monthSS, ctx.dayName)
    ensureHeadersRow_(daySheet, EVENT_HEADERS)
    appendEventRow_(daySheet, {
        action: 'shift.open',
        actor: String(actor || ''),
        shiftId: '',
        status: 'open',
    })
    return {
        rootFolder: describeFolder_(ctx.root),
        settings: settingsSS
            ? {
                  id: settingsSS.getId(),
                  name: settingsSS.getName(),
                  url: settingsSS.getUrl(),
                  sheets: SETTINGS_SHEET_DEFINITIONS.map(function (def) {
                      return def.name
                  }),
              }
            : null,
        period: {
            year: describeFolder_(ctx.yearFolder),
            month: {
                id: ctx.monthSS.getId(),
                name: ctx.monthSS.getName(),
                url: ctx.monthSS.getUrl(),
            },
            day: {
                name: ctx.dayName,
            },
        },
        menu: listMenu_(),
        categories: listCategories_(),
    }
}

function recordClockPunch_(payload) {
    try {
        const token = String((payload && payload.token) || '').trim()
        if (!token) {
            return { ok: false, error: 'token required', status: 400 }
        }
        const actionRaw = String((payload && payload.actionType) || '')
            .trim()
            .toLowerCase()
        if (actionRaw !== 'in' && actionRaw !== 'out') {
            return {
                ok: false,
                error: 'actionType must be "in" or "out"',
                status: 400,
            }
        }
        const secret = clockGetSecret_()
        const verifiedPayload = clockVerifyToken_(token, secret)
        clockEnsureNonceUnused_(verifiedPayload.nonce, verifiedPayload.exp)
        var actor = String((payload && payload.actor) || '').trim()
        if (!actor) actor = 'Unknown'
        var deviceId = String((payload && payload.deviceId) || '').trim()
        if (deviceId.length > 120) {
            deviceId = deviceId.slice(0, 120)
        }
        const action = actionRaw === 'out' ? 'clock.out' : 'clock.in'
        const meta = {
            deviceId: deviceId || null,
            kioskSession: verifiedPayload.kioskSession || null,
            nonce: verifiedPayload.nonce,
            tokenIat: verifiedPayload.iat,
            tokenExp: verifiedPayload.exp,
            userAgent:
                payload && payload.userAgent != null
                    ? String(payload.userAgent || '')
                    : null,
            receivedAt:
                payload && payload.receivedAt != null
                    ? Number(payload.receivedAt) || Date.now()
                    : Date.now(),
        }
        const ctx = getCurrentMonthContext_()
        const daySheet = getOrCreateSheet_(ctx.monthSS, ctx.dayName)
        appendEventRow_(daySheet, {
            action: action,
            actor: actor,
            category: 'clock',
            note: deviceId ? 'device:' + deviceId : '',
            metaJson: JSON.stringify(meta),
        })
        return {
            ok: true,
            action: action,
            actor: actor,
            deviceId: deviceId || null,
            kioskSession: verifiedPayload.kioskSession || null,
            nonce: verifiedPayload.nonce,
            ts: Date.now(),
        }
    } catch (err) {
        var message = err && err.message ? err.message : String(err)
        var lower = String(message || '').toLowerCase()
        var status = 400
        if (lower.indexOf('already used') >= 0) status = 409
        else if (lower.indexOf('expired') >= 0) status = 410
        return { ok: false, error: message, status: status }
    }
}

function recordTicket_(payload) {
    const ctx = getCurrentMonthContext_()
    const daySheet = getOrCreateSheet_(ctx.monthSS, ctx.dayName)
    ensureHeadersRow_(daySheet, EVENT_HEADERS)
    var action = String((payload && payload.eventAction) || '').trim()
    if (!action) {
        if (payload && (payload.pay || payload.paymentMethod))
            action = 'ticket.pay'
        else action = 'ticket.snapshot'
    }
    const actor = String((payload && payload.actor) || '').trim()
    const method = String(
        (payload && (payload.pay || payload.paymentMethod)) || ''
    ).trim()
    const status = String((payload && payload.status) || '').trim()
    const amountNumber = Number(payload && payload.price)
    const amount = isFinite(amountNumber) ? amountNumber : ''
    const inventoryDelta =
        action === 'ticket.pay'
            ? Number((payload && payload.inventoryDelta) || 0) || 0
            : ''
    const meta =
        payload && payload.meta
            ? payload.meta
            : {
                  openedAt: payload ? payload.openedAt || null : null,
                  closedAt: payload ? payload.closedAt || null : null,
              }
    const items = payload && Array.isArray(payload.items) ? payload.items : []
    const isTicketPay = action === 'ticket.pay'
    const methodLower = method ? method.toLowerCase() : ''
    const totalNumberRaw =
        meta && Object.prototype.hasOwnProperty.call(meta, 'total')
            ? Number(meta.total)
            : amountNumber
    const totalNumber =
        isTicketPay && isFinite(totalNumberRaw) ? totalNumberRaw : NaN
    const subtotalNumberRaw =
        meta && Object.prototype.hasOwnProperty.call(meta, 'subtotal')
            ? Number(meta.subtotal)
            : NaN
    const subtotalNumber =
        isTicketPay && isFinite(subtotalNumberRaw) ? subtotalNumberRaw : NaN
    const taxNumberRaw =
        meta && Object.prototype.hasOwnProperty.call(meta, 'taxAmount')
            ? Number(meta.taxAmount)
            : NaN
    const taxNumber = isTicketPay && isFinite(taxNumberRaw) ? taxNumberRaw : NaN
    const tipsNumberRaw = (function () {
        if (payload && payload.tips != null) return Number(payload.tips)
        if (payload && payload.tip != null) return Number(payload.tip)
        if (meta && Object.prototype.hasOwnProperty.call(meta, 'tips'))
            return Number(meta.tips)
        return NaN
    })()
    const tipsNumber =
        isTicketPay && isFinite(tipsNumberRaw) ? tipsNumberRaw : NaN
    const surchargeNumberRaw = (function () {
        if (payload && payload.surcharge != null)
            return Number(payload.surcharge)
        if (payload && payload.surcharges != null)
            return Number(payload.surcharges)
        if (meta && Object.prototype.hasOwnProperty.call(meta, 'surcharge'))
            return Number(meta.surcharge)
        if (meta && Object.prototype.hasOwnProperty.call(meta, 'surcharges'))
            return Number(meta.surcharges)
        return NaN
    })()
    const surchargeNumber =
        isTicketPay && isFinite(surchargeNumberRaw) ? surchargeNumberRaw : NaN
    const refundNumberRaw = (function () {
        if (action === 'ticket.refund') return amountNumber
        if (payload && payload.refundAmount != null)
            return Number(payload.refundAmount)
        if (meta && Object.prototype.hasOwnProperty.call(meta, 'refundAmount'))
            return Number(meta.refundAmount)
        return NaN
    })()
    const refundNumber =
        isTicketPay && isFinite(refundNumberRaw) ? refundNumberRaw : NaN
    const voidedAmountNumber =
        meta && Object.prototype.hasOwnProperty.call(meta, 'voidedAmount')
            ? Number(meta.voidedAmount)
            : NaN
    const ticketsCountValue = isTicketPay ? 1 : ''
    const completedTicketsValue =
        isTicketPay && status && status.toLowerCase() === 'closed' ? 1 : ''
    var itemsSoldCount = 0
    if (items.length) {
        for (var itIdx = 0; itIdx < items.length; itIdx++) {
            const qtyVal = Number((items[itIdx] && items[itIdx].qty) || 0)
            if (isFinite(qtyVal)) itemsSoldCount += qtyVal
        }
    } else if (!isTicketPay) {
        const qtyNumber = Number(payload && payload.qty)
        if (isFinite(qtyNumber)) itemsSoldCount = qtyNumber
    }
    const averageItemsPerTicketValue =
        isTicketPay && itemsSoldCount && itemsSoldCount > 0
            ? Number(itemsSoldCount)
            : ''
    const cashSalesValue =
        isTicketPay && isFinite(totalNumber) && methodLower === 'cash'
            ? totalNumber
            : ''
    const cardSalesValue =
        isTicketPay &&
        isFinite(totalNumber) &&
        (methodLower === 'card' ||
            methodLower === 'credit' ||
            methodLower === 'debit')
            ? totalNumber
            : ''
    const promptPaySalesValue =
        isTicketPay &&
        isFinite(totalNumber) &&
        (methodLower === 'promptpay' ||
            methodLower === 'prompt_pay' ||
            methodLower === 'qr' ||
            methodLower === 'prompt pay')
            ? totalNumber
            : ''
    const otherSalesValue =
        isTicketPay &&
        isFinite(totalNumber) &&
        !cashSalesValue &&
        !cardSalesValue &&
        !promptPaySalesValue
            ? totalNumber
            : ''
    const grossSalesValue =
        isTicketPay && isFinite(totalNumber) ? totalNumber : ''
    const netSalesValue =
        isTicketPay && isFinite(subtotalNumber) ? subtotalNumber : ''
    const taxCollectedValue =
        isTicketPay && isFinite(taxNumber) ? taxNumber : ''
    const tipsValue = isTicketPay && isFinite(tipsNumber) ? tipsNumber : ''
    const surchargesValue =
        isTicketPay && isFinite(surchargeNumber) ? surchargeNumber : ''
    const refundAmountValue =
        isTicketPay && isFinite(refundNumber) ? Math.abs(refundNumber) : ''
    const voidedAmountValue =
        isTicketPay && isFinite(voidedAmountNumber)
            ? Math.abs(voidedAmountNumber)
            : ''
    const averageTicketValue =
        isTicketPay && isFinite(totalNumber) ? totalNumber : ''
    const itemsSoldValue =
        isTicketPay && itemsSoldCount > 0 ? itemsSoldCount : ''
    const inventoryAdjustmentsValue = isTicketPay ? inventoryDelta : ''
    const normalizedShiftId = normalizeShiftIdentifier_(
        payload && payload.shiftId,
        payload && payload.ticketId
    )
    const normalizedTicketName = normalizeTicketName_(
        payload && payload.ticketName,
        payload && payload.ticketId
    )
    appendEventRow_(daySheet, {
        action: action,
        actor: actor,
        shiftId: normalizedShiftId,
        ticketId: String((payload && payload.ticketId) || '').trim(),
        ticketName: normalizedTicketName,
        itemId: String((payload && payload.itemId) || '').trim(),
        itemName: String((payload && payload.itemName) || '').trim(),
        category: String((payload && payload.category) || '').trim(),
        qty: coerceNumber_(payload && payload.qty),
        unitPrice: coerceNumber_(payload && payload.unitPrice),
        amount: amount,
        method: method,
        inventoryDelta: inventoryDelta,
        status: status,
        note: String((payload && payload.note) || '').trim(),
        GrossSales: grossSalesValue,
        NetSales: netSalesValue,
        TaxCollected: taxCollectedValue,
        Tips: tipsValue,
        Surcharges: surchargesValue,
        RefundAmount: refundAmountValue,
        VoidedAmount: voidedAmountValue,
        TicketsCount: ticketsCountValue,
        CompletedTickets: completedTicketsValue,
        AverageTicketValue: averageTicketValue,
        AverageItemsPerTicket: averageItemsPerTicketValue,
        CashSales: cashSalesValue,
        CardSales: cardSalesValue,
        PromptPaySales: promptPaySalesValue,
        OtherSales: otherSalesValue,
        ItemsSold: itemsSoldValue,
        InventoryAdjustments: inventoryAdjustmentsValue,
        metaJson: JSON.stringify(meta),
    })
    try {
        if (items.length) {
            for (var i = 0; i < items.length; i++) {
                const it = items[i] || {}
                const qtyRaw = Number(it.qty)
                const qty = isFinite(qtyRaw) ? qtyRaw : 0
                const itemInventoryDelta =
                    action === 'ticket.pay' ? -Math.abs(Number(qty) || 0) : ''
                appendEventRow_(daySheet, {
                    action: action === 'ticket.pay' ? 'sale.item' : 'cart.item',
                    actor: actor,
                    shiftId: normalizedShiftId,
                    ticketId: String(
                        (payload && payload.ticketId) || ''
                    ).trim(),
                    ticketName: normalizedTicketName,
                    itemId: String(it.itemId || '').trim(),
                    itemName: String(it.itemName || '').trim(),
                    category: String(it.category || '').trim(),
                    qty: coerceNumber_(qty),
                    unitPrice: coerceNumber_(it.unitPrice),
                    amount: coerceNumber_(it.lineTotal),
                    method: method,
                    inventoryDelta: itemInventoryDelta,
                    InventoryAdjustments: itemInventoryDelta,
                    ItemsSold:
                        action === 'ticket.pay' && qty > 0
                            ? coerceNumber_(qty)
                            : '',
                    status: status || (action === 'ticket.pay' ? 'closed' : ''),
                    metaJson: JSON.stringify({ ticketAction: action || '' }),
                })
                if (action === 'ticket.pay' && qty > 0) {
                    try {
                        consumeIngredientsForItem_(
                            String(it.itemName || '').trim(),
                            qty
                        )
                    } catch (consumeErr) {
                        Logger.log(
                            'consumeIngredientsForItem_ failed: ' + consumeErr
                        )
                    }
                }
            }
        }
    } catch (err) {
        Logger.log('recordTicket_ item processing error: ' + err)
    }
    return {
        ok: true,
        year: ctx.yearName,
        month: ctx.monthName,
        day: ctx.dayName,
        sheetUrl: ctx.monthSS.getUrl(),
    }
}

function recordShift_(payload) {
    const ctx = getCurrentMonthContext_()
    const daySheet = getOrCreateSheet_(ctx.monthSS, ctx.dayName)
    ensureHeadersRow_(daySheet, EVENT_HEADERS)
    var eventAction = String((payload && payload.eventAction) || '').trim()
    if (!eventAction) {
        eventAction =
            payload && String(payload.status || '').toLowerCase() === 'open'
                ? 'shift.open'
                : 'shift.close'
    }
    const actor = String((payload && payload.actor) || '').trim()
    const rawShiftId = String((payload && payload.shiftId) || '').trim()
    const shiftId = normalizeShiftIdentifier_(rawShiftId, null)
    if (eventAction === 'shift.open') {
        const openedAtDate =
            coerceDateTime_(payload && payload.openedAt) || ctx.now
        appendEventRow_(daySheet, {
            action: 'shift.open',
            actor: actor,
            shiftId: shiftId,
            status: 'open',
            Day: openedAtDate instanceof Date ? openedAtDate : ctx.now,
            ShiftOpenBy: String((payload && payload.openedBy) || actor || ''),
        })
    } else {
        const providedMeta = (payload && payload.meta) || {}
        const meta = {
            openedAt: coerceDateTime_(payload && payload.openedAt),
            openedBy: String((payload && payload.openedBy) || ''),
            closedAt: coerceDateTime_(payload && payload.closedAt),
            closedBy: String((payload && payload.closedBy) || ''),
            shiftDurationMin: coerceNumber_(providedMeta.shiftDurationMin),
            cashSales: coerceNumber_(payload && payload.cashSales),
            cardSales: coerceNumber_(payload && payload.cardSales),
            promptPaySales: coerceNumber_(payload && payload.promptPaySales),
            ticketsCount: coerceNumber_(payload && payload.ticketsCount),
            itemsSoldJson: (payload && payload.itemsSoldJson) || '',
            notes: (payload && payload.notes) || '',
            totalSales: coerceNumber_(providedMeta.totalSales),
            averageTicketValue: coerceNumber_(providedMeta.averageTicketValue),
            itemsCount: coerceNumber_(providedMeta.itemsCount),
            cashAdjustmentsNet: coerceNumber_(providedMeta.cashAdjustmentsNet),
            voidsApprovedCount: coerceNumber_(providedMeta.voidsApprovedCount),
            floatOpening: coerceNumber_(providedMeta.floatOpening),
            floatClosing: coerceNumber_(providedMeta.floatClosing),
            floatWithdrawn: coerceNumber_(providedMeta.floatWithdrawn),
            pettyOpening: coerceNumber_(providedMeta.pettyOpening),
            pettyClosing: coerceNumber_(providedMeta.pettyClosing),
            pettyWithdrawn: coerceNumber_(providedMeta.pettyWithdrawn),
            drawerExpected: coerceNumber_(providedMeta.drawerExpected),
            drawerVariance: coerceNumber_(providedMeta.drawerVariance),
        }
        for (var metaKey in providedMeta) {
            if (
                Object.prototype.hasOwnProperty.call(providedMeta, metaKey) &&
                !Object.prototype.hasOwnProperty.call(meta, metaKey)
            ) {
                meta[metaKey] = providedMeta[metaKey]
            }
        }
        function pickNumber(source, keys) {
            if (!source) return NaN
            for (var idx = 0; idx < keys.length; idx++) {
                if (!Object.prototype.hasOwnProperty.call(source, keys[idx]))
                    continue
                var raw = source[keys[idx]]
                var num = Number(raw)
                if (!isNaN(num) && isFinite(num)) return num
            }
            return NaN
        }
        function pickString(source, keys) {
            if (!source) return ''
            for (var idx = 0; idx < keys.length; idx++) {
                if (!Object.prototype.hasOwnProperty.call(source, keys[idx]))
                    continue
                var raw = source[keys[idx]]
                if (raw === null || raw === undefined) continue
                var str = String(raw).trim()
                if (str) return str
            }
            return ''
        }
        function asNumber(value) {
            if (value === '' || value === null || value === undefined)
                return NaN
            var num = Number(value)
            return !isNaN(num) && isFinite(num) ? num : NaN
        }
        const tz =
            ctx.tz ||
            (typeof Session !== 'undefined' &&
                Session &&
                typeof Session.getScriptTimeZone === 'function' &&
                Session.getScriptTimeZone()) ||
            'Etc/GMT'
        const closedAtDate =
            coerceDateTime_(payload && payload.closedAt) ||
            (meta.closedAt instanceof Date ? meta.closedAt : ctx.now)
        const cashSalesNumber = asNumber(payload && payload.cashSales)
        const cardSalesNumber = asNumber(payload && payload.cardSales)
        const promptPaySalesNumber = asNumber(payload && payload.promptPaySales)
        const grossSalesCandidate = asNumber(meta.totalSales)
        const derivedGross = (function () {
            var total = 0
            var seen = false
            var payments = [
                cashSalesNumber,
                cardSalesNumber,
                promptPaySalesNumber,
            ]
            for (var p = 0; p < payments.length; p++) {
                var val = payments[p]
                if (!isNaN(val) && isFinite(val)) {
                    total += val
                    seen = true
                }
            }
            return seen ? total : NaN
        })()
        const grossSalesNumber =
            !isNaN(grossSalesCandidate) && isFinite(grossSalesCandidate)
                ? grossSalesCandidate
                : derivedGross
        const netSalesCandidate = pickNumber(providedMeta, ['netSales'])
        const taxCollectedNumber = pickNumber(providedMeta, [
            'taxCollected',
            'tax',
        ])
        const tipsNumber = pickNumber(providedMeta, ['tips'])
        const surchargesNumber = pickNumber(providedMeta, ['surcharges'])
        const refundAmountNumber = pickNumber(providedMeta, ['refundAmount'])
        const voidedAmountNumber = pickNumber(providedMeta, ['voidedAmount'])
        const ticketsCountNumber = asNumber(payload && payload.ticketsCount)
        const completedTicketsNumber = (function () {
            const explicit = pickNumber(providedMeta, ['completedTickets'])
            if (!isNaN(explicit) && isFinite(explicit)) return explicit
            return ticketsCountNumber
        })()
        const averageTicketValueNumber = asNumber(meta.averageTicketValue)
        const itemsCountNumber = asNumber(meta.itemsCount)
        const avgItemsPerTicketNumber =
            ticketsCountNumber > 0 &&
            !isNaN(itemsCountNumber) &&
            isFinite(itemsCountNumber)
                ? itemsCountNumber / ticketsCountNumber
                : NaN
        const otherSalesNumber = pickNumber(providedMeta, ['otherSales'])
        const cashDepositedNumber = pickNumber(providedMeta, ['cashDeposited'])
        const cardPayoutExpectedNumber = pickNumber(providedMeta, [
            'cardPayoutExpected',
        ])
        const cogsNumber = pickNumber(providedMeta, ['COGS', 'cogs'])
        const inventoryAdjustmentsNumber = pickNumber(providedMeta, [
            'inventoryAdjustments',
        ])
        const wasteCountNumber = pickNumber(providedMeta, ['wasteCount'])
        const restockCostNumber = pickNumber(providedMeta, ['restockCost'])
        const endingInventoryValueNumber = pickNumber(providedMeta, [
            'endingInventoryValue',
        ])
        const topCategoryValue = pickString(providedMeta, ['topCategory'])
        const topItemValue = pickString(providedMeta, ['topItem'])
        const topItemQtyNumber = pickNumber(providedMeta, ['topItemQty'])
        const lowStockAlertsNumber = pickNumber(providedMeta, [
            'lowStockAlerts',
        ])
        const oosItemsNumber = pickNumber(providedMeta, ['oosItems'])
        const peakHourValue = pickString(providedMeta, ['peakHour'])
        const managerOnDutyValue =
            pickString(providedMeta, ['managerOnDuty']) ||
            String((payload && payload.managerOnDuty) || '')
        const staffCountNumber = (function () {
            const fromMeta = pickNumber(providedMeta, ['staffCount'])
            if (!isNaN(fromMeta) && isFinite(fromMeta)) return fromMeta
            if (payload && payload.staffCount != null)
                return Number(payload.staffCount)
            return NaN
        })()
        const shiftOpenByValue =
            pickString(providedMeta, ['openedBy']) ||
            String((payload && payload.openedBy) || '')
        const shiftCloseByValue =
            pickString(providedMeta, ['closedBy']) ||
            String((payload && payload.closedBy) || actor || '')
        const hoursOpenNumber = (function () {
            const minutes = asNumber(meta.shiftDurationMin)
            if (!isNaN(minutes) && isFinite(minutes) && minutes > 0) {
                return Math.round((minutes / 60) * 100) / 100
            }
            return NaN
        })()
        const cashDrawerStartNumber = (function () {
            const raw = meta.floatOpening
            const parsed = asNumber(raw)
            if (!isNaN(parsed) && isFinite(parsed)) return parsed
            const pick = pickNumber(providedMeta, ['cashDrawerStart'])
            return pick
        })()
        const cashDrawerEndNumber = (function () {
            const raw = meta.floatClosing
            const parsed = asNumber(raw)
            if (!isNaN(parsed) && isFinite(parsed)) return parsed
            return pickNumber(providedMeta, ['cashDrawerEnd'])
        })()
        const cashVarianceNumber = (function () {
            const raw = meta.drawerVariance
            const parsed = asNumber(raw)
            if (!isNaN(parsed) && isFinite(parsed)) return parsed
            return pickNumber(providedMeta, ['cashVariance'])
        })()
        const netSalesNumber =
            !isNaN(netSalesCandidate) && isFinite(netSalesCandidate)
                ? netSalesCandidate
                : !isNaN(grossSalesNumber) &&
                    isFinite(grossSalesNumber) &&
                    !isNaN(taxCollectedNumber) &&
                    isFinite(taxCollectedNumber)
                  ? grossSalesNumber - taxCollectedNumber
                  : NaN
        appendEventRow_(daySheet, {
            action: 'shift.close',
            actor: actor,
            shiftId: shiftId,
            status: String((payload && payload.status) || 'closed'),
            Day: closedAtDate instanceof Date ? closedAtDate : ctx.now,
            DayOfWeek: (function () {
                try {
                    return Utilities.formatDate(
                        closedAtDate instanceof Date ? closedAtDate : ctx.now,
                        tz,
                        'EEEE'
                    )
                } catch (err) {
                    return ''
                }
            })(),
            ManagerOnDuty: managerOnDutyValue || '',
            StaffCount:
                !isNaN(staffCountNumber) && isFinite(staffCountNumber)
                    ? staffCountNumber
                    : '',
            GrossSales:
                !isNaN(grossSalesNumber) && isFinite(grossSalesNumber)
                    ? grossSalesNumber
                    : '',
            NetSales:
                !isNaN(netSalesNumber) && isFinite(netSalesNumber)
                    ? netSalesNumber
                    : '',
            TaxCollected:
                !isNaN(taxCollectedNumber) && isFinite(taxCollectedNumber)
                    ? taxCollectedNumber
                    : '',
            Tips: !isNaN(tipsNumber) && isFinite(tipsNumber) ? tipsNumber : '',
            Surcharges:
                !isNaN(surchargesNumber) && isFinite(surchargesNumber)
                    ? surchargesNumber
                    : '',
            RefundAmount:
                !isNaN(refundAmountNumber) && isFinite(refundAmountNumber)
                    ? refundAmountNumber
                    : '',
            VoidedAmount:
                !isNaN(voidedAmountNumber) && isFinite(voidedAmountNumber)
                    ? voidedAmountNumber
                    : '',
            TicketsCount:
                !isNaN(ticketsCountNumber) && isFinite(ticketsCountNumber)
                    ? ticketsCountNumber
                    : '',
            CompletedTickets:
                !isNaN(completedTicketsNumber) &&
                isFinite(completedTicketsNumber)
                    ? completedTicketsNumber
                    : '',
            AverageTicketValue:
                !isNaN(averageTicketValueNumber) &&
                isFinite(averageTicketValueNumber)
                    ? averageTicketValueNumber
                    : '',
            AverageItemsPerTicket:
                !isNaN(avgItemsPerTicketNumber) &&
                isFinite(avgItemsPerTicketNumber)
                    ? avgItemsPerTicketNumber
                    : '',
            PeakHour: peakHourValue || '',
            CashSales:
                !isNaN(cashSalesNumber) && isFinite(cashSalesNumber)
                    ? cashSalesNumber
                    : '',
            CardSales:
                !isNaN(cardSalesNumber) && isFinite(cardSalesNumber)
                    ? cardSalesNumber
                    : '',
            PromptPaySales:
                !isNaN(promptPaySalesNumber) && isFinite(promptPaySalesNumber)
                    ? promptPaySalesNumber
                    : '',
            OtherSales:
                !isNaN(otherSalesNumber) && isFinite(otherSalesNumber)
                    ? otherSalesNumber
                    : '',
            CashDeposited:
                !isNaN(cashDepositedNumber) && isFinite(cashDepositedNumber)
                    ? cashDepositedNumber
                    : '',
            CardPayoutExpected:
                !isNaN(cardPayoutExpectedNumber) &&
                isFinite(cardPayoutExpectedNumber)
                    ? cardPayoutExpectedNumber
                    : '',
            COGS: !isNaN(cogsNumber) && isFinite(cogsNumber) ? cogsNumber : '',
            ItemsSold:
                meta.itemsSoldJson && String(meta.itemsSoldJson).trim()
                    ? String(meta.itemsSoldJson)
                    : !isNaN(itemsCountNumber) && isFinite(itemsCountNumber)
                      ? itemsCountNumber
                      : '',
            InventoryAdjustments:
                !isNaN(inventoryAdjustmentsNumber) &&
                isFinite(inventoryAdjustmentsNumber)
                    ? inventoryAdjustmentsNumber
                    : '',
            WasteCount:
                !isNaN(wasteCountNumber) && isFinite(wasteCountNumber)
                    ? wasteCountNumber
                    : '',
            RestockCost:
                !isNaN(restockCostNumber) && isFinite(restockCostNumber)
                    ? restockCostNumber
                    : '',
            EndingInventoryValue:
                !isNaN(endingInventoryValueNumber) &&
                isFinite(endingInventoryValueNumber)
                    ? endingInventoryValueNumber
                    : '',
            TopCategory: topCategoryValue || '',
            TopItem: topItemValue || '',
            TopItemQty:
                !isNaN(topItemQtyNumber) && isFinite(topItemQtyNumber)
                    ? topItemQtyNumber
                    : '',
            LowStockAlerts:
                !isNaN(lowStockAlertsNumber) && isFinite(lowStockAlertsNumber)
                    ? lowStockAlertsNumber
                    : '',
            OOSItems:
                !isNaN(oosItemsNumber) && isFinite(oosItemsNumber)
                    ? oosItemsNumber
                    : '',
            ShiftOpenBy: shiftOpenByValue || '',
            ShiftCloseBy: shiftCloseByValue || '',
            HoursOpen:
                !isNaN(hoursOpenNumber) && isFinite(hoursOpenNumber)
                    ? hoursOpenNumber
                    : '',
            CashDrawerStart:
                !isNaN(cashDrawerStartNumber) && isFinite(cashDrawerStartNumber)
                    ? cashDrawerStartNumber
                    : '',
            CashDrawerEnd:
                !isNaN(cashDrawerEndNumber) && isFinite(cashDrawerEndNumber)
                    ? cashDrawerEndNumber
                    : '',
            CashVariance:
                !isNaN(cashVarianceNumber) && isFinite(cashVarianceNumber)
                    ? cashVarianceNumber
                    : '',
            note: String((payload && payload.notes) || '').trim(),
            metaJson: JSON.stringify(meta),
        })
    }
    return {
        ok: true,
        year: ctx.yearName,
        month: ctx.monthName,
        day: ctx.dayName,
        sheetUrl: ctx.monthSS.getUrl(),
    }
}

// ---------- Users (Settings/Users) ----------

function getUser_(pin) {
    pin = String(pin || '').trim()
    function normPin(v) {
        var s = String(v == null ? '' : v).trim()
        s = s.replace(/^0+/, '')
        return s.length ? s : '0'
    }
    if (!pin) return { ok: false, error: 'pin required' }
    const sh = getUsersSheet_()
    const last = sh.getLastRow()
    if (last < DATA_START_ROW_INDEX) return { ok: true, user: null }
    const dataRowCount = last - HEADER_ROW_INDEX
    if (dataRowCount <= 0) return { ok: true, user: null }
    const values = sh
        .getRange(
            DATA_START_ROW_INDEX,
            1,
            dataRowCount,
            Math.min(8, sh.getLastColumn())
        )
        .getValues()
    for (var i = 0; i < values.length; i++) {
        var r = values[i]
        if (normPin(r[0]) === normPin(pin)) {
            return {
                ok: true,
                user: {
                    pin: r[0],
                    role: r[1],
                    name: r[2],
                    email: r[3],
                    phone: r[4],
                    notes: r[5],
                    createdAt: r[6],
                    updatedAt: r[7],
                },
            }
        }
    }
    return { ok: true, user: null }
}

// ---------- POS Settings (Settings / POS Settings) ----------

function getPosSettingsSheet_() {
    return getSettingsSheet_('POS Settings')
}

function ensurePosSettingsHeaders_(sh) {
    ensureHeadersRow_(sh, POS_SETTINGS_HEADERS)
    return POS_SETTINGS_HEADERS
}

function getPosSettings_() {
    const sh = getPosSettingsSheet_()
    const headers = ensurePosSettingsHeaders_(sh)
    const last = sh.getLastRow()
    if (last < DATA_START_ROW_INDEX) return { ok: true, settings: {} }
    const width = headers.length
    const row = sh.getRange(DATA_START_ROW_INDEX, 1, 1, width).getValues()[0]
    const out = {}
    for (var i = 0; i < headers.length; i++) {
        out[headers[i]] = row[i]
    }
    return { ok: true, settings: out }
}

function savePosSettings_(payload) {
    const sh = getPosSettingsSheet_()
    const headers = ensurePosSettingsHeaders_(sh)
    const width = headers.length
    const map = {}
    if (payload && typeof payload === 'object') {
        for (var k in payload) map[k] = payload[k]
    }
    const row = new Array(width)
    for (var i = 0; i < headers.length; i++) {
        var key = headers[i]
        if (key === 'updatedAt') row[i] = new Date()
        else row[i] = map.hasOwnProperty(key) ? map[key] : ''
    }
    sh.getRange(DATA_START_ROW_INDEX, 1, 1, width).setValues([row])
    return { ok: true }
}

function saveUser_(payload) {
    const pin = String(payload.pin || '').trim()
    const role = String(payload.role || '').trim() || 'limited'
    const name = String(payload.name || '').trim()
    const email = String(payload.email || '').trim()
    const phone = String(payload.phone || '').trim()
    const notes = String(payload.notes || '').trim()
    if (!pin) return { ok: false, error: 'pin required' }
    const sh = getUsersSheet_()
    const last = sh.getLastRow()
    const now = new Date()
    function normPin(v) {
        var s = String(v == null ? '' : v).trim()
        s = s.replace(/^0+/, '')
        return s.length ? s : '0'
    }
    // Try update
    if (last >= DATA_START_ROW_INDEX) {
        const pins = sh
            .getRange(DATA_START_ROW_INDEX, 1, last - HEADER_ROW_INDEX, 1)
            .getValues()
        for (var r = 0; r < pins.length; r++) {
            if (normPin(pins[r][0]) === normPin(pin)) {
                const targetRow = r + DATA_START_ROW_INDEX
                sh.getRange(targetRow, 2).setValue(role)
                sh.getRange(targetRow, 3).setValue(name)
                sh.getRange(targetRow, 4).setValue(email)
                sh.getRange(targetRow, 5).setValue(phone)
                sh.getRange(targetRow, 6).setValue(notes)
                sh.getRange(targetRow, 8).setValue(now) // updatedAt
                return { ok: true }
            }
        }
    }
    // Insert new
    var row = [pin, role, name, email, phone, notes, now, now]
    var nextRow = Math.max(sh.getLastRow() + 1, DATA_START_ROW_INDEX)
    sh.getRange(nextRow, 1, 1, row.length).setValues([row])
    try {
        sh.getRange(nextRow, 1).setNumberFormat('@')
    } catch (e) {}
    return { ok: true }
}

function changePin_(payload) {
    const oldPin = String(payload.oldPin || payload.pin || '').trim()
    const newPin = String(payload.newPin || '').trim()
    if (!oldPin) return { ok: false, error: 'oldPin required' }
    if (!newPin) return { ok: false, error: 'newPin required' }
    if (newPin === oldPin) return { ok: true, unchanged: true }
    const sh = getUsersSheet_()
    const last = sh.getLastRow()
    if (last < DATA_START_ROW_INDEX)
        return { ok: false, error: 'oldPin not found' }
    // Prevent duplicate new pin
    function normPin(v) {
        var s = String(v == null ? '' : v).trim()
        s = s.replace(/^0+/, '')
        return s.length ? s : '0'
    }
    const pins = sh
        .getRange(DATA_START_ROW_INDEX, 1, last - HEADER_ROW_INDEX, 1)
        .getValues()
        .map(function (r) {
            return r[0]
        })
    for (var i = 0; i < pins.length; i++) {
        if (normPin(pins[i]) === normPin(newPin))
            return { ok: false, error: 'new pin already exists' }
    }
    for (var r = 0; r < pins.length; r++) {
        if (normPin(pins[r]) === normPin(oldPin)) {
            const targetRow = r + DATA_START_ROW_INDEX
            sh.getRange(targetRow, 1).setValue(newPin)
            try {
                sh.getRange(targetRow, 1).setNumberFormat('@')
            } catch (e) {}
            sh.getRange(targetRow, 8).setValue(new Date()) // updatedAt
            return { ok: true }
        }
    }
    return { ok: false, error: 'oldPin not found' }
}

function listUsers_() {
    const sh = getUsersSheet_()
    const last = sh.getLastRow()
    if (last < HEADER_ROW_INDEX) return []
    const lastCol = Math.min(sh.getLastColumn(), 8)
    const dataRowCount = last - HEADER_ROW_INDEX
    if (dataRowCount <= 0) return []
    const rows = sh
        .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, lastCol)
        .getValues()
    var out = []
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i]
        out.push({
            pin: String(r[0] || '').trim(),
            role: String(r[1] || '').trim(),
            name: String(r[2] || '').trim(),
            email: String(r[3] || '').trim(),
            phone: String(r[4] || '').trim(),
            notes: String(r[5] || '').trim(),
            createdAt: r[6] || null,
            updatedAt: r[7] || null,
        })
    }
    return out
}

// ---------- Menu Item Management ----------

function saveMenuItem_(payload) {
    try {
        const sh = getSettingsSheet_('Menu')
        const canonicalHeaders = [
            'id',
            'name',
            'description',
            'price',
            'image',
            'category',
            'purchasePrice',
            'warehouseName',
            'shelf-life',
            'purchaseUnit',
            'consumeUnit',
            'volume',
            'lowStockWarning',
            'ingredients',
            'options',
            'updatedAt',
            'unitsUpdatedAt',
        ]
        ensureHeadersRow_(sh, canonicalHeaders)

        const providedId = String(payload.id || '').trim()
        const id = providedId || Utilities.getUuid()
        const name = String(payload.name || '').trim()
        const description = String(payload.description || '').trim()
        const price = Number(payload.price || 0)
        const category = String(payload.category || '').trim()
        const purchasePrice = Number(payload.purchasePrice || 0)
        const warehouseName = String(payload.warehouseName || '').trim()
        const shelfLifeDays = Number(payload.shelfLifeDays || 0)
        const purchasedUnit = String(payload.purchasedUnit || '').trim()
        const consumeUnit = String(payload.consumeUnit || '').trim()
        const volume = Number(payload.volume || 0)
        const lowStockQty = Number(payload.lowStockQty || 0)
        const ingredientsJson = String(payload.ingredients || '').trim()
        const optionsJson = String(payload.options || '').trim()
        const matchName = String(payload.matchName || name).trim()
        const matchCategory = String(payload.matchCategory || category).trim()
        const now = Date.now()

        if (!name) return { ok: false, error: 'name required' }

        const lastCol = Math.max(canonicalHeaders.length, sh.getLastColumn())
        const headers = sh
            .getRange(HEADER_ROW_INDEX, 1, 1, lastCol)
            .getValues()[0]
            .map(function (h) {
                return String(h || '')
                    .trim()
                    .toLowerCase()
            })
        const headerWidth = headers.reduce(function (max, h, idx) {
            return h ? Math.max(max, idx + 1) : max
        }, canonicalHeaders.length)

        function idx(name) {
            const i = headers.indexOf(name)
            return i >= 0 ? i : -1
        }
        const ID = idx('id'),
            NAME = idx('name'),
            DESC = idx('description'),
            PRICE = idx('price'),
            IMG = idx('image'),
            CAT = idx('category')
        const PPRICE = idx('purchaseprice'),
            WNAME = idx('warehousename'),
            SHELF = idx('shelf-life')
        const PUNIT = idx('purchaseunit'),
            CUNIT = idx('consumeunit'),
            VOL = idx('volume'),
            LOW = idx('lowstockwarning')
        const INGREDIENTS = idx('ingredients'),
            OPTIONS = idx('options'),
            UPDATED = idx('updatedat'),
            UNITSUPDATED = idx('unitsupdatedat')

        // Try to find existing row by id or by matchName+matchCategory
        const lastDataRow = getLastRowWithinWidth_(sh, headerWidth)
        if (lastDataRow >= DATA_START_ROW_INDEX) {
            const rows = sh
                .getRange(
                    DATA_START_ROW_INDEX,
                    1,
                    lastDataRow - HEADER_ROW_INDEX,
                    lastCol
                )
                .getValues()
            for (var r = 0; r < rows.length; r++) {
                const rowId = String(rows[r][ID >= 0 ? ID : 0] || '').trim()
                const rowName = String(
                    rows[r][NAME >= 0 ? NAME : 1] || ''
                ).trim()
                const rowCat = String(rows[r][CAT >= 0 ? CAT : 5] || '').trim()

                if (
                    (id && rowId === id) ||
                    (rowName === matchName && rowCat === matchCategory)
                ) {
                    // Update existing row
                    const targetRow = r + DATA_START_ROW_INDEX
                    if (ID >= 0 && !rowId)
                        sh.getRange(targetRow, ID + 1).setValue(id)
                    if (NAME >= 0)
                        sh.getRange(targetRow, NAME + 1).setValue(name)
                    if (DESC >= 0)
                        sh.getRange(targetRow, DESC + 1).setValue(description)
                    if (PRICE >= 0)
                        sh.getRange(targetRow, PRICE + 1).setValue(price)
                    if (CAT >= 0)
                        sh.getRange(targetRow, CAT + 1).setValue(category)
                    if (PPRICE >= 0)
                        sh.getRange(targetRow, PPRICE + 1).setValue(
                            purchasePrice
                        )
                    if (WNAME >= 0)
                        sh.getRange(targetRow, WNAME + 1).setValue(
                            warehouseName
                        )
                    if (SHELF >= 0)
                        sh.getRange(targetRow, SHELF + 1).setValue(
                            shelfLifeDays
                        )
                    if (PUNIT >= 0)
                        sh.getRange(targetRow, PUNIT + 1).setValue(
                            purchasedUnit
                        )
                    if (CUNIT >= 0)
                        sh.getRange(targetRow, CUNIT + 1).setValue(consumeUnit)
                    if (VOL >= 0)
                        sh.getRange(targetRow, VOL + 1).setValue(volume)
                    if (LOW >= 0)
                        sh.getRange(targetRow, LOW + 1).setValue(lowStockQty)
                    if (INGREDIENTS >= 0)
                        sh.getRange(targetRow, INGREDIENTS + 1).setValue(
                            ingredientsJson
                        )
                    if (OPTIONS >= 0)
                        sh.getRange(targetRow, OPTIONS + 1).setValue(
                            optionsJson
                        )
                    if (UPDATED >= 0)
                        sh.getRange(targetRow, UPDATED + 1).setValue(now)
                    if (UNITSUPDATED >= 0)
                        sh.getRange(targetRow, UNITSUPDATED + 1).setValue(now)
                    return { ok: true, updated: true }
                }
            }
        }

        // Insert new row
        const writeWidth = Math.max(
            headerWidth,
            ID >= 0 ? ID + 1 : 1,
            NAME >= 0 ? NAME + 1 : 2,
            DESC >= 0 ? DESC + 1 : 3,
            PRICE >= 0 ? PRICE + 1 : 4,
            CAT >= 0 ? CAT + 1 : 6,
            PPRICE >= 0 ? PPRICE + 1 : 7,
            WNAME >= 0 ? WNAME + 1 : 8,
            SHELF >= 0 ? SHELF + 1 : 9,
            PUNIT >= 0 ? PUNIT + 1 : 10,
            CUNIT >= 0 ? CUNIT + 1 : 11,
            VOL >= 0 ? VOL + 1 : 12,
            LOW >= 0 ? LOW + 1 : 13,
            INGREDIENTS >= 0 ? INGREDIENTS + 1 : 14,
            OPTIONS >= 0 ? OPTIONS + 1 : 15,
            UPDATED >= 0 ? UPDATED + 1 : 16,
            UNITSUPDATED >= 0 ? UNITSUPDATED + 1 : 17
        )
        const newRow = new Array(writeWidth).fill('')
        if (ID >= 0) newRow[ID] = id
        if (NAME >= 0) newRow[NAME] = name
        if (DESC >= 0) newRow[DESC] = description
        if (PRICE >= 0) newRow[PRICE] = price
        if (CAT >= 0) newRow[CAT] = category
        if (PPRICE >= 0) newRow[PPRICE] = purchasePrice
        if (WNAME >= 0) newRow[WNAME] = warehouseName
        if (SHELF >= 0) newRow[SHELF] = shelfLifeDays
        if (PUNIT >= 0) newRow[PUNIT] = purchasedUnit
        if (CUNIT >= 0) newRow[CUNIT] = consumeUnit
        if (VOL >= 0) newRow[VOL] = volume
        if (LOW >= 0) newRow[LOW] = lowStockQty
        if (INGREDIENTS >= 0) newRow[INGREDIENTS] = ingredientsJson
        if (OPTIONS >= 0) newRow[OPTIONS] = optionsJson
        if (UPDATED >= 0) newRow[UPDATED] = now
        if (UNITSUPDATED >= 0) newRow[UNITSUPDATED] = now
        appendRowWithinWidth_(sh, writeWidth, newRow)
        var insertedRow = Math.max(lastDataRow, 1) + 1
        try {
            if (ID >= 0) sh.getRange(insertedRow, ID + 1).setNumberFormat('@')
        } catch (e) {}
        return { ok: true, inserted: true }
    } catch (err) {
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function setMenuImage_(payload) {
    try {
        const sh = getSettingsSheet_('Menu')
        const last = sh.getLastRow()
        if (last < DATA_START_ROW_INDEX)
            return { ok: false, error: 'No menu items found' }

        const id = String(payload.id || '').trim()
        const url = String(payload.url || '').trim()
        const matchName = String(payload.matchName || '').trim()
        const matchCategory = String(payload.matchCategory || '').trim()

        if (!url) return { ok: false, error: 'url required' }

        const lastCol = Math.max(6, sh.getLastColumn())
        const headers = sh
            .getRange(HEADER_ROW_INDEX, 1, 1, lastCol)
            .getValues()[0]
            .map(function (h) {
                return String(h || '')
                    .trim()
                    .toLowerCase()
            })

        function idx(name) {
            const i = headers.indexOf(name)
            return i >= 0 ? i : -1
        }
        const ID = idx('id'),
            NAME = idx('name'),
            IMG = idx('image'),
            CAT = idx('category')

        if (IMG < 0)
            return { ok: false, error: 'image column not found in Menu sheet' }

        const rows = sh
            .getRange(DATA_START_ROW_INDEX, 1, last - HEADER_ROW_INDEX, lastCol)
            .getValues()
        for (var r = 0; r < rows.length; r++) {
            const rowId = String(rows[r][ID >= 0 ? ID : 0] || '').trim()
            const rowName = String(rows[r][NAME >= 0 ? NAME : 1] || '').trim()
            const rowCat = String(rows[r][CAT >= 0 ? CAT : 5] || '').trim()

            if (
                (id && rowId === id) ||
                (rowName === matchName && rowCat === matchCategory)
            ) {
                sh.getRange(r + DATA_START_ROW_INDEX, IMG + 1).setValue(url)
                return { ok: true }
            }
        }

        return { ok: false, error: 'Menu item not found' }
    } catch (err) {
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

// ---------- Ingredients Management ----------

function listIngredients_() {
    const inventoryRows = readInventoryIngredients_()
    if (inventoryRows.length > 0) return inventoryRows
    return readSettingsIngredients_()
}

function readSettingsIngredients_() {
    try {
        const sh = getSettingsSheet_('Ingredients')
        const last = sh.getLastRow()
        if (last < HEADER_ROW_INDEX) return []
        const lastCol = Math.max(6, sh.getLastColumn())
        const headers = sh
            .getRange(HEADER_ROW_INDEX, 1, 1, lastCol)
            .getValues()[0]
            .map(function (h) {
                return String(h || '')
                    .trim()
                    .toLowerCase()
            })
        const dataRowCount = last - HEADER_ROW_INDEX
        if (dataRowCount <= 0) return []
        function idx(name) {
            const i = headers.indexOf(name)
            return i >= 0 ? i : -1
        }
        const NAME = idx('name'),
            PKG = idx('package'),
            PKGVOL = idx('packagevolume'),
            PKGUNITS = idx('packageunits'),
            ADDED = idx('addedstock'),
            LEGACY_STOCK = idx('packagesstock'),
            TOTALVOL = idx('totalvolume')
        const rows = sh
            .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, lastCol)
            .getValues()
        const out = []
        for (var r = 0; r < rows.length; r++) {
            const row = rows[r]
            const name = String(row[NAME >= 0 ? NAME : 0] || '').trim()
            if (!name) continue
            const pkg = String(row[PKG >= 0 ? PKG : 1] || '').trim()
            const pkgVol = Number(row[PKGVOL >= 0 ? PKGVOL : 2] || 0)
            const pkgUnits = String(
                row[PKGUNITS >= 0 ? PKGUNITS : 3] || ''
            ).trim()
            const addedValue =
                ADDED >= 0
                    ? row[ADDED]
                    : LEGACY_STOCK >= 0
                      ? row[LEGACY_STOCK]
                      : row[4]
            const addedStock = Number(addedValue || 0)
            const totalVol = Number(row[TOTALVOL >= 0 ? TOTALVOL : 5] || 0)
            out.push({
                name: name,
                package: pkg,
                packageVolume: isNaN(pkgVol) ? 0 : pkgVol,
                packageUnits: pkgUnits,
                addedStock: isNaN(addedStock) ? 0 : addedStock,
                totalVolume: isNaN(totalVol) ? 0 : totalVol,
            })
        }
        return out
    } catch (e) {
        return []
    }
}

function readInventoryIngredients_() {
    try {
        const ctx = getCurrentMonthContext_()
        var sheet = ctx.monthSS.getSheetByName(INVENTORY_SHEET_NAME)
        if (!sheet) sheet = getOrCreateSheet_(ctx.monthSS, INVENTORY_SHEET_NAME)
        ensureInventoryHeaders_(sheet)
        ensureInventoryCopyFromSettings_(sheet)
        const lastRow = sheet.getLastRow()
        if (lastRow < 2) return []
        const values = sheet
            .getRange(
                2,
                INVENTORY_BASE_COLUMN,
                lastRow - 1,
                INVENTORY_HEADERS.length
            )
            .getValues()
        const out = []
        for (var i = 0; i < values.length; i++) {
            const row = values[i]
            const name = String(row[0] || '').trim()
            if (!name) continue
            out.push({
                name: name,
                package: String(row[1] || ''),
                packageVolume: Number(row[2] || 0) || 0,
                packageUnits: String(row[3] || ''),
                addedStock: Number(row[4] || 0) || 0,
                totalVolume: Number(row[5] || 0) || 0,
            })
        }
        return out
    } catch (err) {
        Logger.log('readInventoryIngredients_ error: ' + err)
        return []
    }
}

function ensureInventoryHeaders_(sheet) {
    const headerRange = sheet.getRange(
        1,
        INVENTORY_BASE_COLUMN,
        1,
        INVENTORY_HEADERS.length
    )
    const current = headerRange.getValues()[0]
    var needsUpdate = false
    const headers = []
    for (var i = 0; i < INVENTORY_HEADERS.length; i++) {
        const desired = INVENTORY_HEADERS[i]
        headers.push(desired)
        const existing = String(current[i] || '')
            .trim()
            .toLowerCase()
        if (existing !== desired.toLowerCase()) needsUpdate = true
    }
    if (needsUpdate) headerRange.setValues([headers])
}

function ensureInventoryCopyFromSettings_(sheet) {
    ensureInventoryHeaders_(sheet)
    const lastRow = sheet.getLastRow()
    var existingNames = {}
    if (lastRow >= DATA_START_ROW_INDEX) {
        const existingRows = sheet
            .getRange(
                DATA_START_ROW_INDEX,
                INVENTORY_BASE_COLUMN,
                lastRow - HEADER_ROW_INDEX,
                INVENTORY_HEADERS.length
            )
            .getValues()
        for (var i = 0; i < existingRows.length; i++) {
            const key = String(existingRows[i][0] || '')
                .trim()
                .toLowerCase()
            if (key) existingNames[key] = true
        }
    }
    const settingsRows = readSettingsIngredients_()
    if (!settingsRows || !settingsRows.length) return
    const rowsToAppend = []
    for (var s = 0; s < settingsRows.length; s++) {
        const ing = settingsRows[s]
        const key = String(ing.name || '')
            .trim()
            .toLowerCase()
        if (!key || existingNames[key]) continue
        rowsToAppend.push([
            ing.name,
            ing.package || '',
            Number(ing.packageVolume || 0) || 0,
            ing.packageUnits || '',
            Number(ing.addedStock || 0) || 0,
            Number(ing.totalVolume || 0) || 0,
        ])
    }
    if (!rowsToAppend.length) return
    const insertRow =
        lastRow >= DATA_START_ROW_INDEX ? lastRow + 1 : DATA_START_ROW_INDEX
    sheet
        .getRange(
            insertRow,
            INVENTORY_BASE_COLUMN,
            rowsToAppend.length,
            INVENTORY_HEADERS.length
        )
        .setValues(rowsToAppend)
}

function ensureReportsSheet_(spreadsheet) {
    if (!spreadsheet) return null
    return ensureSheetWithHeaders_(
        spreadsheet,
        REPORTS_SHEET_NAME,
        REPORTS_HEADERS
    )
}

function getCurrentMonthContext_() {
    const tz = Session.getScriptTimeZone() || 'Etc/GMT'
    const now = new Date()
    const yearName = Utilities.formatDate(now, tz, 'yyyy')
    const monthName = Utilities.formatDate(now, tz, 'MMMM')
    const dayName = Utilities.formatDate(now, tz, 'dd')
    const root = getOrCreateRootFolder_()
    const yearFolder = getOrCreateFolder_(root, yearName)
    const monthSS = getOrCreateSpreadsheetInFolder_(yearFolder, monthName)
    ensureReportsSheet_(monthSS)
    return {
        tz: tz,
        now: now,
        root: root,
        yearFolder: yearFolder,
        monthSS: monthSS,
        yearName: yearName,
        monthName: monthName,
        dayName: dayName,
    }
}

function addIngredientStock_(payload) {
    try {
        const name = String((payload && payload.name) || '').trim()
        const amountInput =
            payload && payload.amount != null
                ? payload.amount
                : payload && payload.qty != null
                  ? payload.qty
                  : 0
        const amount = Number(amountInput || 0)
        if (!name) {
            return { ok: false, error: 'name required' }
        }
        if (!amount || amount <= 0 || isNaN(amount)) {
            return { ok: false, error: 'amount must be greater than 0' }
        }
        const ctx = getCurrentMonthContext_()
        const sheet = getOrCreateSheet_(ctx.monthSS, INVENTORY_SHEET_NAME)
        ensureInventoryHeaders_(sheet)
        ensureInventoryCopyFromSettings_(sheet)
        var lastRow = sheet.getLastRow()
        var data = []
        if (lastRow >= DATA_START_ROW_INDEX) {
            data = sheet
                .getRange(
                    DATA_START_ROW_INDEX,
                    INVENTORY_BASE_COLUMN,
                    lastRow - HEADER_ROW_INDEX,
                    INVENTORY_HEADERS.length
                )
                .getValues()
        }
        const nameKey = name.toLowerCase()
        var targetRowNumber = null
        var rowValues = null
        for (var i = 0; i < data.length; i++) {
            const rowName = String(data[i][0] || '')
                .trim()
                .toLowerCase()
            if (!rowName) continue
            if (rowName === nameKey) {
                targetRowNumber = i + DATA_START_ROW_INDEX
                rowValues = data[i]
                break
            }
        }
        if (targetRowNumber === null) {
            const settingsRows = readSettingsIngredients_()
            var base = null
            for (var s = 0; s < settingsRows.length; s++) {
                const candidate = settingsRows[s]
                if (
                    String(candidate.name || '')
                        .trim()
                        .toLowerCase() === nameKey
                ) {
                    base = candidate
                    break
                }
            }
            if (!base) {
                return { ok: false, error: 'Ingredient not found' }
            }
            targetRowNumber =
                lastRow >= DATA_START_ROW_INDEX
                    ? lastRow + 1
                    : DATA_START_ROW_INDEX
            rowValues = [
                base.name,
                base.package || '',
                Number(base.packageVolume || 0) || 0,
                base.packageUnits || '',
                Number(base.addedStock || 0) || 0,
                Number(base.totalVolume || 0) || 0,
            ]
            sheet
                .getRange(
                    targetRowNumber,
                    INVENTORY_BASE_COLUMN,
                    1,
                    INVENTORY_HEADERS.length
                )
                .setValues([rowValues])
            lastRow = targetRowNumber
        }
        const pkgName = String(rowValues[1] || '').trim()
        const pkgVolume = Number(rowValues[2] || 0) || 0
        const pkgUnits = String(rowValues[3] || '').trim()
        const currentAdded = Number(rowValues[4] || 0) || 0
        const currentTotal = Number(rowValues[5] || 0) || 0
        const volumeDelta =
            !isNaN(pkgVolume) && pkgVolume > 0 ? amount * pkgVolume : 0
        const newAdded = currentAdded + amount
        const newTotal = currentTotal + volumeDelta
        sheet
            .getRange(targetRowNumber, INVENTORY_BASE_COLUMN + 4)
            .setValue(newAdded)
        sheet
            .getRange(targetRowNumber, INVENTORY_BASE_COLUMN + 5)
            .setValue(newTotal)
        rowValues[4] = newAdded
        rowValues[5] = newTotal

        const actor = String((payload && payload.actor) || '').trim()
        const note = String((payload && payload.note) || '')
        const logActionRaw =
            (payload && payload.logAction) ||
            (payload && payload.eventAction) ||
            ''
        const eventAction = String(logActionRaw || 'stock.add')
        const meta = {
            package: pkgName,
            packageUnits: pkgUnits,
            packageVolume: pkgVolume,
            amountAdded: amount,
            volumeDelta: volumeDelta,
            packagesAdded: amount,
            addedStockBefore: currentAdded,
            addedStockAfter: newAdded,
            totalVolumeBefore: currentTotal,
            totalVolumeAfter: newTotal,
        }
        try {
            const daySheet = getOrCreateSheet_(ctx.monthSS, ctx.dayName)
            ensureHeadersRow_(daySheet, EVENT_HEADERS)
            const inventoryDelta = volumeDelta || amount
            appendEventRow_(daySheet, {
                action: eventAction || 'stock.add',
                actor: actor,
                itemName: name,
                qty: amount,
                inventoryDelta: inventoryDelta,
                InventoryAdjustments: inventoryDelta,
                note: note,
                metaJson: JSON.stringify(meta),
            })
        } catch (logErr) {
            Logger.log('Failed to log stock.add for ' + name + ': ' + logErr)
        }

        return {
            ok: true,
            addedStock: newAdded,
            totalVolume: newTotal,
            volumeDelta: volumeDelta || amount,
            newTotalVolume: newTotal,
        }
    } catch (err) {
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function getRestockSheet_() {
    const ss = getSettingsSpreadsheet_()
    var sh = ss.getSheetByName('Restocks')
    if (!sh) sh = ss.insertSheet('Restocks')
    ensureHeadersRow_(sh, RESTOCK_HEADERS)
    return sh
}

function listRestocks_() {
    const sh = getRestockSheet_()
    const last = sh.getLastRow()
    if (last < HEADER_ROW_INDEX) return []
    const width = Math.max(sh.getLastColumn(), RESTOCK_HEADERS.length)
    const dataRowCount = last - HEADER_ROW_INDEX
    if (dataRowCount <= 0) return []
    const rows = sh
        .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, width)
        .getValues()
    const out = []
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i]
        var id = String(r[0] || '').trim()
        if (!id) continue
        out.push({
            id: id,
            itemId: String(r[1] || '').trim(),
            itemName: String(r[2] || '').trim(),
            timestamp: Number(r[3] || 0) || 0,
            unit: String(r[4] || '').trim(),
            package: String(r[5] || '').trim(),
            unitsPerPackage: Number(r[6] || 0) || 0,
            packages: Number(r[7] || 0) || 0,
            extraUnits: Number(r[8] || 0) || 0,
            totalUnits: Number(r[9] || 0) || 0,
            actor: String(r[10] || '').trim(),
            notes: String(r[11] || '').trim(),
        })
    }
    return out
}

function recordRestock_(payload) {
    try {
        const sh = getRestockSheet_()
        const idRaw = payload && payload.id ? String(payload.id).trim() : ''
        const id = idRaw || Utilities.getUuid()
        const itemId = String((payload && payload.itemId) || '').trim()
        const itemName = String((payload && payload.itemName) || '').trim()
        const timestamp = Number(
            (payload && payload.timestamp != null ? payload.timestamp : '') ||
                Date.now()
        )
        const unitName = String((payload && payload.unit) || '').trim()
        const packageName = String((payload && payload.package) || '').trim()
        const unitsPerPackage = Number(
            (payload && payload.unitsPerPackage) || 0
        )
        const packages = Number((payload && payload.packages) || 0)
        const extraUnits = Number((payload && payload.extraUnits) || 0)
        const totalUnits = Number((payload && payload.totalUnits) || 0)
        const actor = String((payload && payload.actor) || '').trim()
        const notes = String((payload && payload.notes) || '').trim()

        const width = Math.max(sh.getLastColumn(), RESTOCK_HEADERS.length)
        const row = new Array(width).fill('')
        row[0] = id
        row[1] = itemId
        row[2] = itemName
        row[3] = timestamp || Date.now()
        row[4] = unitName
        row[5] = packageName
        row[6] = unitsPerPackage
        row[7] = packages
        row[8] = extraUnits
        row[9] = totalUnits
        row[10] = actor
        row[11] = notes
        appendRowWithinWidth_(sh, width, row)
        try {
            const ctx = getCurrentMonthContext_()
            const daySheet = getOrCreateSheet_(ctx.monthSS, ctx.dayName)
            ensureHeadersRow_(daySheet, EVENT_HEADERS)
            appendEventRow_(daySheet, {
                action: 'inventory.restock',
                actor: actor,
                itemId: itemId,
                itemName: itemName,
                qty: totalUnits,
                inventoryDelta: totalUnits,
                InventoryAdjustments: totalUnits,
                note: notes,
                metaJson: JSON.stringify({
                    restockId: id,
                    unit: unitName,
                    package: packageName,
                    unitsPerPackage: unitsPerPackage,
                    packages: packages,
                    extraUnits: extraUnits,
                    totalUnits: totalUnits,
                }),
            })
        } catch (logErr) {
            Logger.log('Failed to log inventory.restock: ' + logErr)
        }
        return {
            ok: true,
            id: id,
            timestamp: row[3],
        }
    } catch (err) {
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function consumeIngredient_(payload) {
    try {
        Logger.log(
            'consumeIngredient_ called with payload: ' + JSON.stringify(payload)
        )

        const name = String(payload.name || '').trim()
        const qtyToConsume = Number(payload.qty || 0)

        Logger.log(
            'Looking for ingredient: "' +
                name +
                '", qty to consume: ' +
                qtyToConsume
        )

        if (!name) return { ok: false, error: 'name required' }
        if (!qtyToConsume || qtyToConsume <= 0)
            return { ok: false, error: 'qty must be greater than 0' }

        const ctx = getCurrentMonthContext_()
        const sheet = ctx.monthSS.getSheetByName(INVENTORY_SHEET_NAME)
        if (!sheet) {
            Logger.log('Inventory sheet not found in month spreadsheet')
            return { ok: false, error: 'Inventory sheet not found' }
        }
        ensureInventoryHeaders_(sheet)
        ensureInventoryCopyFromSettings_(sheet)
        const lastRow = sheet.getLastRow()
        if (lastRow < DATA_START_ROW_INDEX) {
            Logger.log('No ingredients found in Inventory sheet')
            return { ok: false, error: 'No ingredients found' }
        }
        const values = sheet
            .getRange(
                DATA_START_ROW_INDEX,
                INVENTORY_BASE_COLUMN,
                lastRow - HEADER_ROW_INDEX,
                INVENTORY_HEADERS.length
            )
            .getValues()
        const nameKey = name.toLowerCase()
        var targetRowNumber = null
        var rowValues = null
        for (var i = 0; i < values.length; i++) {
            const rowName = String(values[i][0] || '')
                .trim()
                .toLowerCase()
            if (!rowName) continue
            if (rowName === nameKey) {
                targetRowNumber = i + DATA_START_ROW_INDEX
                rowValues = values[i]
                break
            }
        }
        if (targetRowNumber === null) {
            Logger.log('Ingredient "' + name + '" not found in Inventory sheet')
            return { ok: false, error: 'Ingredient not found' }
        }
        const pkgName = String(rowValues[1] || '').trim()
        const pkgVolume = Number(rowValues[2] || 0) || 0
        const pkgUnits = String(rowValues[3] || '').trim()
        const currentTotal = Number(rowValues[5] || 0) || 0
        const newTotal = currentTotal - qtyToConsume
        sheet
            .getRange(targetRowNumber, INVENTORY_BASE_COLUMN + 5)
            .setValue(newTotal)
        rowValues[5] = newTotal
        Logger.log(
            'Updated Inventory sheet row ' +
                targetRowNumber +
                ' totalVolume to ' +
                newTotal
        )

        const actor = String((payload && payload.actor) || '').trim()
        const note = String((payload && payload.note) || '')
        const meta = {
            package: pkgName,
            packageUnits: pkgUnits,
            packageVolume: pkgVolume,
            amountConsumed: qtyToConsume,
            totalVolumeBefore: currentTotal,
            totalVolumeAfter: newTotal,
        }
        try {
            const daySheet = getOrCreateSheet_(ctx.monthSS, ctx.dayName)
            ensureHeadersRow_(daySheet, EVENT_HEADERS)
            appendEventRow_(daySheet, {
                action: 'stock.consume',
                actor: actor,
                itemName: name,
                qty: qtyToConsume,
                inventoryDelta: -qtyToConsume,
                InventoryAdjustments: -qtyToConsume,
                note: note,
                metaJson: JSON.stringify(meta),
            })
        } catch (logErr) {
            Logger.log(
                'Failed to log stock.consume for ' + name + ': ' + logErr
            )
        }
        return { ok: true, totalVolume: newTotal, newTotal: newTotal }
    } catch (err) {
        Logger.log('Error in consumeIngredient_: ' + err)
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function consumeIngredientsForItem_(itemName, qtyMultiplier) {
    try {
        Logger.log(
            'consumeIngredientsForItem_ called with itemName: ' +
                itemName +
                ', qtyMultiplier: ' +
                qtyMultiplier
        )

        if (!itemName || !qtyMultiplier || qtyMultiplier <= 0) {
            Logger.log('Invalid parameters, exiting')
            return
        }

        // Get the menu item
        const menuItems = listMenu_()
        Logger.log('Found ' + menuItems.length + ' menu items')

        var menuItem = null
        for (var i = 0; i < menuItems.length; i++) {
            Logger.log(
                'Checking menu item: ' +
                    menuItems[i].name +
                    ' against ' +
                    itemName
            )
            if (String(menuItems[i].name).trim() === String(itemName).trim()) {
                menuItem = menuItems[i]
                break
            }
        }

        if (!menuItem) {
            Logger.log('Menu item not found: ' + itemName)
            return
        }

        Logger.log(
            'Found menu item: ' +
                menuItem.name +
                ', ingredients: ' +
                menuItem.ingredients
        )

        if (
            !menuItem.ingredients ||
            String(menuItem.ingredients).trim() === ''
        ) {
            Logger.log('No ingredients for this item')
            return
        }

        // Parse ingredients JSON
        var ingredientsList = []
        try {
            ingredientsList = JSON.parse(menuItem.ingredients)
            Logger.log('Parsed ingredients: ' + JSON.stringify(ingredientsList))
        } catch (e) {
            Logger.log('Failed to parse ingredients JSON: ' + e)
            return // Invalid JSON, skip
        }

        if (!Array.isArray(ingredientsList) || ingredientsList.length === 0) {
            Logger.log('Ingredients list is empty or not an array')
            return
        }

        // Consume each ingredient
        for (var j = 0; j < ingredientsList.length; j++) {
            var ing = ingredientsList[j]
            var ingName = String(ing.name || '').trim()
            var ingQty = Number(ing.qty || 0)

            Logger.log('Processing ingredient: ' + ingName + ', qty: ' + ingQty)

            if (ingName && ingQty > 0) {
                var totalQty = ingQty * qtyMultiplier
                Logger.log('Consuming ' + totalQty + ' of ' + ingName)
                try {
                    var result = consumeIngredient_({
                        name: ingName,
                        qty: totalQty,
                    })
                    Logger.log('Consume result: ' + JSON.stringify(result))
                } catch (e) {
                    Logger.log('Failed to consume ingredient: ' + e)
                    // Continue even if one ingredient fails
                }
            }
        }
    } catch (e) {
        Logger.log('Error in consumeIngredientsForItem_: ' + e)
        // Silent fail - don't block ticket recording
    }
}

function listInventoryUnits_() {
    const menuItems = listMenu_()
    if (!menuItems || !menuItems.length) return []
    const out = []
    const seen = {}
    for (var i = 0; i < menuItems.length; i++) {
        const item = menuItems[i]
        const id = String(item.id || '').trim()
        if (!id || seen[id]) continue
        seen[id] = true
        out.push({
            id: id,
            unit: String(item.consumeUnit || '').trim(),
            package: String(item.purchasedUnit || '').trim(),
            unitsPerPackage: Number(item.volume || 0) || 0,
            updatedAt:
                Number(item.unitsUpdatedAt || item.updatedAt || 0) ||
                Date.now(),
        })
    }
    return out
}

function getTenantSheet_() {
    const ss = getGlobalSettingsSpreadsheet_()
    var sh = ss.getSheetByName('Tenants')
    if (!sh) sh = ss.insertSheet('Tenants')
    ensureHeadersRow_(sh, TENANT_HEADERS)
    return sh
}

function findTenantConfig_(tenantId, accountEmail) {
    const sh = getTenantSheet_()
    const width = Math.max(sh.getLastColumn(), TENANT_HEADERS.length)
    const last = sh.getLastRow()
    if (last < HEADER_ROW_INDEX) return null
    const dataRowCount = last - HEADER_ROW_INDEX
    if (dataRowCount <= 0) return null
    const rows = sh
        .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, width)
        .getValues()
    const norm = function (value) {
        return String(value || '')
            .trim()
            .toLowerCase()
    }
    var selected = null
    if (tenantId) {
        const targetId = String(tenantId).trim()
        for (var i = 0; i < rows.length; i++) {
            const id = String(rows[i][0] || '').trim()
            if (id === targetId) {
                selected = rows[i]
                break
            }
        }
    }
    if (!selected && accountEmail) {
        const targetEmail = norm(accountEmail)
        for (var j = 0; j < rows.length; j++) {
            const rowEmail = norm(rows[j][1] || '')
            if (rowEmail && rowEmail === targetEmail) {
                selected = rows[j]
                break
            }
        }
    }
    if (!selected) {
        if (!tenantId && !accountEmail && rows.length) selected = rows[0]
        else return null
    }
    var rowNumber = rows.indexOf(selected)
    var rowIndex = rowNumber >= 0 ? rowNumber + DATA_START_ROW_INDEX : 0
    return {
        tenantId: String(selected[0] || '').trim(),
        accountEmail: String(selected[1] || '').trim(),
        settingsSpreadsheetId: String(selected[2] || '').trim(),
        menuSpreadsheetId: String(selected[3] || '').trim(),
        driveFolderId: String(selected[4] || '').trim(),
        metadataJson: String(selected[5] || '').trim(),
        createdAt: Number(selected[6] || 0) || 0,
        updatedAt: Number(selected[7] || 0) || 0,
        _rowIndex: rowIndex,
    }
}

function resolveTenantContext_(tenantId, accountEmail) {
    const tenantIdTrim = String(tenantId || '').trim()
    const accountEmailTrim = String(accountEmail || '').trim()
    if (!tenantIdTrim && !accountEmailTrim) return null
    var record = findTenantConfig_(tenantIdTrim, accountEmailTrim)
    if (!record && accountEmailTrim) {
        try {
            const result = saveTenantConfig_({
                tenantId: tenantIdTrim,
                accountEmail: accountEmailTrim,
            })
            if (result && result.ok) {
                var lookupId = tenantIdTrim
                if (!lookupId && result.tenantId) lookupId = result.tenantId
                record = findTenantConfig_(lookupId, accountEmailTrim)
            }
        } catch (err) {
            Logger.log('resolveTenantContext_ auto-create error: ' + err)
        }
    }
    if (!record) return null
    record = ensureTenantResources_(record)
    if (!record) return null
    var metadata = null
    if (record.metadataJson && record.metadataJson.length) {
        try {
            metadata = JSON.parse(record.metadataJson)
        } catch (err) {
            Logger.log('Failed to parse tenant metadata: ' + err)
            metadata = null
        }
    }
    return {
        tenantId: record.tenantId,
        accountEmail: record.accountEmail,
        settingsSpreadsheetId: record.settingsSpreadsheetId,
        menuSpreadsheetId:
            record.menuSpreadsheetId || record.settingsSpreadsheetId,
        driveFolderId: record.driveFolderId,
        metadata: metadata,
    }
}

function withTenantContext_(tenantId, accountEmail, callback) {
    const tenantIdTrim = String(tenantId || '').trim()
    const accountEmailTrim = String(accountEmail || '').trim()
    if (!tenantIdTrim && !accountEmailTrim) {
        throw new Error('Tenant context missing')
    }
    const previous = ACTIVE_TENANT_CONTEXT
    const context = resolveTenantContext_(tenantIdTrim, accountEmailTrim)
    if (!context) {
        throw new Error('Tenant configuration unavailable')
    }
    ACTIVE_TENANT_CONTEXT = context
    try {
        return callback(context)
    } finally {
        ACTIVE_TENANT_CONTEXT = previous
    }
}

function saveTenantConfig_(payload) {
    try {
        const sh = getTenantSheet_()
        const tenantIdRaw = String((payload && payload.tenantId) || '').trim()
        const accountEmailRaw = String(
            (payload && payload.accountEmail) || ''
        ).trim()
        const accountEmail = accountEmailRaw
            ? normalizeEmail_(accountEmailRaw)
            : ''
        const tenantId = canonicalTenantId_(tenantIdRaw, accountEmail)
        const settingsSpreadsheetId = String(
            (payload && payload.settingsSpreadsheetId) || ''
        ).trim()
        const menuSpreadsheetId = String(
            (payload && payload.menuSpreadsheetId) || ''
        ).trim()
        const driveFolderId = String(
            (payload && payload.driveFolderId) || ''
        ).trim()
        let metadataJson = String(
            (payload && payload.metadataJson) || ''
        ).trim()
        const ownerUserId = accountEmail
            ? deriveUserIdFromEmail_(accountEmail)
            : ''
        if (ownerUserId) {
            try {
                const metadataObj = metadataJson ? JSON.parse(metadataJson) : {}
                if (
                    metadataObj &&
                    typeof metadataObj === 'object' &&
                    metadataObj.ownerUserId !== ownerUserId
                ) {
                    metadataObj.ownerUserId = ownerUserId
                    metadataJson = JSON.stringify(metadataObj)
                }
            } catch (metadataErr) {
                Logger.log(
                    'saveTenantConfig_: failed parsing metadata, resetting owner user id: ' +
                        metadataErr
                )
                metadataJson = ownerUserId
                    ? JSON.stringify({ ownerUserId: ownerUserId })
                    : ''
            }
        }
        const now = Date.now()

        const width = Math.max(sh.getLastColumn(), TENANT_HEADERS.length)
        const last = sh.getLastRow()
        if (last >= DATA_START_ROW_INDEX) {
            const rows = sh
                .getRange(
                    DATA_START_ROW_INDEX,
                    1,
                    last - HEADER_ROW_INDEX,
                    width
                )
                .getValues()
            for (var r = 0; r < rows.length; r++) {
                const existingId = String(rows[r][0] || '').trim()
                const existingEmail = normalizeEmail_(rows[r][1] || '')
                if (
                    (existingId && existingId === tenantId) ||
                    (accountEmail && existingEmail === accountEmail)
                ) {
                    const targetRow = r + DATA_START_ROW_INDEX
                    sh.getRange(targetRow, 1).setValue(tenantId)
                    sh.getRange(targetRow, 2).setValue(accountEmail)
                    sh.getRange(targetRow, 3).setValue(settingsSpreadsheetId)
                    sh.getRange(targetRow, 4).setValue(menuSpreadsheetId)
                    sh.getRange(targetRow, 5).setValue(driveFolderId)
                    sh.getRange(targetRow, 6).setValue(metadataJson)
                    sh.getRange(targetRow, 7).setValue(rows[r][6] || now)
                    sh.getRange(targetRow, 8).setValue(now)
                    return { ok: true, tenantId: tenantId, updated: true }
                }
            }
        }

        const row = new Array(width).fill('')
        row[0] = tenantId
        row[1] = accountEmail
        row[2] = settingsSpreadsheetId
        row[3] = menuSpreadsheetId
        row[4] = driveFolderId
        row[5] = metadataJson
        row[6] = now
        row[7] = now
        appendRowWithinWidth_(sh, width, row)
        return { ok: true, tenantId: tenantId, inserted: true }
    } catch (err) {
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function getTenantConfig_(tenantId, accountEmail) {
    const record = findTenantConfig_(tenantId, accountEmail)
    if (!record) {
        return { ok: false, error: 'Tenant configuration unavailable' }
    }
    return {
        ok: true,
        tenantId: record.tenantId,
        accountEmail: record.accountEmail,
        settingsSpreadsheetId: record.settingsSpreadsheetId,
        menuSpreadsheetId: record.menuSpreadsheetId,
        driveFolderId: record.driveFolderId,
        metadataJson: record.metadataJson,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    }
}

function listTenants_() {
    const sh = getTenantSheet_()
    const width = Math.max(sh.getLastColumn(), TENANT_HEADERS.length)
    const last = sh.getLastRow()
    if (last < HEADER_ROW_INDEX) return []
    const dataRowCount = last - HEADER_ROW_INDEX
    if (dataRowCount <= 0) return []
    const rows = sh
        .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, width)
        .getValues()
    const tenants = []
    for (var i = 0; i < rows.length; i++) {
        const row = rows[i]
        const tenantId = String(row[0] || '').trim()
        if (!tenantId) continue
        const metadataRaw = String(row[5] || '').trim()
        const accountEmail = String(row[1] || '').trim()
        tenants.push({
            tenantId: tenantId,
            accountEmail: accountEmail,
            settingsSpreadsheetId: String(row[2] || '').trim(),
            menuSpreadsheetId: String(row[3] || '').trim(),
            driveFolderId: String(row[4] || '').trim(),
            metadataJson: metadataRaw,
            createdAt: Number(row[6] || 0) || 0,
            updatedAt: Number(row[7] || 0) || 0,
            ownerUserId: accountEmail
                ? deriveUserIdFromEmail_(accountEmail)
                : '',
        })
    }
    return tenants
}

// ---------- Tenant resource & Drive helpers ----------

function ensureTenantResources_(record) {
    let lock = null
    try {
        if (!record) return null
        try {
            lock = acquireScriptLock_(20000)
        } catch (lockErr) {
            Logger.log(
                'ensureTenantResources_: failed to acquire script lock: ' +
                    lockErr
            )
            throw lockErr
        }
        const tenantSheet = getTenantSheet_()
        const width = Math.max(
            tenantSheet.getLastColumn(),
            TENANT_HEADERS.length
        )
        const now = Date.now()
        var changed = false

        const normalizedEmail = normalizeEmail_(record.accountEmail || '')
        const canonicalTenantId = canonicalTenantId_(
            record.tenantId,
            normalizedEmail
        )
        if (record.tenantId !== canonicalTenantId) {
            record.tenantId = canonicalTenantId
            changed = true
        }
        if (record.accountEmail !== normalizedEmail) {
            record.accountEmail = normalizedEmail
            changed = true
        }

        var metadataObj = null
        if (record.metadataJson && record.metadataJson.length) {
            try {
                metadataObj = JSON.parse(record.metadataJson)
            } catch (err) {
                Logger.log(
                    'ensureTenantResources_: failed to parse metadata for ' +
                        record.tenantId +
                        ': ' +
                        err
                )
                metadataObj = null
                record.metadataJson = ''
                changed = true
            }
        }
        if (
            !metadataObj ||
            typeof metadataObj !== 'object' ||
            Array.isArray(metadataObj)
        ) {
            metadataObj = {}
        }
        const ownerUserId = normalizedEmail
            ? deriveUserIdFromEmail_(normalizedEmail)
            : ''
        if (ownerUserId && metadataObj.ownerUserId !== ownerUserId) {
            metadataObj.ownerUserId = ownerUserId
            record.metadataJson = JSON.stringify(metadataObj)
            changed = true
        }
        if (record.metadataJson && !ownerUserId && metadataObj.ownerUserId) {
            delete metadataObj.ownerUserId
            record.metadataJson = JSON.stringify(metadataObj)
            changed = true
        }
        record.metadata = metadataObj

        const tenantsRoot = getTenantsRootFolder_()
        var tenantFolder = null
        if (record.driveFolderId) {
            try {
                tenantFolder = DriveApp.getFolderById(record.driveFolderId)
            } catch (err) {
                Logger.log(
                    'ensureTenantResources_: missing tenant folder for ' +
                        record.tenantId +
                        ': ' +
                        err
                )
                tenantFolder = null
            }
        }
        if (!tenantFolder) {
            const folderName = buildTenantFolderName_(
                record.tenantId,
                normalizedEmail
            )
            tenantFolder =
                findFolderByName_(tenantsRoot, folderName) ||
                getOrCreateFolder_(tenantsRoot, folderName)
            record.driveFolderId = tenantFolder.getId()
            changed = true
        } else {
            try {
                const desiredName = buildTenantFolderName_(
                    record.tenantId,
                    normalizedEmail
                )
                if (tenantFolder.getName() !== desiredName) {
                    tenantFolder.setName(desiredName)
                }
            } catch (renameErr) {
                Logger.log(
                    'ensureTenantResources_: failed to rename tenant folder: ' +
                        renameErr
                )
            }
        }

        var settingsSpreadsheet = null
        if (record.settingsSpreadsheetId) {
            try {
                settingsSpreadsheet = SpreadsheetApp.openById(
                    record.settingsSpreadsheetId
                )
            } catch (err) {
                Logger.log(
                    'ensureTenantResources_: failed to open settings spreadsheet ' +
                        record.settingsSpreadsheetId +
                        ': ' +
                        err
                )
                settingsSpreadsheet = null
            }
        }
        if (!settingsSpreadsheet) {
            const spreadsheetName = buildTenantSpreadsheetName_(
                record.tenantId,
                normalizedEmail
            )
            var existingFile =
                (tenantFolder &&
                    findFileByNameInFolder_(tenantFolder, spreadsheetName)) ||
                findFileByNameInFolder_(getAppRootFolder_(), spreadsheetName)
            if (existingFile) {
                try {
                    settingsSpreadsheet = SpreadsheetApp.openById(
                        existingFile.getId()
                    )
                    record.settingsSpreadsheetId = settingsSpreadsheet.getId()
                    changed = true
                } catch (openExistingErr) {
                    Logger.log(
                        'ensureTenantResources_: failed to open existing settings spreadsheet: ' +
                            openExistingErr
                    )
                    settingsSpreadsheet = null
                }
            }
            if (!settingsSpreadsheet) {
                settingsSpreadsheet = SpreadsheetApp.create(spreadsheetName)
                record.settingsSpreadsheetId = settingsSpreadsheet.getId()
                changed = true
            }
            try {
                const file = DriveApp.getFileById(settingsSpreadsheet.getId())
                ensureFileInFolder_(file, tenantFolder)
            } catch (moveErr) {
                Logger.log(
                    'ensureTenantResources_: failed moving new spreadsheet: ' +
                        moveErr
                )
            }
        } else {
            try {
                const settingsFile = DriveApp.getFileById(
                    settingsSpreadsheet.getId()
                )
                ensureFileInFolder_(settingsFile, tenantFolder)
            } catch (locErr) {
                Logger.log(
                    'ensureTenantResources_: failed to ensure spreadsheet location: ' +
                        locErr
                )
            }
            try {
                const desiredName = buildTenantSpreadsheetName_(
                    record.tenantId,
                    normalizedEmail
                )
                if (settingsSpreadsheet.getName() !== desiredName) {
                    settingsSpreadsheet.rename(desiredName)
                }
            } catch (renameSheetErr) {
                Logger.log(
                    'ensureTenantResources_: failed to rename spreadsheet: ' +
                        renameSheetErr
                )
            }
        }

        if (settingsSpreadsheet) ensureSettingsSheets_(settingsSpreadsheet)

        if (record.menuSpreadsheetId) {
            try {
                SpreadsheetApp.openById(record.menuSpreadsheetId)
            } catch (err) {
                Logger.log(
                    'ensureTenantResources_: menu spreadsheet unreachable, fallback to settings: ' +
                        err
                )
                record.menuSpreadsheetId = ''
            }
        }
        if (!record.menuSpreadsheetId) {
            record.menuSpreadsheetId = record.settingsSpreadsheetId
            changed = true
        }

        if (!record.createdAt) {
            record.createdAt = now
            changed = true
        }
        if (changed) {
            record.updatedAt = now
            if (record._rowIndex && record._rowIndex >= 2) {
                const rowValues = tenantSheet
                    .getRange(record._rowIndex, 1, 1, width)
                    .getValues()[0]
                rowValues[0] = record.tenantId
                rowValues[1] = record.accountEmail
                rowValues[2] = record.settingsSpreadsheetId
                rowValues[3] = record.menuSpreadsheetId
                rowValues[4] = record.driveFolderId
                rowValues[5] = record.metadataJson || ''
                rowValues[6] = record.createdAt
                rowValues[7] = record.updatedAt
                tenantSheet
                    .getRange(record._rowIndex, 1, 1, width)
                    .setValues([rowValues])
            }
        } else if (!record.updatedAt) {
            record.updatedAt = now
        }
        return record
    } catch (err) {
        Logger.log('ensureTenantResources_ error: ' + err)
        return record
    } finally {
        if (lock) {
            try {
                lock.releaseLock()
            } catch (releaseErr) {
                Logger.log(
                    'ensureTenantResources_: failed to release script lock: ' +
                        releaseErr
                )
            }
        }
    }
}

function getPagerSheet_() {
    const ss = getGlobalSettingsSpreadsheet_()
    var sh = ss.getSheetByName('Pagers')
    if (!sh) sh = ss.insertSheet('Pagers')
    ensureHeadersRow_(sh, PAGER_HEADERS)
    return sh
}

function recordPager_(tenantId, payload) {
    const sh = getPagerSheet_()
    const width = Math.max(sh.getLastColumn(), PAGER_HEADERS.length)
    const now = Date.now()
    const id = payload && payload.id ? String(payload.id).trim() : ''
    const row = new Array(width).fill('')
    row[0] = id || Utilities.getUuid()
    row[1] = String(tenantId || '').trim()
    row[2] = String((payload && payload.targetPin) || '').trim()
    row[3] = String((payload && payload.targetRole) || '').trim()
    row[4] = String((payload && payload.message) || '').trim()
    row[5] = now
    row[6] = String((payload && payload.sender) || '').trim()
    row[7] = String((payload && payload.origin) || '').trim()
    row[8] = ''
    row[9] = ''
    row[10] =
        payload && payload.metadata ? JSON.stringify(payload.metadata) : ''
    appendRowWithinWidth_(sh, width, row)
    return {
        ok: true,
        id: row[0],
        tenantId: row[1],
        targetPin: row[2],
        targetRole: row[3],
        message: row[4],
        createdAt: row[5],
        sender: row[6],
        origin: row[7],
    }
}

function listPagerEvents_(tenantId, targetPin, includeAcked) {
    const sh = getPagerSheet_()
    const width = Math.max(sh.getLastColumn(), PAGER_HEADERS.length)
    const last = sh.getLastRow()
    if (last < HEADER_ROW_INDEX) return []
    const dataRowCount = last - HEADER_ROW_INDEX
    if (dataRowCount <= 0) return []
    const rows = sh
        .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, width)
        .getValues()
    const norm = function (value) {
        return String(value || '')
            .trim()
            .toLowerCase()
    }
    const tenantNorm = norm(tenantId)
    const targetNorm = norm(targetPin)
    const out = []
    for (var i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowTenant = norm(row[1])
        if (tenantNorm && rowTenant !== tenantNorm) continue
        const rowTarget = norm(row[2])
        if (targetNorm && rowTarget !== targetNorm) continue
        const ackAt = Number(row[8] || 0)
        if (!includeAcked && ackAt) continue
        out.push({
            id: String(row[0] || '').trim(),
            tenantId: row[1],
            targetPin: row[2],
            targetRole: row[3],
            message: row[4],
            createdAt: Number(row[5] || 0) || 0,
            sender: row[6],
            origin: row[7],
            ackAt: ackAt || null,
            ackBy: row[9] || null,
            metadataJson: row[10] || null,
        })
    }
    return out
}

function ackPager_(tenantId, pagerId, ackBy) {
    const sh = getPagerSheet_()
    const width = Math.max(sh.getLastColumn(), PAGER_HEADERS.length)
    const last = sh.getLastRow()
    if (last < HEADER_ROW_INDEX) return { ok: false, error: 'not-found' }
    const dataRowCount = last - HEADER_ROW_INDEX
    if (dataRowCount <= 0) return { ok: false, error: 'not-found' }
    const rows = sh
        .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, width)
        .getValues()
    const idNorm = String(pagerId || '').trim()
    const tenantNorm = String(tenantId || '')
        .trim()
        .toLowerCase()
    for (var i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowId = String(row[0] || '').trim()
        const rowTenant = String(row[1] || '')
            .trim()
            .toLowerCase()
        if (rowId === idNorm && (!tenantNorm || rowTenant === tenantNorm)) {
            const rowIndex = DATA_START_ROW_INDEX + i
            const now = Date.now()
            sh.getRange(rowIndex, 9).setValue(now)
            sh.getRange(rowIndex, 10).setValue(String(ackBy || ''))
            return {
                ok: true,
                id: rowId,
                tenantId: row[1],
                ackAt: now,
                ackBy: ackBy || '',
            }
        }
    }
    return { ok: false, error: 'not-found' }
}

function getPushSubscriptionsSheet_() {
    const ss = getGlobalSettingsSpreadsheet_()
    var sh = ss.getSheetByName('PushSubscriptions')
    if (!sh) sh = ss.insertSheet('PushSubscriptions')
    ensureHeadersRow_(sh, PUSH_SUBSCRIPTION_HEADERS)
    return sh
}

function registerPushSubscription_(tenantId, payload) {
    if (!payload) return { ok: false, error: 'payload required' }
    const channel = String(payload.channel || 'webpush')
        .trim()
        .toLowerCase()
    const userId = String(payload.userId || '').trim()
    if (!userId) return { ok: false, error: 'userId required' }
    const userAgent = String(payload.userAgent || '').trim()
    const actor = String(payload.actor || '').trim()
    const platform = String(payload.platform || '').trim()

    let endpoint = ''
    let token = ''
    let p256dh = ''
    let auth = ''

    if (channel === 'webpush' || channel === '') {
        const subscription = payload.subscription
        if (!subscription)
            return { ok: false, error: 'subscription required for webpush' }
        endpoint = String(subscription.endpoint || '').trim()
        if (!endpoint) return { ok: false, error: 'endpoint required' }
        const keys = subscription.keys || {}
        p256dh = String(keys.p256dh || '').trim()
        auth = String(keys.auth || '').trim()
    } else if (channel === 'fcm') {
        token = String(payload.token || payload.fcmToken || '').trim()
        if (!token) return { ok: false, error: 'token required for fcm' }
        endpoint = String(payload.endpoint || '').trim()
        p256dh = ''
        auth = ''
    } else {
        return { ok: false, error: 'unsupported channel' }
    }

    const sh = getPushSubscriptionsSheet_()
    const width = Math.max(sh.getLastColumn(), PUSH_SUBSCRIPTION_HEADERS.length)
    const last = sh.getLastRow()
    const now = Date.now()
    if (last >= DATA_START_ROW_INDEX) {
        const rowCount = last - HEADER_ROW_INDEX
        const rows = sh
            .getRange(DATA_START_ROW_INDEX, 1, rowCount, width)
            .getValues()
        const tenantNorm = String(tenantId || '')
            .trim()
            .toLowerCase()
        for (var i = 0; i < rows.length; i++) {
            const row = rows[i]
            const normalized = normalizeSubscriptionRow_(row)
            const rowTenant = String(normalized.tenantId || '')
                .trim()
                .toLowerCase()
            const rowChannel = normalized.channel || 'webpush'
            const isSameChannel = rowChannel === (channel || 'webpush')
            const matchesIdentifier =
                (endpoint && normalized.endpoint === endpoint) ||
                (token && normalized.token === token)
            if (
                isSameChannel &&
                matchesIdentifier &&
                (!tenantNorm || rowTenant === tenantNorm)
            ) {
                const rowIndex = DATA_START_ROW_INDEX + i
                const updated = {
                    id: normalized.id || Utilities.getUuid(),
                    tenantId:
                        normalized.tenantId || String(tenantId || '').trim(),
                    userId: userId,
                    channel: channel || 'webpush',
                    endpoint: endpoint,
                    token: token,
                    p256dh: p256dh,
                    auth: auth,
                    createdAt: normalized.createdAt || now,
                    lastSeen: now,
                    userAgent: userAgent || normalized.userAgent,
                    actor: actor || normalized.actor,
                    platform: platform || normalized.platform,
                }
                const next = subscriptionRowToArray_(updated, width)
                sh.getRange(rowIndex, 1, 1, width).setValues([next])
                return {
                    ok: true,
                    id: updated.id,
                    tenantId: updated.tenantId,
                    userId: updated.userId,
                    channel: updated.channel,
                    endpoint: updated.endpoint,
                    token: updated.token,
                    p256dh: updated.p256dh,
                    auth: updated.auth,
                    createdAt: updated.createdAt,
                    lastSeen: updated.lastSeen,
                }
            }
        }
    }
    const fresh = {
        id: Utilities.getUuid(),
        tenantId: String(tenantId || '').trim(),
        userId,
        channel: channel || 'webpush',
        endpoint,
        token,
        p256dh,
        auth,
        createdAt: now,
        lastSeen: now,
        userAgent,
        actor,
        platform,
    }
    const row = subscriptionRowToArray_(fresh, width)
    appendRowWithinWidth_(sh, width, row)
    return {
        ok: true,
        id: fresh.id,
        tenantId: fresh.tenantId,
        userId: fresh.userId,
        channel: fresh.channel,
        endpoint: fresh.endpoint,
        token: fresh.token,
        createdAt: fresh.createdAt,
        lastSeen: fresh.lastSeen,
    }
}

function listPushSubscriptions_(tenantId, targetUserId) {
    const sh = getPushSubscriptionsSheet_()
    const width = Math.max(sh.getLastColumn(), PUSH_SUBSCRIPTION_HEADERS.length)
    const last = sh.getLastRow()
    if (last < HEADER_ROW_INDEX) return []
    const rowCount = last - HEADER_ROW_INDEX
    if (rowCount <= 0) return []
    const tenantNorm = String(tenantId || '')
        .trim()
        .toLowerCase()
    const userNorm = String(targetUserId || '')
        .trim()
        .toLowerCase()
    const rows = sh
        .getRange(DATA_START_ROW_INDEX, 1, rowCount, width)
        .getValues()
    const out = []
    for (var i = 0; i < rows.length; i++) {
        const row = rows[i]
        const normalized = normalizeSubscriptionRow_(row)
        const rowTenant = String(normalized.tenantId || '')
            .trim()
            .toLowerCase()
        if (tenantNorm && rowTenant !== tenantNorm) continue
        const rowUser = String(normalized.userId || '')
            .trim()
            .toLowerCase()
        if (userNorm && rowUser !== userNorm) continue
        out.push({
            id: normalized.id,
            tenantId: normalized.tenantId,
            userId: normalized.userId,
            channel: normalized.channel,
            endpoint: normalized.endpoint,
            token: normalized.token,
            p256dh: normalized.p256dh,
            auth: normalized.auth,
            createdAt: normalized.createdAt,
            lastSeen: normalized.lastSeen,
            userAgent: normalized.userAgent,
            actor: normalized.actor,
            platform: normalized.platform,
        })
    }
    return out
}

function unregisterPushSubscription_(tenantId, identifier) {
    const sh = getPushSubscriptionsSheet_()
    const width = Math.max(sh.getLastColumn(), PUSH_SUBSCRIPTION_HEADERS.length)
    const last = sh.getLastRow()
    if (last < HEADER_ROW_INDEX) return { ok: false, error: 'not-found' }
    const rowCount = last - HEADER_ROW_INDEX
    if (rowCount <= 0) return { ok: false, error: 'not-found' }
    const tenantNorm = String(tenantId || '')
        .trim()
        .toLowerCase()
    let targetEndpoint = ''
    let targetToken = ''
    let targetChannel = ''
    if (identifier && typeof identifier === 'object') {
        targetEndpoint = String(identifier.endpoint || '').trim()
        targetToken = String(identifier.token || '').trim()
        targetChannel = String(identifier.channel || '')
            .trim()
            .toLowerCase()
    } else {
        targetEndpoint = String(identifier || '').trim()
    }
    if (!targetEndpoint && !targetToken) {
        return { ok: false, error: 'identifier required' }
    }
    const rows = sh
        .getRange(DATA_START_ROW_INDEX, 1, rowCount, width)
        .getValues()
    for (var i = 0; i < rows.length; i++) {
        const normalized = normalizeSubscriptionRow_(rows[i])
        const rowTenant = String(normalized.tenantId || '')
            .trim()
            .toLowerCase()
        const rowChannel = String(normalized.channel || '')
            .trim()
            .toLowerCase()
        const channelMatch = !targetChannel || rowChannel === targetChannel
        const endpointMatch =
            targetEndpoint && normalized.endpoint === targetEndpoint
        const tokenMatch = targetToken && normalized.token === targetToken
        if (
            channelMatch &&
            (endpointMatch || tokenMatch) &&
            (!tenantNorm || rowTenant === tenantNorm)
        ) {
            sh.deleteRow(DATA_START_ROW_INDEX + i)
            return { ok: true }
        }
    }
    return { ok: false, error: 'not-found' }
}

function getSettingsSpreadsheet_() {
    const ctx = ACTIVE_TENANT_CONTEXT
    if (ctx && ctx.settingsSpreadsheetId) {
        try {
            return SpreadsheetApp.openById(ctx.settingsSpreadsheetId)
        } catch (err) {
            Logger.log(
                'getSettingsSpreadsheet_: failed to open tenant spreadsheet: ' +
                    err
            )
        }
    }
    return getGlobalSettingsSpreadsheet_()
}

function getSettingsSheet_(sheetName) {
    const ss = getSettingsSpreadsheet_()
    if (!ss) throw new Error('Settings spreadsheet unavailable')
    var sheet = ss.getSheetByName(sheetName)
    if (!sheet) {
        const sheets = ss.getSheets()
        if (sheets.length === 1 && sheets[0].getName() === 'Sheet1') {
            sheet = sheets[0]
            sheet.setName(sheetName)
        } else {
            sheet = ss.insertSheet(sheetName)
        }
    }
    if (sheetName === 'POS Settings') ensurePosSettingsHeaders_(sheet)
    else {
        const headers = SETTINGS_HEADERS_BY_SHEET[sheetName]
        if (headers) ensureHeadersRow_(sheet, headers)
    }
    return sheet
}

function getUsersSheet_() {
    const sheet = getSettingsSheet_('Users')
    ensurePlainTextColumns_(sheet, [1, 2, 3, 4, 5, 6])
    return sheet
}

function getGlobalSettingsSpreadsheet_() {
    const props = PropertiesService.getScriptProperties()
    const key = 'GLOBAL_SETTINGS_SPREADSHEET_ID'
    var id = props.getProperty(key)
    if (id) {
        try {
            return SpreadsheetApp.openById(id)
        } catch (err) {
            Logger.log(
                'getGlobalSettingsSpreadsheet_: cached id invalid: ' + err
            )
            props.deleteProperty(key)
        }
    }
    const root = getAppRootFolder_()
    var ss = null
    const files = root.getFilesByName(SETTINGS_SPREADSHEET_NAME)
    while (files.hasNext()) {
        const file = files.next()
        try {
            ss = SpreadsheetApp.openById(file.getId())
            break
        } catch (openErr) {
            Logger.log(
                'getGlobalSettingsSpreadsheet_: failed to open candidate: ' +
                    openErr
            )
        }
    }
    if (!ss) {
        ss = SpreadsheetApp.create(SETTINGS_SPREADSHEET_NAME)
        try {
            const file = DriveApp.getFileById(ss.getId())
            ensureFileInFolder_(file, root)
        } catch (moveErr) {
            Logger.log(
                'getGlobalSettingsSpreadsheet_: failed moving new spreadsheet: ' +
                    moveErr
            )
        }
    }
    try {
        ensureSettingsSheets_(ss)
    } catch (err) {
        Logger.log(
            'getGlobalSettingsSpreadsheet_: ensure sheets failed: ' + err
        )
    }
    props.setProperty(key, ss.getId())
    return ss
}

function getAppRootFolder_() {
    const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME)
    return folders.hasNext()
        ? folders.next()
        : DriveApp.createFolder(ROOT_FOLDER_NAME)
}

function getTenantsRootFolder_() {
    const root = getAppRootFolder_()
    return getOrCreateFolder_(root, 'Tenants')
}

function getOrCreateRootFolder_() {
    const ctx = ACTIVE_TENANT_CONTEXT
    if (ctx && ctx.driveFolderId) {
        try {
            return DriveApp.getFolderById(ctx.driveFolderId)
        } catch (err) {
            Logger.log(
                'getOrCreateRootFolder_: failed to open tenant folder: ' + err
            )
        }
    }
    return getAppRootFolder_()
}

function getOrCreateFolder_(parent, name) {
    if (!parent) parent = getAppRootFolder_()
    const safeName = sanitizeDriveName_(name, 'Untitled')
    const existing = parent.getFoldersByName(safeName)
    return existing.hasNext() ? existing.next() : parent.createFolder(safeName)
}

function findFolderByName_(parent, name) {
    if (!parent) return null
    const safeName = sanitizeDriveName_(name, 'Untitled')
    const folders = parent.getFoldersByName(safeName)
    return folders.hasNext() ? folders.next() : null
}

function ensureFileInFolder_(file, folder) {
    if (!file || !folder) return
    try {
        const targetId = folder.getId()
        const parents = file.getParents()
        while (parents.hasNext()) {
            const parent = parents.next()
            if (parent.getId() === targetId) return
        }
        file.moveTo(folder)
    } catch (err) {
        Logger.log('ensureFileInFolder_ error: ' + err)
    }
}

function resolveTenantUploadFolder_(hint) {
    const root = getOrCreateRootFolder_()
    const uploads = getOrCreateFolder_(root, 'uploads')
    if (!hint) return uploads
    const lower = String(hint || '')
        .trim()
        .toLowerCase()
    var childName = null
    if (lower === 'petty-cash' || lower === 'pettycash') {
        childName = 'PettyCashReceipts'
    } else if (
        lower === 'menu' ||
        lower === 'menu-images' ||
        lower === 'menuimage'
    ) {
        childName = 'MenuImages'
    } else if (
        lower === 'inventory' ||
        lower === 'inventory-images' ||
        lower === 'inventoryimage'
    ) {
        childName = 'InventoryImages'
    } else if (lower.length) {
        childName = sanitizeDriveName_(hint, 'Misc')
    }
    return childName ? getOrCreateFolder_(uploads, childName) : uploads
}

function getOrCreateSpreadsheetInFolder_(folder, name) {
    if (!folder) folder = getOrCreateRootFolder_()
    const safeName = sanitizeDriveName_(name, 'Spreadsheet')
    const files = folder.getFilesByName(safeName)
    while (files.hasNext()) {
        const file = files.next()
        try {
            return SpreadsheetApp.openById(file.getId())
        } catch (err) {
            Logger.log(
                'getOrCreateSpreadsheetInFolder_: failed to open existing file: ' +
                    err
            )
        }
    }
    var ss = null
    try {
        const templateFile = DriveApp.getFileById(
            MONTH_TEMPLATE_SPREADSHEET_ID
        )
        const copiedFile = templateFile.makeCopy(safeName, folder)
        ss = SpreadsheetApp.openById(copiedFile.getId())
    } catch (copyErr) {
        Logger.log(
            'getOrCreateSpreadsheetInFolder_: failed copying template: ' +
                copyErr
        )
        ss = SpreadsheetApp.create(safeName)
        try {
            const newFile = DriveApp.getFileById(ss.getId())
            ensureFileInFolder_(newFile, folder)
        } catch (moveErr) {
            Logger.log(
                'getOrCreateSpreadsheetInFolder_: failed moving spreadsheet: ' +
                    moveErr
            )
        }
    }
    return ss
}

function findSpreadsheetInFolder_(folder, name) {
    if (!folder) return null
    const safeName = sanitizeDriveName_(name, 'Spreadsheet')
    const files = folder.getFilesByName(safeName)
    while (files.hasNext()) {
        const file = files.next()
        try {
            return SpreadsheetApp.openById(file.getId())
        } catch (err) {
            Logger.log('findSpreadsheetInFolder_ failed to open: ' + err)
        }
    }
    return null
}

function findFileByNameInFolder_(folder, name) {
    if (!folder) return null
    const safeName = sanitizeDriveName_(name, 'File')
    const files = folder.getFilesByName(safeName)
    return files.hasNext() ? files.next() : null
}

function acquireScriptLock_(timeoutMs) {
    const lock = LockService.getScriptLock()
    const ms = Math.max(1, Math.min(timeoutMs || 10000, 30000))
    lock.waitLock(ms)
    return lock
}

function getOrCreateSheet_(spreadsheet, sheetName) {
    if (!spreadsheet) throw new Error('Spreadsheet required')
    var sheet = spreadsheet.getSheetByName(sheetName)
    if (sheet) return sheet
    var template = spreadsheet.getSheetByName(DAY_TEMPLATE_SHEET_NAME)
    if (!template && LEGACY_DAY_TEMPLATE_SHEET_NAME) {
        template = spreadsheet.getSheetByName(LEGACY_DAY_TEMPLATE_SHEET_NAME)
    }
    if (template) {
        try {
            const copied = template.copyTo(spreadsheet)
            copied.setName(sheetName)
            return copied
        } catch (err) {
            Logger.log(
                'getOrCreateSheet_: copy from dayTemplate failed: ' + err
            )
        }
    }
    const sheets = spreadsheet.getSheets()
    if (sheets.length === 1 && sheets[0].getName() === 'Sheet1') {
        sheet = sheets[0]
        sheet.setName(sheetName)
        return sheet
    }
    return spreadsheet.insertSheet(sheetName)
}

function ensureSheetWithHeaders_(spreadsheet, sheetName, headers) {
    if (!spreadsheet) return null
    var sheet = spreadsheet.getSheetByName(sheetName)
    if (!sheet) {
        sheet = getOrCreateSheet_(spreadsheet, sheetName)
    }
    ensureHeadersRow_(sheet, headers)
    return sheet
}

function ensureHeadersRow_(sheet, headers) {
    if (!sheet || !headers || !headers.length) return
    setSheetPlainText_(sheet)
    const width = Math.max(sheet.getLastColumn(), headers.length)
    const currentMaxRows = sheet.getMaxRows()
    if (currentMaxRows < HEADER_ROW_INDEX) {
        sheet.insertRowsAfter(currentMaxRows, HEADER_ROW_INDEX - currentMaxRows)
    }
    const headerRange = sheet.getRange(HEADER_ROW_INDEX, 1, 1, width)
    const existing = headerRange.getValues()[0]
    var needsUpdate = sheet.getLastRow() < HEADER_ROW_INDEX
    for (var i = 0; i < headers.length && !needsUpdate; i++) {
        const current = String(existing[i] || '').trim()
        const desired = String(headers[i] || '').trim()
        if (!current && desired) {
            needsUpdate = true
            break
        }
        if (current && current !== desired) {
            needsUpdate = true
            break
        }
    }
    if (needsUpdate) {
        const row = new Array(width).fill('')
        for (var j = 0; j < headers.length; j++) {
            row[j] = String(headers[j] || '').trim()
        }
        headerRange.setValues([row])
    }
    try {
        if (sheet.getFrozenRows() < HEADER_ROW_INDEX) {
            sheet.setFrozenRows(HEADER_ROW_INDEX)
        }
    } catch (err) {}
}

function ensurePlainTextColumns_(sheet, columns) {
    if (!sheet || !columns || !columns.length) return
    const maxRows = Math.max(sheet.getMaxRows(), HEADER_ROW_INDEX)
    for (var i = 0; i < columns.length; i++) {
        const col = Number(columns[i])
        if (!col || col < 1) continue
        try {
            const rowCount = maxRows - HEADER_ROW_INDEX + 1
            if (rowCount > 0) {
                sheet
                    .getRange(HEADER_ROW_INDEX, col, rowCount)
                    .setNumberFormat('@')
            }
        } catch (err) {
            Logger.log(
                'ensurePlainTextColumns_ failed for column ' + col + ': ' + err
            )
        }
    }
}

function setSheetPlainText_(sheet) {
    if (!sheet) return
    try {
        const rows = Math.max(sheet.getMaxRows(), HEADER_ROW_INDEX)
        const cols = Math.max(sheet.getMaxColumns(), 1)
        const rowCount = rows - HEADER_ROW_INDEX + 1
        if (rowCount > 0) {
            sheet
                .getRange(HEADER_ROW_INDEX, 1, rowCount, cols)
                .setNumberFormat('@')
        }
    } catch (err) {
        Logger.log('setSheetPlainText_ failed: ' + err)
    }
}

function getTenantStateFolder_() {
    const root = getOrCreateRootFolder_()
    return getOrCreateFolder_(root, OPEN_TICKETS_STATE_FOLDER)
}

function getOpenTicketsFile_(folder) {
    if (!folder) return null
    const files = folder.getFilesByName(OPEN_TICKETS_FILE_NAME)
    return files.hasNext() ? files.next() : null
}

function readOpenTicketsState_() {
    try {
        const folder = getTenantStateFolder_()
        const file = getOpenTicketsFile_(folder)
        if (!file) return null
        const blob = file.getBlob()
        if (!blob) return null
        const content = blob.getDataAsString('utf-8')
        if (!content) return null
        const parsed = JSON.parse(content)
        if (!parsed || typeof parsed !== 'object') return null
        const tickets = Array.isArray(parsed.tickets) ? parsed.tickets : []
        const items = Array.isArray(parsed.items) ? parsed.items : []
        const updatedAt =
            typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
        return {
            ok: true,
            tickets: tickets,
            items: items,
            updatedAt: updatedAt,
        }
    } catch (err) {
        Logger.log('readOpenTicketsState_ error: ' + err)
        return null
    }
}

function writeOpenTicketsState_(data) {
    try {
        const folder = getTenantStateFolder_()
        const snapshot = {
            tenantId:
                (ACTIVE_TENANT_CONTEXT && ACTIVE_TENANT_CONTEXT.tenantId) || '',
            updatedAt:
                typeof data.updatedAt === 'number' && isFinite(data.updatedAt)
                    ? data.updatedAt
                    : Date.now(),
            tickets: Array.isArray(data.tickets) ? data.tickets : [],
            items: Array.isArray(data.items) ? data.items : [],
        }
        const json = JSON.stringify(snapshot)
        let file = getOpenTicketsFile_(folder)
        if (file) {
            file.setContent(json)
        } else {
            file = folder.createFile(
                OPEN_TICKETS_FILE_NAME,
                json,
                MimeType.PLAIN_TEXT
            )
        }
        return {
            ok: true,
            updatedAt: snapshot.updatedAt,
            ticketCount: snapshot.tickets.length,
        }
    } catch (err) {
        Logger.log('writeOpenTicketsState_ error: ' + err)
        return {
            ok: false,
            error: String(err && err.message ? err.message : err),
        }
    }
}

function saveOpenTicketsSnapshot_(payload) {
    if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'payload required' }
    }
    const tickets = Array.isArray(payload.tickets) ? payload.tickets : []
    const items = Array.isArray(payload.items) ? payload.items : []
    const updatedAt =
        typeof payload.updatedAt === 'number' && isFinite(payload.updatedAt)
            ? payload.updatedAt
            : Date.now()
    return writeOpenTicketsState_({
        tickets: tickets,
        items: items,
        updatedAt: updatedAt,
    })
}

function listOpenTickets_() {
    const state = readOpenTicketsState_()
    if (state && state.ok) return state
    if (state && !state.ok) return state
    return { ok: true, tickets: [], items: [], updatedAt: 0 }
}

function coerceDateTime_(raw) {
    if (raw === null || raw === undefined || raw === '') return ''
    if (raw instanceof Date) return raw
    var n = Number(raw)
    if (!isNaN(n) && isFinite(n) && n > 0) return new Date(n)
    try {
        var parsed = new Date(String(raw || ''))
        if (!isNaN(parsed.getTime())) return parsed
    } catch (err) {}
    return ''
}

function coerceNumber_(raw) {
    var n = Number(raw)
    return isNaN(n) || !isFinite(n) ? '' : n
}

function describeFolder_(folder) {
    if (!folder) return null
    try {
        const id = folder.getId()
        return {
            id: id,
            name: folder.getName(),
            url: 'https://drive.google.com/drive/folders/' + id,
        }
    } catch (err) {
        return null
    }
}

function appendRowWithinWidth_(sheet, width, rowValues) {
    if (!sheet) throw new Error('Sheet required')
    const targetWidth = Math.max(width, rowValues.length)
    const rowIndex = Math.max(sheet.getLastRow() + 1, DATA_START_ROW_INDEX)
    const out = new Array(targetWidth).fill('')
    for (var i = 0; i < rowValues.length; i++) {
        out[i] = rowValues[i]
    }
    sheet.getRange(rowIndex, 1, 1, targetWidth).setValues([out])
    return rowIndex
}

function getLastRowWithinWidth_(sheet, width) {
    if (!sheet) return HEADER_ROW_INDEX
    const last = sheet.getLastRow()
    if (last < DATA_START_ROW_INDEX) return HEADER_ROW_INDEX
    const readWidth = Math.max(width, sheet.getLastColumn())
    const dataRowCount = last - HEADER_ROW_INDEX
    if (dataRowCount <= 0) return HEADER_ROW_INDEX
    const values = sheet
        .getRange(DATA_START_ROW_INDEX, 1, dataRowCount, readWidth)
        .getValues()
    for (var i = values.length - 1; i >= 0; i--) {
        const row = values[i]
        var hasValue = false
        for (var j = 0; j < width; j++) {
            if (row[j] != null && String(row[j]).trim() !== '') {
                hasValue = true
                break
            }
        }
        if (hasValue) return i + DATA_START_ROW_INDEX
    }
    return HEADER_ROW_INDEX
}

function clockGetSecret_() {
    const props = PropertiesService.getScriptProperties()
    if (!props) return 'dev-secret'
    return (
        props.getProperty('CLOCK_SECRET') ||
        props.getProperty('clock.secret') ||
        props.getProperty('NEXT_PUBLIC_CLOCK_SECRET') ||
        'dev-secret'
    )
}

function clockToBase64Url_(input) {
    return String(input || '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
}

function clockBase64UrlToString_(input) {
    const normalized = String(input || '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
    const mod = normalized.length % 4
    var padding = ''
    if (mod > 0) {
        for (var i = 0; i < 4 - mod; i++) {
            padding += '='
        }
    }
    const padded = normalized + padding
    const bytes = Utilities.base64Decode(padded)
    return Utilities.newBlob(bytes).getDataAsString('utf-8')
}

function clockComputeSignature_(payloadJson, secret) {
    const raw = Utilities.computeHmacSha256Signature(payloadJson, secret)
    const base64 = Utilities.base64Encode(raw)
    return clockToBase64Url_(base64)
}

function clockTimingSafeEqual_(a, b) {
    const strA = String(a || '')
    const strB = String(b || '')
    const len = Math.max(strA.length, strB.length)
    var diff = strA.length ^ strB.length
    for (var i = 0; i < len; i++) {
        const codeA = i < strA.length ? strA.charCodeAt(i) : 0
        const codeB = i < strB.length ? strB.charCodeAt(i) : 0
        diff |= codeA ^ codeB
    }
    return diff === 0
}

function clockVerifyToken_(token, secret) {
    if (!token) throw new Error('token required')
    const parts = String(token || '').split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error('Invalid token format')
    }
    const payloadJson = clockBase64UrlToString_(parts[0])
    const signature = parts[1]
    const expectedSignature = clockComputeSignature_(payloadJson, secret)
    if (!clockTimingSafeEqual_(signature, expectedSignature)) {
        throw new Error('Invalid token signature')
    }
    var payload = null
    try {
        payload = JSON.parse(payloadJson)
    } catch (err) {
        throw new Error('Invalid token payload')
    }
    if (
        !payload ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number' ||
        !payload.nonce
    ) {
        throw new Error('Token missing required fields')
    }
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp <= now) {
        throw new Error('Token expired')
    }
    if (payload.iat > now + 60) {
        throw new Error('Token issued in the future')
    }
    return payload
}

function clockEnsureNonceUnused_(nonce, expSeconds) {
    if (!nonce) return
    const cache = CacheService.getScriptCache()
    const lock = LockService.getScriptLock()
    try {
        lock.waitLock(5000)
    } catch (err) {
        throw new Error('Unable to secure clock token nonce')
    }
    try {
        const key = 'clock_nonce_' + nonce
        if (cache && cache.get(key)) {
            throw new Error('Clock token already used')
        }
        const now = Math.floor(Date.now() / 1000)
        var ttl = expSeconds ? expSeconds - now : 30
        if (!ttl || ttl < 1) ttl = 30
        ttl = Math.max(1, Math.min(21600, ttl + 30))
        if (cache) cache.put(key, '1', ttl)
    } finally {
        lock.releaseLock()
    }
}

function appendEventRow_(sheet, data) {
    if (!sheet) return
    ensureHeadersRow_(sheet, EVENT_HEADERS)
    const width = Math.max(sheet.getLastColumn(), EVENT_HEADERS.length)
    const nextRowIndex = Math.max(sheet.getLastRow() + 1, DATA_START_ROW_INDEX)
    const now = new Date()
    const tz =
        (typeof Session !== 'undefined' &&
            Session &&
            typeof Session.getScriptTimeZone === 'function' &&
            Session.getScriptTimeZone()) ||
        'Etc/GMT'
    const eventData =
        data && typeof data === 'object' ? Object.assign({}, data) : {}
    if (
        eventData &&
        Object.prototype.hasOwnProperty.call(eventData, 'shiftId') &&
        !Object.prototype.hasOwnProperty.call(eventData, 'ShiftId')
    ) {
        eventData.ShiftId = eventData.shiftId
    }
    var dayValue =
        eventData && Object.prototype.hasOwnProperty.call(eventData, 'Day')
            ? eventData.Day
            : null
    if (!dayValue) {
        if (
            eventData &&
            Object.prototype.hasOwnProperty.call(eventData, 'date') &&
            eventData.date instanceof Date
        ) {
            dayValue = eventData.date
        } else {
            dayValue = now
        }
    } else if (!(dayValue instanceof Date)) {
        try {
            var parsedDay = new Date(dayValue)
            if (!isNaN(parsedDay.getTime())) dayValue = parsedDay
        } catch (err) {
            dayValue = now
        }
    }
    eventData.Day = dayValue
    if (
        !(
            eventData &&
            Object.prototype.hasOwnProperty.call(eventData, 'DayOfWeek') &&
            String(eventData.DayOfWeek || '').trim()
        )
    ) {
        try {
            eventData.DayOfWeek = Utilities.formatDate(
                dayValue instanceof Date ? dayValue : now,
                tz,
                'EEEE'
            )
        } catch (err) {
            eventData.DayOfWeek = ''
        }
    }
    var eventDateTime = now
    if (
        eventData &&
        Object.prototype.hasOwnProperty.call(eventData, 'date') &&
        eventData.date
    ) {
        if (eventData.date instanceof Date) eventDateTime = eventData.date
        else {
            const coerced = coerceDateTime_(eventData.date)
            if (coerced instanceof Date) eventDateTime = coerced
        }
    } else if (
        eventData &&
        Object.prototype.hasOwnProperty.call(eventData, 'ts') &&
        eventData.ts
    ) {
        const coercedTs = coerceDateTime_(eventData.ts)
        if (coercedTs instanceof Date) eventDateTime = coercedTs
    }
    const timestampString = Utilities.formatDate(
        eventDateTime,
        tz,
        'yyyy-MM-dd HH:mm:ss'
    )
    const hourForBlock = Number(Utilities.formatDate(eventDateTime, tz, 'HH'))
    const timeBlockStart = Math.floor(hourForBlock / 2) * 2
    const timeBlockEnd = timeBlockStart + 1
    const timeBlockLabel =
        pad2_(timeBlockStart) + ':00-' + pad2_(timeBlockEnd) + ':59'
    const row = new Array(width).fill('')
    for (var i = 0; i < EVENT_HEADERS.length; i++) {
        const key = EVENT_HEADERS[i]
        if (key === 'id') {
            row[i] =
                eventData &&
                Object.prototype.hasOwnProperty.call(eventData, 'id') &&
                eventData.id
                    ? eventData.id
                    : ''
        } else if (key === 'ts') {
            row[i] = timestampString
        } else if (key === 'timeBlock') {
            row[i] = timeBlockLabel
        } else if (
            eventData &&
            Object.prototype.hasOwnProperty.call(eventData, key)
        ) {
            row[i] = eventData[key]
        }
    }
    eventData.ts = timestampString
    eventData.timeBlock = timeBlockLabel
    const idIndex = EVENT_HEADERS.indexOf('id')
    if (idIndex >= 0) {
        const normalizeDigits = function (input) {
            if (!input) return ''
            const digits = String(input)
                .replace(/[^0-9]/g, '')
                .trim()
            return digits
        }
        var currentId = String(row[idIndex] || '').trim()
        if (!currentId) {
            var shiftDigits = normalizeDigits(
                eventData.shiftId || eventData.ShiftId || ''
            )
            if (!shiftDigits && eventData.ticketId) {
                const parts = String(eventData.ticketId || '').split('-')
                if (parts.length >= 1) {
                    shiftDigits = normalizeDigits(parts[0])
                }
            }
            var ticketDigits = normalizeDigits(eventData.ticketName || '')
            if (!ticketDigits && eventData.ticketId) {
                const parts = String(eventData.ticketId || '').split('-')
                if (parts.length >= 2) {
                    ticketDigits = normalizeDigits(
                        parts[parts.length - 1] || ''
                    )
                }
            }
            const rowDigits = String(nextRowIndex).padStart(2, '0')
            let shiftPart = ''
            let ticketPart = ''
            if (shiftDigits) {
                shiftPart = shiftDigits.slice(-3)
            }
            if (ticketDigits) {
                ticketPart = ticketDigits.slice(-3)
            } else if (eventData.ticketName || eventData.ticketId) {
                const ticketRaw = normalizeDigits(
                    eventData.ticketName || eventData.ticketId || ''
                )
                if (ticketRaw) ticketPart = ticketRaw.slice(-3)
            } else if (eventData.itemName) {
                const itemDigits = normalizeDigits(eventData.itemName)
                if (itemDigits) ticketPart = itemDigits.slice(-3)
            } else if (eventData.action) {
                const actionDigits = normalizeDigits(eventData.action)
                if (actionDigits) ticketPart = actionDigits.slice(-3)
            }
            const paddedShift = (shiftPart || '000').padStart(3, '0')
            const paddedTicket = (ticketPart || '000').padStart(3, '0')
            currentId = paddedShift + paddedTicket + rowDigits
            row[idIndex] = currentId
            eventData.id = currentId
        }
    }
    appendRowWithinWidth_(sheet, width, row)
}

function pad2_(value) {
    const n = Number(value)
    if (!isFinite(n)) return '00'
    const normalized = Math.abs(Math.floor(n))
    return normalized < 10 ? '0' + normalized : String(normalized)
}

function normalizeShiftIdentifier_(input, fallbackTicketId) {
    const raw = String(input || '').trim()
    var digits = raw.replace(/[^0-9]/g, '')
    if (!digits && fallbackTicketId) {
        const ticketPart = String(fallbackTicketId || '')
            .split('-')
            .shift()
        if (ticketPart) digits = String(ticketPart || '').replace(/[^0-9]/g, '')
    }
    if (digits) return digits.padStart(3, '0')
    return raw
}

function normalizeTicketName_(input, fallbackTicketId) {
    const raw = String(input || '').trim()
    var digits = raw.replace(/[^0-9]/g, '')
    if (!digits && fallbackTicketId) {
        const parts = String(fallbackTicketId || '').split('-')
        if (parts.length >= 2) {
            const suffix = parts[parts.length - 1] || ''
            digits = suffix.replace(/[^0-9]/g, '')
        }
    }
    if (digits) return digits.padStart(3, '0')
    return raw
}

function parseReportNumber_(raw) {
    if (raw === null || raw === undefined || raw === '') return 0
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0
    if (raw instanceof Date) return raw.getTime()
    const str = String(raw || '').trim()
    if (!str) return 0
    const normalized = str.replace(/[^0-9.\-]/g, '')
    if (!normalized) return 0
    const num = Number(normalized)
    return isNaN(num) || !isFinite(num) ? 0 : num
}

function jsonResponse_(body, status) {
    var output = ContentService.createTextOutput(
        JSON.stringify(body || {})
    ).setMimeType(ContentService.MimeType.JSON)
    if (typeof status === 'number' && output.setStatusCode) {
        try {
            output.setStatusCode(status)
        } catch (err) {}
    }
    return output
}

function sanitizeDriveName_(name, fallback) {
    const raw = String(name || '').trim()
    if (!raw) return fallback || 'Untitled'
    const sanitized = raw
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return sanitized || fallback || 'Untitled'
}

function buildTenantFolderName_(tenantId, accountEmail) {
    const label = accountEmail || tenantId || 'tenant'
    const safeLabel = sanitizeDriveName_(label, 'tenant')
    return tenantId ? tenantId + ' - ' + safeLabel : safeLabel
}

function buildTenantSpreadsheetName_(tenantId, accountEmail) {
    const label = accountEmail || tenantId || 'Tenant'
    const safe = sanitizeDriveName_(label, 'Tenant')
    return safe + ' Settings'
}
