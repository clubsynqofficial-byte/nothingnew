import { chromium } from 'playwright'

const SNAP_DIR = '/tmp/claude-1000/-home-abhxy-Desktop-spap2/018818e0-ccbf-4fc8-b7ca-47692521f11a/scratchpad'
const TID = 'a0d68c26-a354-43da-b01d-19ce44c35cbf'

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', msg => { if (msg.type() === 'error') console.log('[console-error]', msg.text()) })
page.on('pageerror', err => console.log('[pageerror]', err.message))

await page.goto(`http://localhost:5173/tournaments/${TID}/scoreboard`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${SNAP_DIR}/80-rt-before.png`, timeout: 15000, fullPage: true })
console.log('screenshot 1 taken — page left open, waiting for external DB change...')

// Keep this same page open for 12s while we make DB changes from another process
await page.waitForTimeout(12000)
await page.screenshot({ path: `${SNAP_DIR}/81-rt-after.png`, timeout: 15000, fullPage: true })
console.log('screenshot 2 taken')

await browser.close()
